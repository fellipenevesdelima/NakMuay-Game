import './style.css';
import { CampScene, SPRITES, type ActorSpec } from './render/scene';
import * as G from './sim/state';
import type { GameState, Instruction, School } from './sim/state';
import { baht, nextLang, num, t } from './i18n';
import { SHEETS } from './assets/anim';
import ringUrl from './assets/ring.webp';
import kaewUrl from './assets/kaew.webp';
import fahUrl from './assets/fah.webp';
import locBangkok from './assets/loc_bangkok.webp';
import locPhuket from './assets/loc_phuket.webp';
import locChiangmai from './assets/loc_chiangmai.webp';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
type Child = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { cls?: string } = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); const { cls, ...rest } = props as any; if (cls) e.className = cls; Object.assign(e, rest);
  for (const k of kids) if (k) e.append(k); return e;
}
const canvas = $<HTMLCanvasElement>('view');
const scene = new CampScene(canvas);
const stage = $('stage'); const LOC_IMG: Record<string, string> = { bangkok: locBangkok, phuket: locPhuket, chiangmai: locChiangmai };
const ALL_SPRITES: Record<string, string> = { ...SPRITES, kaew: kaewUrl, fah: fahUrl };
($('stageImg') as HTMLImageElement).src = ringUrl;

let state: GameState = G.load() ?? G.newGame();
let ghost: { x: number; z: number } | null = null; let pinned = false; let warn = false; let busy = false; let first = true;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Portraits are cropped from each character's own sprite, so face and figure always match.
const imgs = new Map<string, HTMLImageElement>();
function portrait(cv: HTMLCanvasElement, id: string) {
  cv.width = cv.height = 48; const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
  const draw = (im: HTMLImageElement) => { c.fillStyle = '#3a4d57'; c.fillRect(0, 0, 48, 48); const s = im.width * 0.86; c.drawImage(im, (im.width - s) / 2, 0, s, s, 0, 0, 48, 48); };
  let im = imgs.get(id); if (im?.complete && im.naturalWidth) return draw(im);
  if (!im) { im = new Image(); im.src = ALL_SPRITES[G.lookOf(id)] ?? ALL_SPRITES.rin; imgs.set(id, im); }
  im.addEventListener('load', () => draw(im!), { once: true });
}
let audio: AudioContext | null = null;
function bell() { // synthesised ring bell; only ever called from a click
  try {
    audio ??= new AudioContext(); const now = audio.currentTime;
    for (const [f, g] of [[880, 0.22], [1318, 0.12], [1760, 0.07]]) {
      const o = audio.createOscillator(), a = audio.createGain(); o.frequency.value = f; o.type = 'sine';
      a.gain.setValueAtTime(g, now); a.gain.exponentialRampToValueAtTime(0.0001, now + 1.6); o.connect(a).connect(audio.destination); o.start(now); o.stop(now + 1.7);
    }
  } catch { /* audio unavailable */ }
}

/** Plays a sprite sheet on a ring fighter. `right` is the way the fighter must look. */
function fighterAnim(el: HTMLElement, key: string, right: boolean) {
  const sh = SHEETS[key]; if (!sh || el.dataset.key === key) return; el.dataset.key = key;
  el.style.backgroundImage = `url(${sh.url})`; el.style.backgroundSize = `${sh.frames * 100}% 100%`;
  el.style.height = `${11.5 * sh.h / 150}%`; el.style.aspectRatio = `${sh.w} / ${sh.h}`;
  el.style.scale = (sh.face === 'L') === right ? '-1 1' : '1 1';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = reduced ? 'none' : `sheet .88s steps(${sh.frames}, jump-none) infinite`;
}
function commit(next: GameState) { state = next; G.save(state); render(); }
const L = () => state.lang;
const T = (k: string, v: Record<string, string | number> = {}) => t(L(), k, v);
const B = (n: number) => baht(L(), n);
/** Words that always carry the same colour, wherever they show up: resources, attributes, career. */
const TERMS: [string, string][] = [['fans', 'fans'], ['respect', 'respect'], ['mood', 'mood'], ['g_tech', 'tech'], ['g_clinch', 'clinch'], ['g_power', 'power'], ['g_cardio', 'cardio'], ['lifeLbl', 'life'], ['fatigue', 'warn'], ['tiredLbl', 'warn'], ['credLbl', 'respect']];
const termOf = (text: string) => { const low = text.toLowerCase(); return TERMS.find(([k]) => low.includes(T(k).toLowerCase()))?.[1] ?? ''; };
/** Sets text with status words and money in their colours. Builds nodes, never HTML strings. */
function paint(el: HTMLElement, text: string) {
  const words = TERMS.map(([k, c]) => [T(k).toLowerCase(), c] as [string, string]).sort((a, b) => b[0].length - a[0].length);
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`([−+-]?฿[\\d.,]*\\d|[+−]\\d+(?= )|${words.map(w => esc(w[0])).join('|')})`, 'gi');
  el.replaceChildren(...text.split(re).filter(x => x !== '').map(part => {
    const low = part.toLowerCase(), w = words.find(x => x[0] === low);
    const cls = w ? w[1] : /^[−-]/.test(part) ? 'bad' : /฿/.test(part) ? 'cash' : /^\+/.test(part) ? 'good' : '';
    return cls ? h('span', { cls: 'c-' + cls }, part) : part;
  }));
}
/** Good, attention or danger for anything measured on a wear-like scale. */
const st = (v: number, warn = 40, bad = 70) => (v >= bad ? 'red' : v >= warn ? 'warn' : 'good');
const kv = (rows: [string, string, string?][]) => h('dl', { cls: 'kv' }, ...rows.flatMap(([k, v, c]) => [h('dt', { cls: termOf(k) ? 'c-' + termOf(k) : '' }, k), h('dd', { cls: c || (/^−฿/.test(v) ? 'red' : '') }, v)]));
const ICON: Record<string, string> = {
  time: 'M3 5h18v15H3z M3 9h18 M8 3v4 M16 3v4', cash: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7v10 M9.5 9.5h4a1.7 1.7 0 0 1 0 3.4h-3a1.7 1.7 0 0 0 0 3.4h4',
  fans: 'M8 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M16 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M2 20c0-4 3-6 6-6s6 2 6 6 M14 14c4-1 8 1 8 6', respect: 'M3 8l4 4l5-7l5 7l4-4l-2 11H5z',
  mood: 'M12 21c5 0 8-3.5 8-8c0-3-2-5-3-7c-1 2-2 3-3 3c0-3-1-5-4-7c0 4-6 6-6 11c0 4.5 3 8 8 8z',
  week: 'M3 5h18v15H3z M3 9h18 M8 3v4 M16 3v4', coach: 'M6 9a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v5a5 5 0 0 1-5 5H9a3 3 0 0 1-3-3z M6 12H4', roster: 'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21c0-5 4-7 8-7s8 2 8 7',
  rin: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M15.5 8.5l-2 5l-5 2l2-5z', offers: 'M4 4l16 16 M20 4L4 20', camp: 'M3 11l9-7l9 7 M5 10v10h14V10 M10 20v-6h4v6',
};
function icon(k: string) { const ns = 'http://www.w3.org/2000/svg', v = document.createElementNS(ns, 'svg'); v.setAttribute('viewBox', '0 0 24 24'); v.setAttribute('class', 'ic'); const pth = document.createElementNS(ns, 'path'); pth.setAttribute('d', ICON[k]); v.append(pth); return v; }
const seen: Record<string, number> = {}; let hint: string | null = null, menuOpen = false, resetSure = false;
/** A number in the top bar. When it changes, the difference flashes in the colour of gain or loss. */
function stat(id: string, k: string, text: string, value?: number) {
  const el = $(id); el.replaceChildren(icon(k), h('b', {}, text)); el.setAttribute('aria-label', `${T('st_' + k)} ${text}`);
  if (value !== undefined) { const was = seen[id]; seen[id] = value;
    if (was !== undefined && was !== value) { const d = value - was; el.append(h('i', { cls: 'delta ' + (d > 0 ? 'up' : 'down') }, (d > 0 ? '+' : '−') + (k === 'cash' ? num(L(), Math.abs(d)) : Math.abs(d)))); } }
}

