// The season: what happens to the camp week after week once the first fight is behind it.
// Pure functions over GameState. Numbers come from balance.ts.
import { COACHES, KO, LEVELS, LIFE, MAX_BUILT_LEVEL, MISSIONS, OFFERS, OPP_NAMES, PROSPECTS, SEASON, SPONSORS, TOURISM, TRAINER, TRAINING, TUNING } from './balance';
import { advanceDays, move, rand, spend } from './state';
import type { Fight, Fighter, GameState, Opp, Result, Staff } from './state';

export type Price = keyof typeof TOURISM.price;
export type MissionKind = keyof typeof MISSIONS;
export interface Offer { id: string; fighterId: string; opp: Opp; campWeeks: number; purse: number; winBonus: number; travel: number; expiresDay: number; source: 'walkIn' | 'mission'; }
export interface Sponsor { id: string; monthly: number; monthsLeft: number; minFights: number; }
export interface WeekEvent { key: string; v: Record<string, string | number>; }
export interface WeekReport { tourists: number; income: number; events: WeekEvent[]; }
export interface SeasonRow { id: string; lifeBefore: number; life: number; walkKg: number; decayed: boolean; }
export interface SeasonReport { season: number; rows: SeasonRow[]; income: number; spent: number; }
export interface SeasonState {
  fans: number; level: number; rng: number; seasonNo: number; seasonWeek: number; seasonLedgerStart: number;
  tourism: { slots: number; price: Price };
  manager: { level: number; mission: { kind: MissionKind; returnDay: number } | null };
  offers: Offer[]; nextOfferDay: number; candidates: string[]; sponsorOffers: string[]; sponsors: Sponsor[];
  fightsThisMonth: number; wins: number; alumni: { id: string; record: string }[];
  lastWeek: WeekReport; seasonReport: SeasonReport | null; lastFight: Fight | null;
}
export const seasonDefaults = (): SeasonState => ({
  fans: 5, level: 1, rng: TUNING.seed, seasonNo: 1, seasonWeek: 0, seasonLedgerStart: 0,
  tourism: { slots: 0, price: 'normal' }, manager: { level: 1, mission: null },
  offers: [], nextOfferDay: 0, candidates: [], sponsorOffers: [], sponsors: [],
  fightsThisMonth: 0, wins: 0, alumni: [], lastWeek: { tourists: 0, income: 0, events: [] }, seasonReport: null, lastFight: null,
});
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

export function staffFrom(id: string): Staff {
  const c = COACHES.find(c => c.id === id)!;
  return { id: c.id, role: 'coach', specialty: c.specialty, wage: c.wage, level: c.level, fatigue: 0, reliability: 80, raises: 0, kratomStreak: 0, kratomNow: false, strain: 0, absent: false };
}
export function fighterFrom(id: string): Fighter {
  const p = PROSPECTS.find(p => p.id === id)!; const [w, l] = p.record.split('-').map(Number);
  return { id: p.id, contractId: 'c-' + p.id, tech: p.tech, clinch: p.clinch, power: p.power, cardio: p.cardio, fatigue: 0, record: { w, l, d: 0 },
    sex: p.sex, classKg: p.weightKg, walkKg: p.walkKg, level: p.level, age: p.age, life: p.life, lifeMax: p.life, streak: 0, kos: 0, lastFightDay: -999, spirit: 60, cred: 10, plan: 'train' };
}

