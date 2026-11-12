import './style.css';
import { CampScene, SPRITES, type ActorSpec } from './render/scene';
import * as G from './sim/state';
import type { GameState, Instruction, School } from './sim/state';
import { baht, nextLang, num, t } from './i18n';
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
  if (!im) { im = new Image(); im.src = ALL_SPRITES[id]; imgs.set(id, im); }
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

function commit(next: GameState) { state = next; G.save(state); render(); }
const L = () => state.lang;
const T = (k: string, v: Record<string, string | number> = {}) => t(L(), k, v);
const B = (n: number) => baht(L(), n);
const kv = (rows: [string, string, string?][]) => h('dl', { cls: 'kv' }, ...rows.flatMap(([k, v, c]) => [h('dt', {}, k), h('dd', { cls: c ?? '' }, v)]));
const coach = () => state.staff[0]; const coachName = () => (coach() ? G.nameOf(coach().id) : '');
function title(text: string, spriteId?: string) { const t3 = h('h3'); if (spriteId) { const cv = h('canvas'); portrait(cv, spriteId); t3.append(cv); } t3.append(text); return t3; }

function actors(): ActorSpec[] {
  const s = state, m = s.facilities[0], list: ActorSpec[] = [];
  const order: G.Step[] = ['intro', 'locations', 'gate', 'walk', 'place', 'coach', 'scout', 'away', 'report', 'roster', 'school', 'morning', 'summary', 'offer', 'camp', 'weighin', 'fight', 'result', 'end'];
  const at = (st: G.Step) => order.indexOf(s.step) >= order.indexOf(st);
  if (at('walk')) list.push({ id: 'rin', x: 5, z: 1.9, away: s.step === 'away' });
  if (m) {
    const train = s.step === 'summary' || s.step === 'camp';
    if (coach()) list.push({ id: coach().id, x: Math.min(m.x + 3.5, 11.4), z: m.z + 1, busy: train });
    s.fighters.forEach((f, i) => list.push({ id: f.id, x: m.x + 0.6 + i * 0.95, z: m.z + 1.2 - (i % 2) * 0.5, busy: train }));
  }
  return list;
}