const coach = () => state.staff[0]; const coachName = () => (coach() ? G.nameOf(coach().id) : G.nameOf('rin'));
const spk = () => coach()?.id ?? 'rin';
function title(text: string, spriteId?: string) { const t3 = h('h3'); if (spriteId) { const cv = h('canvas'); portrait(cv, spriteId); t3.append(cv); } t3.append(text); return t3; }

function actors(): ActorSpec[] {
  const s = state, m = s.facilities[0], list: ActorSpec[] = [];
  const order: G.Step[] = ['intro', 'locations', 'gate', 'walk', 'place', 'coach', 'scout', 'away', 'report', 'roster', 'school', 'morning', 'summary', 'offer', 'camp', 'weighin', 'fight', 'result', 'hub', 'season'];
  const at = (st: G.Step) => order.indexOf(s.step) >= order.indexOf(st);
  if (at('gate')) list.push({ id: 'rin', x: 6.4, z: 6.6, outside: s.step === 'gate', away: s.step === 'away' || (!!s.manager.mission && at('hub')) });
  if (m) {
    const train = s.step === 'summary' || s.step === 'camp' || s.step === 'hub';
    // a tired trainer holds pads more slowly; whoever rests waits off the mat
    s.staff.forEach((c, i) => list.push({ id: c.id, role: 'coach', x: Math.min(m.x + 3.6, 9.4), z: m.z + 0.6 + i * 0.9, work: train && !c.absent, away: c.absent, tempo: 1 - Math.max(0, c.fatigue - 30) / 160 }));
    s.fighters.forEach((f, i) => list.push({ id: f.id, look: G.lookOf(f.id), role: 'fighter', x: Math.max(0.5, m.x - 0.8 - (i % 2) * 0.7), z: Math.min(6.4, m.z + 0.4 + i * 0.8), work: train && (f.plan !== 'rest' || s.fight?.fighterId === f.id), lead: s.fight?.fighterId === f.id }));
  }
  return list;
}

