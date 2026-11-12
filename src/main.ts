import './style.css';
import { CampScene } from './render/scene';
import { GRID, TUNING, buyMat, canPlace, cancelPlacing, clearSave, load, newGame, openGate, save, startPlacing, type GameState } from './sim/state';
import { baht, nextLang, t } from './i18n';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view');
const scene = new CampScene(canvas);
let state: GameState = load() ?? newGame();
let ghost: { x: number; z: number } | null = null;
let warn = false;

// Rin's portrait, drawn as original pixel art.
(() => {
  const c = $<HTMLCanvasElement>('portrait').getContext('2d')!;
  const px = (col: string, x: number, y: number, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  px('#3a4d57', 0, 0, 16, 16); px('#1b1512', 3, 1, 10, 5); px('#1b1512', 2, 4, 2, 8); px('#1b1512', 12, 4, 2, 8);
  px('#c98d63', 4, 4, 8, 8); px('#1b1512', 5, 7, 2, 1); px('#1b1512', 9, 7, 2, 1); px('#8f5a40', 7, 10, 2, 1);
  px('#c98d63', 6, 12, 4, 1); px('#597789', 2, 13, 12, 3); px('#f0e5cd', 7, 13, 2, 3);
})();

function commit(next: GameState) { state = next; save(state); render(); }

function render() {
  const L = state.lang; document.documentElement.lang = L === 'pt' ? 'pt-BR' : L;
  $('day').textContent = `${t(L, 'day')} ${state.day}`;
  $('cash').textContent = baht(L, state.cash);
  $('debt').textContent = `${baht(L, state.debt)} · ${t(L, 'debt', { n: state.debtDueDay - state.day })}`;
  $('lMorale').textContent = t(L, 'morale'); $('lPrestige').textContent = t(L, 'prestige');
  $('mMorale').style.width = state.morale + '%'; $('mPrestige').style.width = state.prestige + '%';
  $('lang').textContent = L.toUpperCase(); $('reset').textContent = t(L, 'reset');
  $('who').textContent = t(L, 'rin'); $('note').textContent = t(L, 'fictional');
  $('line').textContent = warn ? t(L, 'bad') : t(L, state.step);
  const costs = $('costs'), btns = $('btns'); costs.innerHTML = ''; btns.innerHTML = '';
  const add = (label: string, fn: () => void, cls = '', disabled = false) => {
    const b = document.createElement('button'); b.textContent = label; b.className = cls; b.disabled = disabled; b.onclick = fn; btns.appendChild(b);
  };
  if (state.step === 'gate') add(t(L, 'gateBtn'), () => commit(openGate(state)));
  if (state.step === 'walk') add(t(L, 'walkBtn'), () => { ghost = null; pinned = false; warn = false; commit(startPlacing(state)); });
  if (state.step === 'place') {
    costs.innerHTML = `<dt>${t(L, 'cost')}</dt><dd>${baht(L, TUNING.matCost)}</dd><dt>${t(L, 'after')}</dt><dd>${baht(L, state.cash - TUNING.matCost)}</dd>`;
    const ok = !!ghost && canPlace(state, ghost.x, ghost.z);
    add(t(L, 'confirm'), () => {
      if (!ghost) return;
      const r = buyMat(state, ghost.x, ghost.z);
      if (r.ok) { ghost = null; pinned = false; warn = false; state = r.state; save(state); scene.setFacilities(state.facilities, true); render(); }
      else { warn = true; render(); }
    }, '', !ok);
    add(t(L, 'back'), () => { ghost = null; pinned = false; warn = false; commit(cancelPlacing(state)); }, 'ghost');
  }
  scene.setGate(state.step !== 'gate');
  scene.setGhost(state.step === 'place' && ghost ? { ...ghost, w: TUNING.matW, d: TUNING.matD, valid: canPlace(state, ghost.x, ghost.z) } : null);
}

// A click or tap pins the mat; mouse hover only previews until then, so moving to the button keeps the spot.
let pinned = false;
function point(e: PointerEvent, pin: boolean) {
  if (state.step !== 'place') return;
  if (!pin && pinned) return;
  const cell = scene.pickCell(e.clientX, e.clientY); if (!cell) return;
  // Centre the footprint on the pointer and keep it inside the floor.
  const x = Math.max(0, Math.min(GRID.w - TUNING.matW, cell.x - 1)), z = Math.max(0, Math.min(GRID.d - TUNING.matD, cell.z));
  if (pin) pinned = true;
  if (ghost && ghost.x === x && ghost.z === z) return;
  ghost = { x, z }; warn = !canPlace(state, x, z); render();
}
canvas.addEventListener('pointerdown', e => point(e, true));
canvas.addEventListener('pointermove', e => { if (e.buttons) point(e, true); else if (e.pointerType === 'mouse') point(e, false); });
$('lang').onclick = () => commit({ ...state, lang: nextLang(state.lang) });
$('reset').onclick = () => { const lang = state.lang; clearSave(); ghost = null; pinned = false; warn = false; state = newGame(lang); scene.setFacilities([]); scene.setGate(false, true); save(state); render(); };

new ResizeObserver(() => scene.resize()).observe(canvas);
scene.setGate(state.step !== 'gate', true);
scene.setFacilities(state.facilities);
render();