// ---- Trainers: load, fatigue, small upgrades --------------------------------
export const capacityOf = (c: Staff) => TRAINER.capacity[c.level] + c.raises * TRAINER.raiseCapacity;
export const effOf = (c: Staff) => (c.absent ? 0.3 : 1 - Math.max(0, c.fatigue - TRAINER.tiredFrom) / TRAINER.tiredSpan);
/** How much of a training week actually reaches the athletes. Falls as trainers tire. */
export function trainerEff(s: GameState): number {
  return s.staff.length ? s.staff.reduce((a, c) => a + effOf(c), 0) / s.staff.length : 0.4;
}
/** What tired trainers add to the chance of missing weight. */
export function scaleRisk(s: GameState): number {
  if (!s.staff.length) return 0.05;
  return s.staff.reduce((a, c) => a + Math.max(0, c.fatigue - TRAINER.scaleFrom) * TRAINER.scalePerPoint, 0) / s.staff.length;
}
export function demand(s: GameState, price: Price = s.tourism.price): number {
  return Math.floor((TOURISM.base + s.fans / TOURISM.fansPerTourist) * TOURISM.price[price].demand);
}
export const touristsNow = (s: GameState) => Math.min(s.tourism.slots, demand(s));
/** People each trainer serves this week (athletes plus tourists), shared out by capacity. */
export function loads(s: GameState, tourists = touristsNow(s)) {
  const people = s.fighters.length + tourists; const working = s.staff.filter(c => !c.absent); const total = working.reduce((a, c) => a + capacityOf(c), 0);
  return s.staff.map(c => ({ id: c.id, capacity: capacityOf(c), people: c.absent || !total ? 0 : r1(people * capacityOf(c) / total) }));
}
const inCamp = (s: GameState) => s.step === 'hub' || s.step === 'camp';
export function kratomRelief(c: Staff) { return TRAINER.kratomRelief[Math.min(c.kratomStreak, TRAINER.kratomRelief.length - 1)]; }
/** Cheap relief for one week. Each week in a row gives less and wears reliability down. */
export function useKratom(s: GameState, id: string): Result {
  const c = s.staff.find(c => c.id === id); if (!inCamp(s) || !c) return { ok: false, reason: 'step' };
  if (c.kratomNow) return { ok: false, reason: 'limit' };
  if (s.cash < TRAINER.kratomCost) return { ok: false, reason: 'cash' };
  const i = Math.min(c.kratomStreak, TRAINER.kratomRelief.length - 1);
  const n = spend(s, TRAINER.kratomCost, 'kratom', id);
  return { ok: true, state: { ...n, staff: n.staff.map(x => x.id !== id ? x : { ...x, fatigue: clamp(x.fatigue - TRAINER.kratomRelief[i]), reliability: clamp(x.reliability - TRAINER.kratomReliability[i]), kratomStreak: x.kratomStreak + 1, kratomNow: true }) } };
}
/** Permanent: more capacity and a lift now, and a heavier payroll every month. */
export function giveRaise(s: GameState, id: string): Result {
  const c = s.staff.find(c => c.id === id); if (!inCamp(s) || !c) return { ok: false, reason: 'step' };
  if (c.raises >= TRAINER.maxRaises) return { ok: false, reason: 'limit' };
  return { ok: true, state: { ...s, staff: s.staff.map(x => x.id !== id ? x : { ...x, wage: x.wage + TRAINER.raiseWage, raises: x.raises + 1, fatigue: clamp(x.fatigue - TRAINER.raiseRelief), reliability: clamp(x.reliability + 5) }) } };
}
export function hireTrainer(s: GameState, id: string): Result {
  const c = COACHES.find(c => c.id === id); if (!inCamp(s) || !c || s.staff.some(x => x.id === id)) return { ok: false, reason: 'step' };
  if (s.staff.length >= LEVELS[s.level - 1].trainers) return { ok: false, reason: 'slots' };
  if (s.cash < c.signing) return { ok: false, reason: 'cash' };
  const n = spend(s, c.signing, 'staff-signing', id);
  return { ok: true, state: { ...n, staff: [...n.staff, staffFrom(id)] } };
}
export function setTourism(s: GameState, slots: number, price: Price): GameState {
  return inCamp(s) ? { ...s, tourism: { slots: clamp(Math.round(slots), 0, TOURISM.maxSlots), price } } : s;
}
export function setPlan(s: GameState, fighterId: string, plan: 'train' | 'rest'): GameState {
  return inCamp(s) ? { ...s, fighters: s.fighters.map(f => f.id === fighterId ? { ...f, plan } : f) } : s;
}