function render() {
  const s = state, lang = L(); document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  const inHub = s.step === 'hub' || s.step === 'camp' || s.step === 'season';
  stat('sTime', 'time', inHub ? T('hudTime', { s: s.seasonNo, w: Math.min(s.seasonWeek + 1, G.SEASON.weeks) }) : `${T('day')} ${s.day}`);
  stat('sCash', 'cash', B(s.cash), s.cash); stat('sFans', 'fans', String(s.fans), s.fans); stat('sRespect', 'respect', String(s.respect), s.respect); stat('sMood', 'mood', String(s.mood), s.mood);
  $('hint').hidden = !hint; if (hint) paint($('hint'), T('hint_' + hint));
  $('menu').hidden = !menuOpen; $('lang').textContent = T('langBtn', { l: lang.toUpperCase() }); $('reset').textContent = T(resetSure ? 'resetSure' : 'reset'); $('reset').className = resetSure ? 'danger on' : 'danger'; $('note').textContent = T('fictional');
  // an alert only when something needs doing
  const al: string[] = [];
  if (inHub && s.step !== 'season') {
    const due = G.monthlyPayroll(s) + G.installment(s);
    if (s.wageDay - s.day <= 7 && s.cash < due) al.push(T('al_payroll', { v: B(due - s.cash) }));
    for (const c of s.staff) if (c.fatigue >= G.TRAINER.strainAt) al.push(T('al_trainer', { n: G.nameOf(c.id) }));
    if (!s.fight) for (const o of s.offers) if (o.expiresDay - s.day <= 7) al.push(T('al_offer', { n: G.nameOf(o.fighterId) }));
  }
  $('alerts').replaceChildren(...al.map(a => { const e = h('p', {}); paint(e, a); return e; }));
  const body = $('body'), btns = $('btns'); body.replaceChildren(); btns.replaceChildren();
  const btn = (label: string, fn: () => void, cls = '', disabled = false) => { const b = h('button', { textContent: label, className: cls, disabled }); b.onclick = () => { if (!busy) fn(); }; btns.append(b); return b; };
  let speaker = 'rin', line = '';

  // which backdrop
  const onStage = ['intro', 'locations', 'weighin', 'fight', 'result'].includes(s.step);
  stage.hidden = !onStage; stage.classList.toggle('dimmed', s.step === 'locations' || s.step === 'result' || s.step === 'weighin');
  const showF = s.step === 'fight' || s.step === 'result'; $('app').classList.toggle('fighting', showF); $('app').classList.toggle('hub', s.step === 'hub' || s.step === 'camp'); $('fA').hidden = $('fB').hidden = !showF;
  if (showF && s.fight && !busy) { fighterAnim($('fA'), G.lookOf(s.fight.fighterId) + '_guard', true); fighterAnim($('fB'), s.fight.opp.look + '_guard', false); }
  if (!busy) { stage.classList.toggle('idle', showF); stage.classList.remove('clash'); }

  switch (s.step) {
    case 'intro': line = T('intro'); btn(T('introBtn'), () => commit(G.visitLocations(s))); break;
    case 'locations': {
      line = T('locations', { v: B(s.cash) });
      body.append(h('div', { cls: 'cards' }, ...G.REGIONS.map(r => h('div', { cls: 'card' + (r.open ? '' : ' off') },
        h('img', { cls: 'thumb', src: LOC_IMG[r.id], alt: '' }), title(T('loc_' + r.id)), h('p', {}, T('locd_' + r.id)),
        kv([[T('price'), B(r.price)], [T('left'), B(s.cash - r.price), 'gold']]),
        h('button', { textContent: r.open ? T('buy', { n: T('loc_' + r.id) }) : T('soon'), disabled: !r.open, onclick: () => { const x = G.buyProperty(state, r.id); if (x.ok) commit(x.state); } })))));
      break;
    }
    case 'gate': line = T('gate'); btn(T('gateBtn'), () => commit(G.openGate(s))); break;
    case 'walk': line = T('walk'); btn(T('walkBtn'), () => { ghost = null; pinned = false; warn = false; commit(G.startPlacing(s)); }); break;
    case 'place': {
      line = warn ? T('bad') : T('place');
      body.append(kv([[T('payNow'), B(G.TUNING.matCost)], [T('after'), B(s.cash - G.TUNING.matCost), 'gold']]));
      btn(T('confirm'), () => { if (!ghost) return; const r = G.buyMat(state, ghost.x, ghost.z); if (r.ok) { ghost = null; pinned = false; warn = false; commit(r.state); } else { warn = true; render(); } }, '', !(ghost && G.canPlace(s, ghost.x, ghost.z)));
      btn(T('back'), () => { ghost = null; pinned = false; warn = false; commit(G.cancelPlacing(s)); }, 'ghost');
      break;
    }
    case 'coach': {
      line = T('coach');
      body.append(h('div', { cls: 'cards' }, ...G.COACHES.map(c => h('div', { cls: 'card' }, title(c.name, c.id),
        h('p', {}, `${T('spec_' + c.specialty)} · ${T('avail_' + c.id)}`),
        kv([[T('payNow'), B(c.signing)], [T('monthly'), B(c.wage)], [T('after'), B(s.cash - c.signing), 'gold']]),
        h('button', { textContent: T('hire', { n: c.name }), disabled: s.cash < c.signing, onclick: () => { const r = G.hireCoach(state, c.id); if (r.ok) commit(r.state); } })))));
      break;
    }
    case 'scout': {
      line = T('scout');
      body.append(h('div', { cls: 'cards' }, ...G.TRIPS.map(tr => h('div', { cls: 'card' }, title(T('trip_' + tr.id)), h('p', {}, T('sees_' + tr.source)),
        kv([[T('duration'), T('days', { n: tr.days })], [T('cost'), B(tr.cost)], [T('after'), B(s.cash - tr.cost), 'gold']]),
        h('button', { textContent: T('send'), disabled: s.cash < tr.cost, onclick: () => { const r = G.sendScout(state, tr.id); if (r.ok) commit(r.state); } })))));
      break;
    }
    case 'away': speaker = spk(); line = T('away', { n: s.scout!.returnDay, coach: coachName() }); btn(T('wait'), () => commit(G.waitForScout(s))); break;
    case 'report': {
      const src = G.TRIPS.find(x => x.id === s.scout?.tripId)!.source; line = T('report_' + src);
      body.append(h('div', { cls: 'cards' }, ...G.PROSPECTS.map(p => {
        const e = G.estimate(s, p.id), signed = s.fighters.some(f => f.id === p.id), no = s.declined.includes(p.id);
        return h('div', { cls: 'card' }, title(p.name, p.id),
          kv([[T('age'), String(p.age)], [T('weightClass'), `${p.weightKg} kg · ${T('div_' + p.sex)}`], [T('walk'), num(lang, p.walkKg) + ' kg'], [T('style'), T('style_' + p.style)], [T('record'), p.record], [T('origin'), p.origin],
            [T('potential'), `${e.low}–${e.high}`], [T('confidence'), T('conf_' + e.confidence)]]),
          kv([[T('payNow'), B(p.signing)], [T('monthly'), B(p.stipend)], [T('purseAsk'), p.purseSharePct + '%'], [T('after'), B(s.cash - p.signing), 'gold']]),
          signed ? h('p', { cls: 'ok' }, T('signed')) : no ? h('p', { cls: 'no' }, T('refused_' + p.id)) :
            h('button', { textContent: T('offer', { n: p.name }), disabled: s.cash < p.signing, onclick: () => { const r = G.offerContract(state, p.id); if (r.ok) commit(r.state); else if (r.reason === 'declined') commit(G.recordRefusal(state, p.id)); } }));
      })), h('p', { cls: 'small' }, T('rights')));
      btn(T('close'), () => commit(G.closeReport(s)), s.fighters.length ? '' : 'ghost');
      break;
    }
    case 'roster':
      if (s.fighters.length) { speaker = spk(); line = T('roster', { names: s.fighters.map(f => G.nameOf(f.id)).join(', ') }); btn(T('rosterBtn'), () => commit(G.planTraining(s))); }
      else { line = T('rosterNone'); btn(T('again'), () => commit(G.searchAgain(s))); }
      break;
    case 'school': {
      speaker = spk(); line = T(s.fighters.length > 1 ? 'school2' : 'school1');
      body.append(h('div', { cls: 'cards' }, ...(['balanced', 'technical', 'clinch'] as School[]).map(k => h('div', { cls: 'card' }, title(T('sch_' + k)), h('p', {}, T('schd_' + k)),
        h('button', { textContent: T('choose'), onclick: () => commit(G.chooseSchool(state, k)) })))));
      break;
    }
    case 'morning': speaker = spk(); line = T('morning', { school: T('sch_' + s.school), coach: coachName() });
      btn(T('morningBtn'), () => commit(G.runMorning(s))); btn(T('change'), () => commit(G.reopenSchool(s)), 'ghost'); break;
    case 'summary': {
      speaker = spk(); line = T('summary');
      body.append(h('div', { cls: 'cards' }, ...s.lastSession.map(l => { const f = s.fighters.find(f => f.id === l.fighterId)!;
        return h('div', { cls: 'card' }, title(G.nameOf(l.fighterId), l.fighterId), h('p', {}, T(l.activity === 'clinch' && s.lastSession.filter(x => x.activity === 'clinch').length < 2 ? 'act_clinch1' : 'act_' + l.activity)),
          h('p', { cls: 'ok' }, Object.entries(l.gains).filter(([, v]) => v).map(([k, v]) => `+${v} ${T('g_' + k)}`).join(' · ')),
          kv([[T('fatigue'), `${f.fatigue}/100` + (f.fatigue >= 70 ? ` · ${T('rest')}` : ''), f.fatigue >= 70 ? 'red' : '']])); })));
      btn(T('summaryBtn'), () => commit(G.seeOffer(s))); break;
    }
    case 'offer': {
      speaker = spk(); const f = G.offeredFighter(s), name = G.nameOf(f.id), c = s.contracts.find(c => c.fighterId === f.id)!, o = G.opponentFor(f.id), pr = G.PROSPECTS.find(p => p.id === f.id)!;
      if (!G.fighterAccepts(f)) { line = T('offerTired', { name }); btn(T('restBtn'), () => commit(G.restDay(s))); break; }
      const lose = G.settlementPreview(s, false), win = G.settlementPreview(s, true);
      line = T('offer1', { n: G.TUNING.campWeeks, name });
      body.append(kv([[T('opponent'), `${o.name} (${o.record})`], [T('weightClass'), `${pr.weightKg} kg · ${T('div_' + pr.sex)}`], [T('purse'), B(lose.purse)], [T('winBonus'), B(G.TUNING.winBonus)],
        [T('athleteShare', { n: name, p: c.purseSharePct }), B(lose.share)], [T('travel'), B(-lose.travel)],
        [T('netLose'), B(lose.net), lose.net < 0 ? 'red' : 'gold'], [T('netWin'), B(win.net), 'gold'],
        [T('nextWages'), `${B(G.monthlyPayroll(s))} · ${T('day')} ${s.wageDay}`, 'red'], [T('after'), B(s.cash + lose.net)]]));
      btn(T('accept'), () => { const r = G.acceptOffer(state); if (r.ok) commit(r.state); }); btn(T('decline'), () => commit(G.declineOffer(s)), 'ghost'); break;
    }
    case 'hub': case 'camp': { const r = renderHub(body, btn); line = r.line; speaker = r.speaker; break; }
    case 'weighin': {
      speaker = spk(); const f = s.fight!, w = f.weighIn!, name = G.nameOf(f.fighterId);
      const c = Math.round(w.chance * 100) + '%';
      line = w.made ? T('weighMade', { name, kg: f.limitKg, c }) : T('weighMissed', { name, over: num(lang, w.overKg), fine: B(w.fine), opp: G.opponentOf(f).name, c });
      if (f.campLog.length) body.append(h('p', { cls: 'small' }, f.campLog.map(l => T('lastWeek', { n: l.week, plan: T('wk_' + l.plan), by: T('by_' + l.by) })).join(' ')));
      btn(T('enterRing'), () => commit(G.enterRing(s))); break;
    }
    case 'fight': { speaker = spk(); line = renderFight(body, btn); break; }
    case 'result': {
      speaker = spk(); const f = s.fight!, name = G.nameOf(f.fighterId), c = s.contracts.find(c => c.fighterId === f.fighterId)!;
      line = T('res_' + f.outcome + (f.ko ? '_ko' : ''), { name }); const me = s.fighters.find(x => x.id === f.fighterId)!;
      const tb = h('table', { cls: 'cardsT' }, h('tr', {}, h('th', {}, ''), h('th', {}, name), h('th', {}, G.opponentOf(f).name)), ...f.totals.map((x, i) => h('tr', {}, h('td', {}, T('judge', { n: i + 1 })), h('td', {}, String(x[0])), h('td', {}, String(x[1])))));
      const purse = f.purse + (f.outcome === 'win' ? f.winBonus : 0), share = Math.round(purse * c.purseSharePct / 100), fine = f.weighIn?.fine ?? 0, net = purse - share - f.travel - fine;
      body.append(f.ko ? '' : tb, h('p', { cls: 'lbl' }, T('settlement')), kv([[T('purse'), B(purse)], [T('athleteShare', { n: name, p: c.purseSharePct }), B(-share)], [T('travel'), B(-f.travel)], ...(fine ? [[T('weightFine'), B(-fine), 'red'] as [string, string, string]] : []), [T('net'), B(net), net < 0 ? 'red' : 'gold']]));
      if (f.bets.length) body.append(h('p', { cls: 'small' }, T('betResult', { stake: B(f.bets.reduce((a, b) => a + b.stake, 0)), back: B(G.betPayout(f)) })));
      body.append(kv([[T('lifeAfter', { name }), T('seasonsU', { a: num(lang, me.life), b: num(lang, me.lifeMax) }), me.life <= 1.5 ? 'red' : ''], [T('fans'), String(s.fans)], [T('respect'), String(s.respect)]]));
      btn(T('resultBtn'), () => { tab = 'week'; commit(G.finish(s)); }); break;
    }
    case 'season': {
      const r = s.seasonReport!; line = T('seasonEnd', { n: r.season, i: B(r.income), o: B(r.spent) });
      body.append(h('div', { cls: 'cards' }, ...r.rows.map(x => h('div', { cls: 'card' }, title(G.nameOf(x.id), x.id),
        h('p', {}, T('seasonRow', { a: num(lang, x.lifeBefore), b: num(lang, x.life), w: num(lang, x.walkKg) })), x.decayed ? h('p', { cls: 'no' }, T('decayed')) : null))));
      btn(T('seasonBtn', { n: r.season + 1 }), () => { tab = 'week'; commit(G.nextSeason(s)); }); break;
    }
  }
  paint($('line'), line); body.querySelectorAll<HTMLElement>('p').forEach(e => { if (e.childElementCount === 0) paint(e, e.textContent ?? ''); }); body.querySelectorAll<HTMLElement>('button.quiet').forEach(e => { if (e.childElementCount === 0) paint(e, e.textContent ?? ''); });
  $('who').textContent = speaker === 'rin' ? T('rin') : `${G.nameOf(speaker)}, ${T('coachRole')}`;
  portrait($<HTMLCanvasElement>('portrait'), speaker);

  scene.setGate(!['intro', 'locations', 'gate'].includes(s.step), first);
  scene.setFacilities(s.facilities, !first);
  scene.setActors(actors(), first);
  scene.setGhost(s.step === 'place' && ghost ? { ...ghost, w: G.TUNING.matW, d: G.TUNING.matD, valid: G.canPlace(s, ghost.x, ghost.z) } : null);
  first = false;
}