function render() {
  const s = state, lang = L(); document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  $('day').textContent = `${T('day')} ${s.day}`; $('cash').textContent = B(s.cash);
  $('debt').textContent = `${B(s.debt)} · ${T('debt', { n: Math.max(0, s.debtDueDay - s.day) })}`;
  const pay = G.monthlyPayroll(s); $('payroll').hidden = pay === 0; $('payroll').textContent = T('payroll', { v: B(pay), d: s.wageDay });
  $('lMorale').textContent = T('morale'); $('lPrestige').textContent = T('prestige');
  $('mMorale').style.width = s.morale + '%'; $('mPrestige').style.width = s.prestige + '%';
  $('lang').textContent = lang.toUpperCase(); $('reset').textContent = T('reset'); $('note').textContent = T('fictional');
  const body = $('body'), btns = $('btns'); body.replaceChildren(); btns.replaceChildren();
  const btn = (label: string, fn: () => void, cls = '', disabled = false) => { const b = h('button', { textContent: label, className: cls, disabled }); b.onclick = () => { if (!busy) fn(); }; btns.append(b); return b; };
  let speaker = 'rin', line = '';

  // which backdrop
  const onStage = ['intro', 'locations', 'weighin', 'fight', 'result'].includes(s.step);
  stage.hidden = !onStage; stage.classList.toggle('dimmed', s.step === 'locations' || s.step === 'result' || s.step === 'weighin');
  const showF = s.step === 'fight' || s.step === 'result'; $('app').classList.toggle('fighting', showF); $('fA').hidden = $('fB').hidden = !showF;
  if (showF && s.fight) { ($('fA') as HTMLImageElement).src = ALL_SPRITES[s.fight.fighterId]; ($('fB') as HTMLImageElement).src = ALL_SPRITES[s.fight.opponentId]; }
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
    case 'away': speaker = coach().id; line = T('away', { n: s.scout!.returnDay, coach: coachName() }); btn(T('wait'), () => commit(G.waitForScout(s))); break;
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
      if (s.fighters.length) { speaker = coach().id; line = T('roster', { names: s.fighters.map(f => G.nameOf(f.id)).join(', ') }); btn(T('rosterBtn'), () => commit(G.planTraining(s))); }
      else { line = T('rosterNone'); btn(T('again'), () => commit(G.searchAgain(s))); }
      break;
    case 'school': {
      speaker = coach().id; line = T(s.fighters.length > 1 ? 'school2' : 'school1');
      body.append(h('div', { cls: 'cards' }, ...(['balanced', 'technical', 'clinch'] as School[]).map(k => h('div', { cls: 'card' }, title(T('sch_' + k)), h('p', {}, T('schd_' + k)),
        h('button', { textContent: T('choose'), onclick: () => commit(G.chooseSchool(state, k)) })))));
      break;
    }
    case 'morning': speaker = coach().id; line = T('morning', { school: T('sch_' + s.school), coach: coachName() });
      btn(T('morningBtn'), () => commit(G.runMorning(s))); btn(T('change'), () => commit(G.reopenSchool(s)), 'ghost'); break;
    case 'summary': {
      speaker = coach().id; line = T('summary');
      body.append(h('div', { cls: 'cards' }, ...s.lastSession.map(l => { const f = s.fighters.find(f => f.id === l.fighterId)!;
        return h('div', { cls: 'card' }, title(G.nameOf(l.fighterId), l.fighterId), h('p', {}, T('act_' + l.activity)),
          h('p', { cls: 'ok' }, Object.entries(l.gains).filter(([, v]) => v).map(([k, v]) => `+${v} ${T('g_' + k)}`).join(' · ')),
          kv([[T('fatigue'), `${f.fatigue}/100` + (f.fatigue >= 70 ? ` · ${T('rest')}` : ''), f.fatigue >= 70 ? 'red' : '']])); })));
      btn(T('summaryBtn'), () => commit(G.seeOffer(s))); break;
    }
    case 'offer': {
      speaker = coach().id; const f = G.offeredFighter(s), name = G.nameOf(f.id), c = s.contracts.find(c => c.fighterId === f.id)!, o = G.opponentFor(f.id), pr = G.PROSPECTS.find(p => p.id === f.id)!;
      if (!G.fighterAccepts(f)) { line = T('offerTired', { name }); btn(T('restBtn'), () => commit(G.restDay(s))); break; }
      const lose = G.settlementPreview(s, false), win = G.settlementPreview(s, true);
      line = T('offer1', { n: G.TUNING.campWeeks, name });
      body.append(kv([[T('opponent'), `${o.name} (${o.record})`], [T('weightClass'), `${pr.weightKg} kg · ${T('div_' + pr.sex)}`], [T('purse'), B(lose.purse)], [T('winBonus'), B(G.TUNING.winBonus)],
        [T('athleteShare', { n: name, p: c.purseSharePct }), B(lose.share)], [T('travel'), B(-lose.travel)],
        [T('netLose'), B(lose.net), lose.net < 0 ? 'red' : 'gold'], [T('netWin'), B(win.net), 'gold'],
        [T('nextWages'), `${B(G.monthlyPayroll(s))} · ${T('day')} ${s.wageDay}`, 'red'], [T('after'), B(s.cash + lose.net)]]));
      btn(T('accept'), () => { const r = G.acceptOffer(state); if (r.ok) commit(r.state); }); btn(T('decline'), () => commit(G.declineOffer(s)), 'ghost'); break;
    }
    case 'camp': {
      speaker = coach().id; const f = s.fight!, name = G.nameOf(f.fighterId), pr = G.PROSPECTS.find(p => p.id === f.fighterId)!, me = s.fighters.find(x => x.id === f.fighterId)!;
      const left = G.weeksLeft(f), final = left === 1, pct = (x: number) => Math.round(x * 100) + '%', prev = f.campLog[f.campLog.length - 1];
      line = final ? T('campFinal', { name, w: me.fatigue }) : T('camp', { i: f.campLog.length + 1, n: f.campWeeks, name, d: f.day, kg: f.limitKg, walk: num(lang, pr.walkKg) });
      if (prev) body.append(h('p', { cls: 'small' }, T('lastWeek', { n: prev.week, plan: T('wk_' + prev.plan), by: T('by_' + prev.by) })));
      body.append(h('div', { cls: 'bars' }, ...(['tech', 'clinch', 'power', 'cardio'] as const).map(k => h('label', { cls: 'opp' }, h('span', {}, `${T('g_' + k)} ${me[k]}`), h('i', {}, h('b', { style: `width:${me[k]}%` } as any)))),
        h('label', {}, h('span', {}, `${T('fatigue')} ${me.fatigue}`), h('i', {}, h('b', { style: `width:${me.fatigue}%` } as any)))));
      const plans = final ? (['sharpen', 'rest'] as const) : (['hard', 'moderate', 'light'] as const), pick = G.coachPick(s);
      body.append(h('div', { cls: 'cards' }, ...plans.map(k => { const pv = G.previewWeek(s, k), g = Object.entries(pv.gains).filter(([, v]) => v).map(([a, v]) => `+${v} ${T('g_' + a)}`).join(' · ');
        return h('div', { cls: 'card' }, title(T('wk_' + k)), h('p', {}, T('wkd_' + k)),
          kv([[T('gainsLbl'), g || T('none')], [T('wearAfter'), `${pv.fatigueAfter}/100`, pv.fatigueAfter >= 60 ? 'red' : ''],
            ...(final ? [[T('missRisk'), pct(G.missWeightChance({ ...s, fight: { ...f, wearBeforeFinal: me.fatigue } }, k as G.FinalPlan)), 'gold'] as [string, string, string]] : [])]),
          k === pick ? h('p', { cls: 'tag' }, `${coachName()}: ✓`) : null,
          h('button', { textContent: T('runWeek'), onclick: () => { const r = G.runCampWeek(state, k); if (r.ok) commit(r.state); } })); })));
      if (final) body.append(h('p', { cls: 'small' }, T('missNote', { p: G.TUNING.weighFinePct })));
      btn(T('coachWeek'), () => { const r = G.runCampWeek(state, 'coach'); if (r.ok) commit(r.state); }, 'ghost');
      if (!final) btn(T('autoCamp'), () => commit(G.automateCamp(state)), 'ghost');
      break;
    }
    case 'weighin': {
      speaker = coach().id; const f = s.fight!, w = f.weighIn!, name = G.nameOf(f.fighterId);
      const c = Math.round(w.chance * 100) + '%';
      line = w.made ? T('weighMade', { name, kg: f.limitKg, c }) : T('weighMissed', { name, over: num(lang, w.overKg), fine: B(w.fine), opp: G.opponentOf(f).name, c });
      if (f.campLog.length) body.append(h('p', { cls: 'small' }, f.campLog.map(l => T('lastWeek', { n: l.week, plan: T('wk_' + l.plan), by: T('by_' + l.by) })).join(' ')));
      btn(T('enterRing'), () => commit(G.enterRing(s))); break;
    }
    case 'fight': { speaker = coach().id; line = renderFight(body, btn); break; }
    case 'result': {
      speaker = coach().id; const f = s.fight!, name = G.nameOf(f.fighterId), c = s.contracts.find(c => c.fighterId === f.fighterId)!;
      line = T('res_' + f.outcome, { name });
      const tb = h('table', { cls: 'cardsT' }, h('tr', {}, h('th', {}, ''), h('th', {}, name), h('th', {}, G.opponentOf(f).name)), ...f.totals.map((x, i) => h('tr', {}, h('td', {}, T('judge', { n: i + 1 })), h('td', {}, String(x[0])), h('td', {}, String(x[1])))));
      const purse = f.purse + (f.outcome === 'win' ? f.winBonus : 0), share = Math.round(purse * c.purseSharePct / 100), fine = f.weighIn?.fine ?? 0, net = purse - share - f.travel - fine;
      body.append(tb, h('p', { cls: 'lbl' }, T('settlement')), kv([[T('purse'), B(purse)], [T('athleteShare', { n: name, p: c.purseSharePct }), B(-share)], [T('travel'), B(-f.travel)], ...(fine ? [[T('weightFine'), B(-fine), 'red'] as [string, string, string]] : []), [T('net'), B(net), net < 0 ? 'red' : 'gold']]));
      if (f.bets.length) body.append(h('p', { cls: 'small' }, T('betResult', { stake: B(f.bets.reduce((a, b) => a + b.stake, 0)), back: B(G.betPayout(f)) })));
      btn(T('resultBtn'), () => commit(G.finish(s))); break;
    }
    case 'end': {
      speaker = coach().id; const f = s.fighters.find(x => x.id === s.fight!.fighterId)!;
      line = T('end', { name: G.nameOf(f.id), rec: `${f.record.w}-${f.record.l}` + (f.record.d ? `-${f.record.d}` : ''), cash: B(s.cash), pay: B(G.monthlyPayroll(s)), d: s.wageDay });
      body.append(h('p', { cls: 'tag' }, T('endNote'))); btn(T('reset'), reset, 'ghost'); break;
    }
  }
  $('line').textContent = line;
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
    line = f.outcome ? T('allDone') : `${T(key, v)}${last.energy < 40 ? ' ' + T('n_tired', v) : ''}`;
  }
  body.append(h('p', { cls: 'lbl' }, f.outcome ? T('round', { n: f.rounds, t: f.rounds }) : T('round', { n: n + 1, t: f.rounds })));
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
    bell(); busy = true; stage.classList.remove('idle'); stage.classList.add('clash'); document.querySelectorAll<HTMLButtonElement>('#drawer button').forEach(b => (b.disabled = true));
    setTimeout(() => { busy = false; commit(G.simulateRound(state)); }, reduced ? 0 : 1900);
  });
  btn(T('delegate'), () => commit(G.delegateRest(state)), 'ghost');
  return line;
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
function reset() { const lang = state.lang; G.clearSave(); ghost = null; pinned = false; warn = false; busy = false; first = true; state = G.newGame(lang); G.save(state); render(); }
$('lang').onclick = () => { if (!busy) commit({ ...state, lang: nextLang(state.lang) }); };
$('reset').onclick = () => { if (!busy) reset(); };

new ResizeObserver(() => scene.resize()).observe(canvas);
render();