// ---- Fighters: career wear, signing, retirement -------------------------------
export const cutPct = (walkKg: number, limitKg: number) => Math.max(0, (walkKg - limitKg) / walkKg * 100);
/** Seasons of career a fight costs. A knockout takes more than a points loss; a severe cut more than a light one. */
export function lifeCost(x: { outcome: 'win' | 'loss' | 'draw'; ko: boolean; cutPct: number; wear: number; gapDays: number; streak: number }): number {
  let c = LIFE.fight;
  if (x.outcome === 'loss') c += x.ko ? LIFE.lossKo : LIFE.lossPoints;
  if (x.outcome === 'loss' && x.streak >= LIFE.streakFrom) c += LIFE.streak;
  c += x.cutPct >= LIFE.severeCutPct ? LIFE.severeCut : x.cutPct > 0 ? LIFE.lightCut : 0;
  if (x.wear >= LIFE.wornFrom) c += LIFE.worn;
  if (x.gapDays < LIFE.shortGapDays) c += LIFE.shortGap;
  return r1(c);
}
/** Applies what a settled fight does to the athlete's career and to the camp's standing. */
export function afterFight(s: GameState): GameState {
  const f = s.fight!; const out = f.outcome!; const lost = out === 'loss', won = out === 'win';
  const wear = f.campLog.length ? f.campLog[f.campLog.length - 1].fatigueAfter : 0;
  let ugly = false;
  const fighters = s.fighters.map(x => {
    if (x.id !== f.fighterId) return x;
    const streak = lost ? x.streak + 1 : 0;
    const cost = lifeCost({ outcome: out, ko: f.ko, cutPct: cutPct(x.walkKg, f.limitKg), wear, gapDays: s.day - x.lastFightDay, streak });
    ugly = lost && f.ko && x.life <= SEASON.lowLife;
    return { ...x, life: Math.max(0, r1(x.life - cost)), streak, kos: x.kos + (lost && f.ko ? 1 : 0), lastFightDay: s.day,
      cred: clamp(x.cred + (won ? 6 : lost ? -4 - (streak >= 2 ? 3 : 0) : 1)), spirit: clamp(x.spirit + (won ? 10 : lost ? -12 : 0)) };
  });
  return { ...s, fighters, fightsThisMonth: s.fightsThisMonth + 1, wins: s.wins + (won ? 1 : 0),
    fans: clamp(s.fans + (lost ? f.fans.loss : f.fans.win)), respect: clamp(s.respect + (won ? f.respect.win : lost ? f.respect.loss : 1) - (ugly ? 3 : 0)),
    mood: clamp(s.mood + (won ? 6 : lost ? -5 - (f.ko ? 3 : 0) - (ugly ? 4 : 0) : 0)) };
}
/** How well the manager can judge a candidate. A better manager narrows the range. */
export function appraise(s: GameState, id: string) {
  const p = PROSPECTS.find(p => p.id === id)!; const spread = Math.max(2, 9 - s.manager.level * 2);
  return { low: p.potential - spread, high: Math.min(99, p.potential + spread), needsLevel: Math.max(1, LEVELS.findIndex(l => l.maxFighterLevel >= p.level) + 1) };
}
/** The athlete decides. A higher-level athlete does not sign with a camp below their level. */
export function signCandidate(s: GameState, id: string): Result {
  const p = PROSPECTS.find(p => p.id === id); if (!inCamp(s) || !p || !s.candidates.includes(id)) return { ok: false, reason: 'step' };
  if (s.fighters.length >= LEVELS[s.level - 1].fighters) return { ok: false, reason: 'slots' };
  if (p.level > LEVELS[s.level - 1].maxFighterLevel) return { ok: false, reason: 'level' };
  if (p.needsClinchCoach && !s.staff.some(c => c.specialty === 'clinch')) return { ok: false, reason: 'declined' };
  if (s.cash < p.signing) return { ok: false, reason: 'cash' };
  const n = spend(s, p.signing, 'fighter-signing', id); const fighter = fighterFrom(id);
  return { ok: true, state: { ...n, candidates: n.candidates.filter(c => c !== id), fighters: [...n.fighters, fighter],
    contracts: [...n.contracts, { id: fighter.contractId, fighterId: id, signing: p.signing, stipend: p.stipend, purseSharePct: p.purseSharePct, months: 12, consented: true }] } };
}
/** The player's call, and the game never says when the time is right. */
export function retire(s: GameState, id: string): Result {
  const f = s.fighters.find(f => f.id === id); if (!inCamp(s) || !f) return { ok: false, reason: 'step' };
  if (s.fight?.fighterId === id) return { ok: false, reason: 'busy' };
  return { ok: true, state: { ...s, fighters: s.fighters.filter(x => x.id !== id), contracts: s.contracts.filter(c => c.fighterId !== id), offers: s.offers.filter(o => o.fighterId !== id),
    alumni: [...s.alumni, { id, record: `${f.record.w}-${f.record.l}` + (f.record.d ? `-${f.record.d}` : '') }] } };
}