function renderFight(body: HTMLElement, btn: (label: string, fn: () => void, cls?: string, disabled?: boolean) => HTMLButtonElement): string {
  const s = state, f = s.fight!, name = G.nameOf(f.fighterId), opp = G.opponentOf(f).name, last = f.log[f.log.length - 1], n = f.log.length;
  const v = { name, opp }; let line: string;
  if (!last) line = `${T('preFight', v)} ${T('crowdLine', { a: f.attendance, c: f.capacity, name })}`;
  else {
    const key = last.margin > 10 ? 'n_win_clear' : last.margin > 0 ? 'n_win_close' : last.margin > -10 ? 'n_lose_close' : 'n_lose_clear';
    line = f.outcome ? T(f.ko ? 'koDone' : 'allDone') : `${T(key, v)}${last.energy < 40 ? ' ' + T('n_tired', v) : ''}`;
  }
  body.append(h('p', { cls: 'lbl' }, f.outcome ? T('round', { n: f.log.length, t: f.rounds }) : T('round', { n: n + 1, t: f.rounds })));
  body.append(h('div', { cls: 'bars' },
    h('label', {}, h('span', {}, name), h('i', {}, h('b', { style: `width:${f.energy}%` } as any))),
    h('label', { cls: 'opp' }, h('span', {}, opp), h('i', {}, h('b', { style: `width:${f.oppEnergy}%` } as any)))));
  if (last) {
    const lead = f.log.reduce((a, l) => a + l.margin, 0);
    body.append(h('p', { cls: 'small' }, `${T(lead > 6 ? 'corner_ahead' : lead < -6 ? 'corner_behind' : 'corner_even')} ${T('crowd_' + last.crowd, v)}`));
  }
  body.append(kv([[T('odds', { name }), f.odds.toFixed(2), 'gold']]));
  if (f.outcome) { btn(T('hear'), () => commit(G.settleFight(state))); return line; }
  // corner instruction for the coming round
  body.append(h('p', { cls: 'lbl' }, T('nextIns')), h('div', { cls: 'seg' }, ...(['keep', 'conserve', 'pace'] as Instruction[]).map(k =>
    h('button', { textContent: T('ins_' + k), ariaPressed: String(f.next === k), onclick: () => { if (!busy) commit(G.setInstruction(state, k)); } } as any))));
  // fictional betting: an independent choice that never touches the fight engine
  const tog = h('input', { type: 'checkbox', checked: s.adultBetting, onchange: () => commit(G.setAdultBetting(state, tog.checked)) });
  body.append(h('label', { cls: 'toggle' }, tog, T('betOff')));
  if (s.adultBetting) {
    const mine = f.bets.find(b => b.afterRound === n);
    body.append(mine ? h('p', { cls: 'ok' }, T('betPlaced', { v: B(mine.stake), o: mine.odds.toFixed(2) })) :
      h('div', { cls: 'seg' }, ...[500, 1000, 2000].map(st => h('button', { textContent: T('bet', { v: B(st) }), disabled: st > s.cash, onclick: () => { if (busy) return; const r = G.placeBet(state, st); if (r.ok) commit(r.state); } }))),
      h('p', { cls: 'small' }, T('betNote')));
  }
  btn(T('gong', { n: n + 1 }), () => {
    bell(); busy = true; stage.classList.remove('idle'); stage.classList.add('clash');
    fighterAnim($('fA'), G.lookOf(state.fight!.fighterId) + '_attack', true); setTimeout(() => fighterAnim($('fB'), state.fight!.opp.look + '_attack', false), 440); document.querySelectorAll<HTMLButtonElement>('#drawer button').forEach(b => (b.disabled = true));
    setTimeout(() => { busy = false; commit(G.simulateRound(state)); }, reduced ? 0 : 1900);
  });
  btn(T('delegate'), () => commit(G.delegateRest(state)), 'ghost');
  return line;
}

const openSec = new Set<string>(); const touched = new Set<string>();
/** A collapsible block. It opens by itself when it has something to say, and remembers what the player did with it. */
function sect(id: string, label: string, auto: boolean) {
  const d = h('details', { cls: 'sect' }); d.open = touched.has(id) ? openSec.has(id) : auto;
  d.append(h('summary', {}, label));
  d.addEventListener('toggle', () => { touched.add(id); if (d.open) openSec.add(id); else openSec.delete(id); });
  return d;
}
type Tab = 'week' | 'coach' | 'roster' | 'rin' | 'offers' | 'camp';
let tab: Tab = 'week'; let sure: string | null = null;
const pct = (x: number) => Math.round(x * 100) + '%';
const money = (now: number, monthly: number): [string, string, string?][] => [[T('payNow'), B(now)], [T('monthly'), B(monthly)], [T('after'), B(state.cash - now), 'gold']];
const act = (r: G.Result) => { if (r.ok) commit(r.state); };

/** The camp between fights and during a fight camp: one screen, six tabs, one week per decision. */
function renderHub(body0: HTMLElement, btn: (label: string, fn: () => void, cls?: string, disabled?: boolean) => HTMLButtonElement): { line: string; speaker: string } {
  const s = state, lang = L(), f = s.fight, lv = G.LEVELS[s.level - 1]; let line = '', speaker = spk(), body = body0;
  const dots: Partial<Record<Tab, number>> = { offers: f ? 0 : s.offers.length, rin: s.candidates.length + s.sponsorOffers.length, coach: s.staff.length === 0 ? 1 : s.staff.filter(c => c.fatigue >= G.TRAINER.strainAt).length };
  body.append(h('div', { cls: 'tabs' }, ...(['week', 'coach', 'roster', 'rin', 'offers', 'camp'] as Tab[]).map(k => { const b = h('button', { ariaPressed: String(tab === k), onclick: () => { tab = k; sure = null; render(); } } as any, icon(k) as any, T('tab_' + k), dots[k] ? h('span', { cls: 'dot' }, String(dots[k])) : null); b.dataset.tab = k; return b; })));
  const evName = (v: string | number) => (typeof v === 'number' ? v : G.SPONSORS.some(x => x.id === v) ? T('sp_' + v) : G.nameOf(v));
  const lifeBar = (x: G.Fighter) => h('div', { cls: 'life' + (x.life <= G.SEASON.lowLife ? ' low' : '') }, h('span', {}, `${T('lifeLbl')}: ${T('seasonsU', { a: num(lang, x.life), b: num(lang, x.lifeMax) })}`), h('i', {}, h('b', { style: `width:${x.life / x.lifeMax * 100}%` } as any)));

  if (tab === 'week') {
    const pay = G.monthlyPayroll(s) + G.installment(s);
    line = s.seasonNo === 1 && s.seasonWeek === 0 && !f ? T('hubIntro') : T('hubLine', { s: s.seasonNo, w: Math.min(s.seasonWeek + 1, G.SEASON.weeks), n: G.SEASON.weeks, pay: B(pay), d: s.wageDay });
    if (f) body.append(h('p', { cls: 'tag' }, T('bookedT', { name: G.nameOf(f.fighterId), opp: f.opp.name, d: f.day })));
    if (s.lastWeek.events.length || s.lastWeek.tourists) body.append(h('p', { cls: 'small' }, [s.lastWeek.tourists ? T('lastWeekT', { t: s.lastWeek.tourists, v: B(s.lastWeek.income) }) : '', ...s.lastWeek.events.map(e => T(e.key, { n: evName(e.v.n) }))].filter(Boolean).join(' ')));
    if (f) {
      // fight camp: this week's plan for the athlete with a bout booked
      const name = G.nameOf(f.fighterId), me = s.fighters.find(x => x.id === f.fighterId)!, left = G.weeksLeft(f), final = left === 1, prev = f.campLog[f.campLog.length - 1];
      line = final ? T('campFinal', { name, w: me.fatigue }) : T('camp', { i: f.campLog.length + 1, n: f.campWeeks, name, d: f.day, kg: f.limitKg, walk: num(lang, me.walkKg) });
      if (prev) body.append(h('p', { cls: 'small' }, T('lastWeek', { n: prev.week, plan: T('wk_' + prev.plan), by: T('by_' + prev.by) })));
      body.append(h('div', { cls: 'bars' }, ...(['tech', 'clinch', 'power', 'cardio'] as const).map(k => h('label', { cls: 'a-' + k }, h('span', {}, `${T('g_' + k)} ${me[k]}`), h('i', {}, h('b', { style: `width:${me[k]}%` } as any)))),
        h('label', { cls: 'a-' + st(me.fatigue) }, h('span', {}, `${T('fatigue')} ${me.fatigue}`), h('i', {}, h('b', { style: `width:${me.fatigue}%` } as any)))));
      const plans = final ? (['sharpen', 'rest'] as const) : (['hard', 'moderate', 'light'] as const), pick = G.coachPick(s);
      body.append(h('div', { cls: 'cards' }, ...plans.map(k => { const pv = G.previewWeek(s, k), g = Object.entries(pv.gains).filter(([, v]) => v).map(([a, v]) => `+${v} ${T('g_' + a)}`).join(' · ');
        return h('div', { cls: 'card' }, title(T('wk_' + k)), h('p', {}, T('wkd_' + k)),
          kv([[T('gainsLbl'), g || T('none')], [T('wearAfter'), `${pv.fatigueAfter}/100`, st(pv.fatigueAfter)],
            ...(final ? [[T('missRisk'), pct(G.missWeightChance({ ...s, fight: { ...f, wearBeforeFinal: me.fatigue } }, k as G.FinalPlan)), st(G.missWeightChance({ ...s, fight: { ...f, wearBeforeFinal: me.fatigue } }, k as G.FinalPlan), 0.15, 0.3)] as [string, string, string]] : [])]),
          k === pick && coach() ? h('p', { cls: 'tag' }, `${coachName()}: ✓`) : null,
          h('button', { textContent: T('runWeek'), onclick: () => act(G.runCampWeek(state, k)) })); })));
      if (final) body.append(h('p', { cls: 'small' }, T('missNote', { p: G.TUNING.weighFinePct })));
    }
    // trainer load, before the week is confirmed
    const ld = G.loads(s); let over = false; const top = body; body = sect('load', T('secLoad'), ld.some(l => l.people > l.capacity) || !s.staff.length);
    for (const c of s.staff) { const l = ld.find(x => x.id === c.id)!; const o = l.people > l.capacity; over ||= o;
      body.append(h('div', { cls: 'load' + (o ? ' over' : '') }, h('span', {}, `${T('loadLbl', { n: G.nameOf(c.id), p: num(lang, l.people), c: l.capacity })} · ${c.absent ? T('absentNow') : T('fatigueT', { v: c.fatigue })}`), h('i', {}, h('b', { style: `width:${Math.min(100, l.people / l.capacity * 100)}%` } as any)))); }
    if (!s.staff.length) body.append(h('p', { cls: 'no' }, T('noTrainer')));
    if (over) body.append(h('p', { cls: 'no' }, T('overNote')));
    body.append(kv([[T('yieldLbl'), pct(G.trainerEff(s)), st(1 - G.trainerEff(s), 0.1, 0.3)], [T('scaleLbl'), '+' + pct(G.scaleRisk(s)), st(G.scaleRisk(s), 0.03, 0.1)]]));
    top.append(body); body = sect('tour', `${T('touristsT')}: ${G.touristsNow(s)}`, false);
    // tourists: places, price, what comes in
    const tr = s.tourism, n = G.touristsNow(s);
    const stepBtn = (d: number) => h('button', { textContent: d < 0 ? '−' : '+', disabled: tr.slots + d < 0 || tr.slots + d > G.TOURISM.maxSlots, onclick: () => commit(G.setTourism(state, tr.slots + d, tr.price)) });
    body.append(h('div', { cls: 'step' }, h('span', {}, T('slotsLbl')), stepBtn(-1), h('b', {}, String(tr.slots)), stepBtn(1)),
      h('div', { cls: 'seg' }, ...(['low', 'normal', 'high'] as G.Price[]).map(k => h('button', { textContent: `${T('price_' + k)} ${B(G.TOURISM.price[k].fee)}`, ariaPressed: String(tr.price === k), onclick: () => commit(G.setTourism(state, tr.slots, k)) } as any))),
      kv([[T('demandLbl'), T('peopleU', { n: G.demand(s) })], [T('entering'), T('peopleU', { n })], [T('weekIncome'), B(n * G.TOURISM.price[tr.price].fee), 'gold']]));
    top.append(body); body = sect('bills', T('secBills', { v: B(pay) }), false);
    body.append(kv([[T('payrollLbl'), B(-G.monthlyPayroll(s))], [T('instLbl'), B(-G.installment(s))], [T('dueLbl'), T('dayN', { d: s.wageDay })], [T('debtLbl'), B(s.debt), 'red'], [T('after'), B(s.cash - pay), s.cash - pay < 0 ? 'red' : 'gold']]));
    top.append(body); body = top;
    if (f) {
      const final = G.weeksLeft(f) === 1;
      btn(T('coachWeek'), () => act(G.runCampWeek(state, 'coach')), 'ghost');
      if (!final) btn(T('autoCamp'), () => commit(G.automateCamp(state)), 'ghost');
    } else btn(T('weekBtn'), () => act(G.runWeek(state)));
  }

  else if (tab === 'coach') {
    line = T('hubLine', { s: s.seasonNo, w: Math.min(s.seasonWeek + 1, G.SEASON.weeks), n: G.SEASON.weeks, pay: B(G.monthlyPayroll(s) + G.installment(s)), d: s.wageDay });
    const ld = G.loads(s);
    body.append(h('div', { cls: 'cards' }, ...s.staff.map(c => { const l = ld.find(x => x.id === c.id)!;
      return h('div', { cls: 'card' }, title(G.nameOf(c.id), c.id), h('p', {}, T('spec_' + c.specialty)),
        kv([[T('levelLbl'), String(c.level)], [T('capacityLbl'), `${num(lang, l.people)} / ${l.capacity}`, l.people > l.capacity ? 'red' : ''], [T('tiredLbl'), `${c.fatigue}/100`, st(c.fatigue, 30, 60)],
          [T('reliability'), `${c.reliability}/100`, st(100 - c.reliability, 30, 50)], [T('wageLbl'), B(c.wage)]]),
        h('p', { cls: 'small' }, T('kratomNote')),
        h('button', { cls: 'quiet', textContent: c.kratomNow ? T('kratomUsed') : T('kratomBtn', { v: B(G.TRAINER.kratomCost), r: Math.min(c.fatigue, G.kratomRelief(c)) }), disabled: c.kratomNow || s.cash < G.TRAINER.kratomCost || c.fatigue === 0, onclick: () => act(G.useKratom(state, c.id)) }),
        h('p', { cls: 'small' }, T('raiseNote')),
        h('button', { cls: 'quiet', textContent: c.raises >= G.TRAINER.maxRaises ? T('raiseMax') : T('raiseBtn', { v: B(G.TRAINER.raiseWage) }), disabled: c.raises >= G.TRAINER.maxRaises, onclick: () => act(G.giveRaise(state, c.id)) })); })));
    const others = G.COACHES.filter(c => !s.staff.some(x => x.id === c.id));
    if (!s.staff.length) body.append(h('p', { cls: 'no' }, T('noTrainer')));
    if (s.staff.length < lv.trainers) body.append(h('div', { cls: 'cards' }, ...others.map(c => h('div', { cls: 'card' }, title(c.name, c.id), h('p', {}, T('spec_' + c.specialty)), kv(money(c.signing, c.wage)),
      h('button', { textContent: T('hire', { n: c.name }), disabled: s.cash < c.signing, onclick: () => act(G.hireTrainer(state, c.id)) }), s.cash < c.signing ? h('p', { cls: 'no' }, T('noCash')) : null))));
    else body.append(h('p', { cls: 'small' }, T('hireSlots', { a: s.staff.length, b: lv.trainers })));
  }

  else if (tab === 'roster') {
    line = s.fighters.length ? T('retireNote') : T('noRoster');
    body.append(h('p', { cls: 'small' }, `${T('rosterSlots', { a: s.fighters.length, b: lv.fighters })}${s.alumni.length ? ' · ' + T('alumniLbl', { n: s.alumni.map(a => `${G.nameOf(a.id)} (${a.record})`).join(', ') }) : ''}`));
    body.append(h('div', { cls: 'cards' }, ...s.fighters.map(x => { const name = G.nameOf(x.id), cut = G.cutPct(x.walkKg, x.classKg), busy2 = f?.fighterId === x.id;
      return h('div', { cls: 'card' }, title(`${name} · ${x.record.w}-${x.record.l}${x.record.d ? '-' + x.record.d : ''}`, x.id), lifeBar(x),
        kv([[T('age'), String(x.age)], [T('levelLbl'), String(x.level)], [T('cutLbl'), T('cutV', { p: num(lang, Math.round(cut * 10) / 10), w: num(lang, x.walkKg), c: num(lang, x.classKg) }), cut >= G.LIFE.severeCutPct ? 'red' : ''],
          [T('g_tech'), String(x.tech), 'c-tech'], [T('g_clinch'), String(x.clinch), 'c-clinch'], [T('g_power'), String(x.power), 'c-power'], [T('g_cardio'), String(x.cardio), 'c-cardio'], [T('fatigue'), `${x.fatigue}/100`, st(x.fatigue)],
          [T('streakLbl'), String(x.streak), x.streak >= 2 ? 'red' : ''], [T('kosLbl'), String(x.kos), x.kos ? 'red' : ''], [T('spiritLbl'), String(x.spirit)], [T('credLbl'), String(x.cred)]]),
        busy2 ? h('p', { cls: 'tag' }, T('inFightCamp')) : h('div', { cls: 'seg' }, ...(['train', 'rest'] as const).map(k => h('button', { textContent: T('plan_' + k), ariaPressed: String(x.plan === k), onclick: () => commit(G.setPlan(state, x.id, k)) } as any))),
        busy2 ? null : h('button', { cls: sure === x.id ? 'danger on' : 'danger', textContent: T(sure === x.id ? 'retireSure' : 'retireBtn', { n: name }), onclick: () => { if (sure === x.id) { sure = null; act(G.retire(state, x.id)); } else { sure = x.id; render(); } } })); })));
  }

  else if (tab === 'rin') {
    speaker = 'rin'; const m = s.manager.mission;
    line = m ? T('rinAway', { k: T('mis_' + m.kind), d: m.returnDay }) : T('rinHome');
    if (s.candidates.length) body.append(h('p', { cls: 'lbl' }, T('candidatesT')), h('div', { cls: 'cards' }, ...s.candidates.map(id => { const p = G.PROSPECTS.find(p => p.id === id)!, e = G.appraise(s, id);
      const why = p.level > lv.maxFighterLevel ? T('refusesLevel', { n: p.name, l: e.needsLevel }) : s.fighters.length >= lv.fighters ? T('rosterFull') : p.needsClinchCoach && !s.staff.some(c => c.specialty === 'clinch') ? T('refusesCoach', { n: p.name }) : '';
      return h('div', { cls: 'card' }, title(p.name, p.id),
        kv([[T('age'), String(p.age)], [T('levelLbl'), String(p.level)], [T('needsLevel'), String(e.needsLevel), e.needsLevel > s.level ? 'red' : ''], [T('weightClass'), `${p.weightKg} kg · ${T('div_' + p.sex)}`], [T('walk'), num(lang, p.walkKg) + ' kg'], [T('style'), T('style_' + p.style)], [T('record'), p.record],
          [T('potential'), `${e.low}–${e.high}`], [T('lifeLbl'), T('seasonsU', { a: p.life, b: p.life })]]),
        kv([...money(p.signing, p.stipend), [T('purseAsk'), p.purseSharePct + '%']]),
        why || s.cash < p.signing ? h('p', { cls: 'no' }, why || T('noCash')) : h('button', { textContent: T('offer', { n: p.name }), onclick: () => act(G.signCandidate(state, id)) })); })), h('p', { cls: 'small' }, T('rights')));
    const sps = [...s.sponsors.map(x => ({ id: x.id, active: x.monthsLeft })), ...s.sponsorOffers.map(id => ({ id, active: 0 }))];
    if (sps.length) body.append(h('p', { cls: 'lbl' }, T('sponsorsT')), h('div', { cls: 'cards' }, ...sps.map(x => { const sp = G.SPONSORS.find(y => y.id === x.id)!, needFans = (sp as any).minFans as number | undefined;
      return h('div', { cls: 'card' }, title(T('sp_' + sp.id)), h('p', {}, `${T('spTerms', { v: B(sp.monthly), m: sp.months })}. ${needFans ? T('spNeedFans', { n: needFans }) : T('spNeed', { n: sp.minFights })}.`),
        x.active ? h('p', { cls: 'ok' }, T('spActive', { m: x.active })) : h('button', { textContent: T('spSign'), disabled: !!needFans && s.fans < needFans, onclick: () => act(G.signSponsor(state, sp.id)) })); })));
    if (!m) body.append(h('div', { cls: 'cards' }, ...(Object.keys(G.MISSIONS) as G.MissionKind[]).map(k => { const x = G.MISSIONS[k];
      return h('div', { cls: 'card' }, title(T('mis_' + k)), h('p', {}, T('misd_' + k)), kv([[T('duration'), T('weeksU', { n: x.weeks })], [T('payNow'), B(x.cost)], [T('after'), B(s.cash - x.cost), 'gold']]),
        h('button', { textContent: T('send'), disabled: s.cash < x.cost, onclick: () => act(G.sendManager(state, k)) }), s.cash < x.cost ? h('p', { cls: 'no' }, T('noCash')) : null); })));
  }

  else if (tab === 'offers') {
    line = f ? T('bookedT', { name: G.nameOf(f.fighterId), opp: f.opp.name, d: f.day }) : s.offers.length ? T('hubLine', { s: s.seasonNo, w: Math.min(s.seasonWeek + 1, G.SEASON.weeks), n: G.SEASON.weeks, pay: B(G.monthlyPayroll(s) + G.installment(s)), d: s.wageDay }) : T('noOffers');
    body.append(h('div', { cls: 'cards' }, ...s.offers.map(o => { const x = s.fighters.find(y => y.id === o.fighterId)!, name = G.nameOf(o.fighterId), c = s.contracts.find(c => c.fighterId === o.fighterId)!, lose = G.offerPreview(s, o, false), win = G.offerPreview(s, o, true), tired = x.fatigue >= 70;
      return h('div', { cls: 'card' }, title(T('offerFor', { name, opp: o.opp.name }), o.fighterId),
        kv([[T('opponent'), `${o.opp.name} (${o.opp.record})`], [T('weightClass'), `${x.classKg} kg · ${T('div_' + x.sex)}`], [T('campWeeksLbl'), String(o.campWeeks)], [T('purse'), B(o.purse)], [T('winBonus'), B(o.winBonus)],
          [T('athleteShare', { n: name, p: c.purseSharePct }), B(-lose.share)], [T('travel'), B(-o.travel)], [T('netLose'), B(lose.net), lose.net < 0 ? 'red' : 'gold'], [T('netWin'), B(win.net), 'gold'], [T('fatigue'), `${x.fatigue}/100`, st(x.fatigue)]]),
        h('p', { cls: 'small' }, T('expires', { d: o.expiresDay })),
        f ? h('p', { cls: 'no' }, T('oneFight')) : tired ? h('p', { cls: 'no' }, T('tiredNo', { name })) : h('button', { textContent: T('accept'), disabled: s.cash < o.travel, onclick: () => { tab = 'week'; act(G.takeOffer(state, o.id)); } })); })));
  }

  else {
    const c = G.levelCheck(s); line = T('lvlNow', { n: s.level, name: T('lvl_' + s.level) });
    body.append(kv([[T('trainersSlots'), T('ofU', { a: s.staff.length, b: lv.trainers })], [T('fightersSlots'), T('ofU', { a: s.fighters.length, b: lv.fighters })], [T('cashCap'), Number.isFinite(lv.cashCap) ? B(lv.cashCap) : '∞', s.cash > lv.cashCap * 0.9 ? 'red' : '']]), h('p', { cls: 'small' }, T('capNote')));
    if (c) {
      body.append(h('p', { cls: 'lbl' }, T('nextLvl', { name: T('lvl_' + c.next.level) })),
        kv([[T('reqFans'), `${c.fans ? '✓' : '✗'} ${T('ofU', { a: s.fans, b: c.next.fans })}`, c.fans ? 'gold' : 'red'], [T('reqWins'), `${c.goal ? '✓' : '✗'} ${T('ofU', { a: s.wins, b: c.next.goalWins })}`, c.goal ? 'gold' : 'red'],
          [T('reqCost'), `${c.cash ? '✓' : '✗'} ${B(c.next.cost)}`, c.cash ? 'gold' : 'red'], [T('after'), B(s.cash - c.next.cost)],
          [T('trainersSlots'), `${lv.trainers} → ${c.next.trainers}`], [T('fightersSlots'), `${lv.fighters} → ${c.next.fighters}`], [T('cashCap'), `${B(lv.cashCap)} → ${B(c.next.cashCap)}`]]), h('p', { cls: 'small' }, T('upNote')));
      btn(T('upBtn'), () => act(G.levelUp(state)), '', !(c.fans && c.goal && c.cash) || !!f);
    } else body.append(h('p', { cls: 'small' }, T('lvlLater')));
  }
  return { line, speaker };
}