// ---- Manager: sent out to bring opportunity back ------------------------------
export function sendManager(s: GameState, kind: MissionKind): Result {
  const m = MISSIONS[kind]; if (!inCamp(s) || !m) return { ok: false, reason: 'step' };
  if (s.manager.mission) return { ok: false, reason: 'busy' };
  if (s.cash < m.cost) return { ok: false, reason: 'cash' };
  const n = spend(s, m.cost, 'mission-' + kind, 'rin');
  return { ok: true, state: { ...n, manager: { ...n.manager, mission: { kind, returnDay: n.day + m.weeks * 7 } } } };
}
function makeOffer(s: GameState, source: Offer['source']): [Offer | null, number] {
  let seed = s.rng; const r = () => { const [v, n] = rand(seed); seed = n; return v; };
  // Promoters ask for athletes who look ready. A manager sent out can still bring a date for a tired one, to be rested in time.
  const free = s.fighters.filter(f => f.id !== s.fight?.fighterId && !s.offers.some(o => o.fighterId === f.id)).sort((a, b) => a.fatigue - b.fatigue);
  const pool = free.filter(f => f.fatigue < 60).length ? free.filter(f => f.fatigue < 60) : source === 'mission' ? free.slice(0, 1) : []; if (!pool.length) return [null, seed];
  const f = pool[Math.floor(r() * pool.length)], t = OFFERS[source], between = ([a, b]: number[]) => a + r() * (b - a);
  const base = (f.tech + f.clinch + f.power) / 3 + between(t.edge); const at = () => Math.round(clamp(base + (r() - 0.5) * 8, 20, 99));
  const name = OPP_NAMES[f.sex][Math.floor(r() * OPP_NAMES[f.sex].length)];
  const opp: Opp = { id: 'opp-' + s.day + '-' + f.id, name, tech: at(), clinch: at(), power: at(), cardio: Math.round(50 + r() * 14), record: `${8 + Math.floor(r() * 20)}-${3 + Math.floor(r() * 9)}`, look: f.sex === 'm' ? 'kaew' : 'fah' };
  const offer: Offer = { id: 'o-' + s.day + '-' + source + '-' + f.id, fighterId: f.id, opp, source, campWeeks: t.campWeeks[Math.floor(r() * t.campWeeks.length)],
    purse: Math.round(between(t.purse) / 500) * 500, winBonus: t.winBonus, travel: t.travel, expiresDay: s.day + OFFERS.validDays };
  return [offer, seed];
}
function managerReturns(s: GameState): GameState {
  const kind = s.manager.mission!.kind; let n: GameState = { ...s, manager: { ...s.manager, mission: null } }; let count = 0;
  if (kind === 'talents') {
    const ids = PROSPECTS.filter(p => !n.fighters.some(f => f.id === p.id) && !n.alumni.some(a => a.id === p.id)).sort((a, b) => a.level - b.level).slice(0, 3).map(p => p.id);
    n = { ...n, candidates: ids }; count = ids.length;
  } else if (kind === 'fights') {
    for (let i = 0; i < 2; i++) { const [o, seed] = makeOffer(n, 'mission'); n = { ...n, rng: seed, offers: o ? [...n.offers, o] : n.offers }; if (o) count++; }
  } else {
    const ids = SPONSORS.filter(sp => !n.sponsors.some(x => x.id === sp.id)).slice(0, 2).map(sp => sp.id); n = { ...n, sponsorOffers: ids }; count = ids.length;
  }
  return { ...n, lastWeek: { ...n.lastWeek, events: [...n.lastWeek.events, { key: 'ev_back_' + kind, v: { n: count } }] } };
}
export function signSponsor(s: GameState, id: string): Result {
  const sp = SPONSORS.find(x => x.id === id); if (!inCamp(s) || !sp || !s.sponsorOffers.includes(id)) return { ok: false, reason: 'step' };
  if ('minFans' in sp && s.fans < sp.minFans!) return { ok: false, reason: 'level' };
  return { ok: true, state: { ...s, sponsorOffers: s.sponsorOffers.filter(x => x !== id), sponsors: [...s.sponsors, { id, monthly: sp.monthly, monthsLeft: sp.months, minFights: sp.minFights }] } };
}
export const offerPreview = (s: GameState, o: Offer, win: boolean) => {
  const c = s.contracts.find(c => c.fighterId === o.fighterId)!; const purse = o.purse + (win ? o.winBonus : 0); const share = Math.round(purse * c.purseSharePct / 100);
  return { purse, share, travel: o.travel, net: purse - share - o.travel };
};
/** Accepting an offer opens the fight camp. One bout is prepared at a time. */
export function takeOffer(s: GameState, offerId: string): Result {
  const o = s.offers.find(o => o.id === offerId); if (s.step !== 'hub' || !o) return { ok: false, reason: 'step' };
  if (s.fight) return { ok: false, reason: 'busy' };
  const f = s.fighters.find(f => f.id === o.fighterId); if (!f) return { ok: false, reason: 'unknown' };
  if (f.fatigue >= 70) return { ok: false, reason: 'tired' };
  if (s.cash < o.travel) return { ok: false, reason: 'cash' };
  const seed = (s.ledger.length * 7919 + s.day * 104729 + f.tech * 31 + f.clinch * 17 + s.rng) >>> 0;
  return { ok: true, state: { ...s, step: 'camp', offers: s.offers.filter(x => x.id !== offerId), fight: {
    fighterId: f.id, opponentId: o.opp.id, opp: o.opp, ko: false, circuit: 'varzea', fans: OFFERS.fans, respect: OFFERS.respect,
    limitKg: f.classKg, weighIn: null, day: s.day + o.campWeeks * 7, campWeeks: o.campWeeks, campLog: [], wearBeforeFinal: null, rounds: 5,
    purse: o.purse, winBonus: o.winBonus, travel: o.travel, capacity: 120 + s.fans * 6, attendance: Math.min(120 + s.fans * 6, 30 + s.fans * 5),
    rng: seed || 1, energy: 100, oppEnergy: 100, log: [], next: 'keep', bets: [], odds: 2, delegated: false, outcome: null, settled: false, totals: [],
  } } };
}