// A click or tap pins the mat; mouse hover only previews until then, so moving to the button keeps the spot.
function point(e: PointerEvent, pin: boolean) {
  if (state.step !== 'place') return;
  if (!pin && pinned) return;
  const cell = scene.pickCell(e.clientX, e.clientY); if (!cell) return;
  const x = Math.max(0, Math.min(G.GRID.w - G.TUNING.matW, cell.x - 1)), z = Math.max(0, Math.min(G.GRID.d - G.TUNING.matD, cell.z));
  if (pin) pinned = true;
  if (ghost && ghost.x === x && ghost.z === z) return;
  ghost = { x, z }; warn = !G.canPlace(state, x, z); render();
}
canvas.addEventListener('pointerdown', e => point(e, true));
canvas.addEventListener('pointermove', e => { if (e.buttons) point(e, true); else if (e.pointerType === 'mouse') point(e, false); });
function reset() { tab = 'week'; sure = null; for (const k in seen) delete seen[k]; const lang = state.lang; G.clearSave(); ghost = null; pinned = false; warn = false; busy = false; first = true; state = G.newGame(lang); G.save(state); render(); }
$('lang').onclick = () => { if (!busy) commit({ ...state, lang: nextLang(state.lang) }); };
$('reset').onclick = () => { if (busy) return; if (!resetSure) { resetSure = true; render(); return; } resetSure = false; menuOpen = false; reset(); };
$('menuBtn').onclick = () => { menuOpen = !menuOpen; resetSure = false; hint = null; render(); };
document.querySelectorAll<HTMLElement>('#hud .stat').forEach(b => { b.onclick = () => { hint = hint === b.dataset.k ? null : b.dataset.k!; menuOpen = false; render(); }; });

new ResizeObserver(() => scene.resize()).observe(canvas);
render();