// ---- The week -----------------------------------------------------------------
const MAIN: Record<string, ('tech' | 'clinch' | 'power')[]> = { technical: ['tech'], clinch: ['clinch'], balanced: ['tech', 'clinch', 'power'] };
/**
 * One week of camp life: tourists pay and take trainer time, trainers tire or recover, athletes outside a fight camp
 * follow their plan, the calendar moves (payroll, sponsors, loan) and the manager may come home.
 */
export function weekTick(s: GameState, campFighterId: string | null = null): GameState {
  const events: WeekEvent[] = []; const tourists = touristsNow(s); const income = tourists * TOURISM.price[s.tourism.price].fee;
  let n = tourists ? move(s, income, 'tourism', 'classes') : s;
  const eff = trainerEff(n), ld = loads(n, tourists), cap = Math.max(TRAINER.attrCap[1], ...n.staff.map(c => TRAINER.attrCap[c.level]));
  // athletes not in fight camp
  const keys = MAIN[n.school ?? 'balanced'], key = keys[n.seasonWeek % keys.length];
  const fit = n.staff.some(c => c.specialty === (key === 'clinch' ? 'clinch' : 'pads')) && key !== 'power' ? TRAINER.fitBonus : 1;
  const fighters = n.fighters.map(f => {
    if (f.id === campFighterId) return f;
    if (f.plan === 'rest') return { ...f, fatigue: clamp(f.fatigue - TRAINING.rest) };
    if (f.fatigue >= TRAINING.backOff) return { ...f, fatigue: clamp(f.fatigue - TRAINING.easy) }; // the coach eases off a worn athlete on his own
    const g = Math.round(TRAINING.gain * fit * Math.max(0.4, 1 - f.fatigue / 120) * eff);
    return { ...f, [key]: Math.max(f[key], Math.min(cap, f[key] + g)), fatigue: clamp(f.fatigue + TRAINING.fatigue) };
  });
  // trainers
  let mood = n.mood; const staff: Staff[] = [];
  for (const c of n.staff) {
    const l = ld.find(x => x.id === c.id)!; const over = l.people - l.capacity;
    let fatigue = c.absent ? clamp(c.fatigue - 25) : clamp(c.fatigue + (over > 0 ? Math.ceil(over) * TRAINER.overPerPerson : -TRAINER.recover));
    const strain = fatigue >= TRAINER.strainAt ? c.strain + 1 : fatigue < 60 ? 0 : c.strain;
    if (strain >= TRAINER.leaveAfter) { events.push({ key: 'ev_left', v: { n: c.id } }); mood = clamp(mood - 8); continue; }
    const absent = !c.absent && strain >= (c.reliability < 50 ? TRAINER.absentAfter - 1 : TRAINER.absentAfter) && fatigue >= TRAINER.strainAt;
    if (absent) events.push({ key: 'ev_absent', v: { n: c.id } });
    if (fatigue >= TRAINER.strainAt) mood = clamp(mood - 2);
    staff.push({ ...c, fatigue, strain, absent, kratomStreak: c.kratomNow ? c.kratomStreak : 0, kratomNow: false });
  }
  n = { ...n, fighters, staff, mood, lastWeek: { tourists, income, events } };
  const before = n.wageDay; n = advanceDays(n, 7);
  if (n.wageDay !== before) n = { ...n, lastWeek: { ...n.lastWeek, events: [...n.lastWeek.events, { key: 'ev_payroll', v: {} }] } };
  // opportunities
  n = { ...n, offers: n.offers.filter(o => o.expiresDay > n.day), seasonWeek: n.seasonWeek + 1 };
  if (n.manager.mission && n.day >= n.manager.mission.returnDay) n = managerReturns(n);
  else if (!n.manager.mission && !n.fight && n.step === 'hub' && !n.offers.length && n.day >= n.nextOfferDay) {
    const [o, seed] = makeOffer(n, 'walkIn');
    n = { ...n, rng: seed, nextOfferDay: o ? n.day + OFFERS.everyDays : n.nextOfferDay, offers: o ? [o] : [], lastWeek: o ? { ...n.lastWeek, events: [...n.lastWeek.events, { key: 'ev_offer', v: { n: o.fighterId } }] } : n.lastWeek };
  }
  return n;
}
/** A camp week with no fight booked. */
export function runWeek(s: GameState): Result {
  if (s.step !== 'hub' || s.fight) return { ok: false, reason: 'step' };
  return { ok: true, state: maybeSeason(weekTick(s)) };
}
/** Closes the season when its last week has passed and no bout is in preparation: careers shorten, everyday weight creeps up. */
export function maybeSeason(s: GameState): GameState {
  if (s.step !== 'hub' || s.fight || s.seasonWeek < SEASON.weeks) return s;
  const rows: SeasonRow[] = []; const older = s.seasonNo % SEASON.ageEvery === 0;
  const fighters = s.fighters.map(f => {
    const life = Math.max(0, r1(f.life - LIFE.season)), decayed = life <= SEASON.lowLife, d = decayed ? SEASON.lowLifeDecay : 0, walkKg = r1(f.walkKg + SEASON.walkGainKg);
    rows.push({ id: f.id, lifeBefore: f.life, life, walkKg, decayed });
    return { ...f, life, walkKg, age: f.age + (older ? 1 : 0), tech: f.tech - d, clinch: f.clinch - d, power: f.power - d, cardio: f.cardio - d };
  });
  const span = s.ledger.slice(s.seasonLedgerStart).filter(e => e.sourceType !== 'emergency-loan');
  const income = span.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0), spent = -span.filter(e => e.amount < 0).reduce((a, e) => a + e.amount, 0);
  return { ...s, fighters, step: 'season', seasonReport: { season: s.seasonNo, rows, income, spent } };
}
export function nextSeason(s: GameState): GameState {
  return s.step === 'season' ? { ...s, step: 'hub', seasonNo: s.seasonNo + 1, seasonWeek: 0, seasonLedgerStart: s.ledger.length } : s;
}

// ---- Academy level --------------------------------------------------------------
export function levelCheck(s: GameState) {
  const next = LEVELS[s.level]; if (!next || s.level >= MAX_BUILT_LEVEL) return null;
  return { next, fans: s.fans >= next.fans, goal: s.wins >= next.goalWins, cash: s.cash >= next.cost };
}
/** Needs all three at once: fans, a sporting goal and the money for the works. Charged exactly once. */
export function levelUp(s: GameState): Result {
  const c = levelCheck(s); if (s.step !== 'hub' || !c) return { ok: false, reason: 'step' };
  if (!c.fans || !c.goal) return { ok: false, reason: 'level' };
  if (!c.cash) return { ok: false, reason: 'cash' };
  return { ok: true, state: { ...spend(s, c.next.cost, 'construction', 'builder'), level: c.next.level } };
}
export { KO };
