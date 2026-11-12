// Simulation layer: pure data + pure functions. No rendering imports.
// All money values are FICTIONAL game-balancing numbers, not real Thai market prices.
export type Lang = 'pt' | 'en' | 'th';
export type Step =
  | 'intro' | 'locations' | 'gate' | 'walk' | 'place' | 'coach' | 'scout' | 'away' | 'report' | 'roster'
  | 'school' | 'morning' | 'summary' | 'offer' | 'camp' | 'weighin' | 'fight' | 'result' | 'end';
export type School = 'balanced' | 'technical' | 'clinch';
export type Instruction = 'keep' | 'conserve' | 'pace';

export interface LedgerEntry { id: number; day: number; amount: number; sourceType: string; recipient: string; }
export interface Facility { id: string; type: 'mat'; x: number; z: number; w: number; d: number; level: number; }
export interface Staff { id: string; role: 'coach'; specialty: 'pads' | 'clinch'; wage: number; }
export interface Fighter { id: string; contractId: string; tech: number; clinch: number; power: number; cardio: number; fatigue: number; record: { w: number; l: number; d: number }; }
/** Representation agreement: rights over management of fights, never ownership of a person. */
export interface Contract { id: string; fighterId: string; signing: number; stipend: number; purseSharePct: number; months: number; consented: true; }
export interface ScoutTrip { tripId: string; returnDay: number; }
export interface SessionLine { fighterId: string; activity: 'pads' | 'clinch' | 'rope'; gains: Partial<Record<'tech' | 'clinch' | 'power' | 'cardio', number>>; fatigue: number; }
export interface RoundLog { round: number; instruction: Instruction; margin: number; cards: [number, number][]; energy: number; oppEnergy: number; crowd: 'ours' | 'even' | 'theirs'; odds: number; }
export interface Bet { afterRound: number; stake: number; odds: number; }
export interface WeighIn { made: boolean; overKg: number; fine: number; chance: number; }
export type WeekPlan = 'hard' | 'moderate' | 'light';
export type FinalPlan = 'sharpen' | 'rest';
export interface CampWeek { week: number; plan: WeekPlan | FinalPlan; by: 'player' | 'coach'; gains: Partial<Record<'tech' | 'clinch' | 'power' | 'cardio', number>>; fatigueAfter: number; }
export interface Fight {
  fighterId: string; opponentId: string; limitKg: number; weighIn: WeighIn | null; day: number;
  campWeeks: number; campLog: CampWeek[]; wearBeforeFinal: number | null; rounds: number; purse: number; winBonus: number; travel: number;
  capacity: number; attendance: number; rng: number; energy: number; oppEnergy: number;
  log: RoundLog[]; next: Instruction; bets: Bet[]; odds: number; delegated: boolean;
  outcome: 'win' | 'loss' | 'draw' | null; settled: boolean; totals: [number, number][];
}
export interface GameState {
  saveVersion: 5; wageDay: number; day: number; region: 'bangkok' | null; cash: number; debt: number; debtDueDay: number;
  morale: number; prestige: number; step: Step; facilities: Facility[]; ledger: LedgerEntry[]; lang: Lang;
  staff: Staff[]; fighters: Fighter[]; contracts: Contract[]; scout: ScoutTrip | null; declined: string[];
  school: School | null; lastSession: SessionLine[]; sessions: number; fight: Fight | null;
  adultBetting: boolean;
}

export const TUNING = {
  startCash: 300_000, loan: 250_000, loanDueDay: 30, wageDay: 30,
  matCost: 8_000, matW: 3, matD: 2,
  purse: 6_000, winBonus: 3_000, travel: 800,
  betCapPerRound: 2_000,      // bets use the camp's own fictional baht: a real risk to the runway
  weighFinePct: 20, campWeeks: 3,   // weeks of fight camp before the first bout; later offers may give 2 to 4
};
export const REGIONS = [
  { id: 'bangkok' as const, price: 190_000, open: true },
  { id: 'phuket' as const, price: 150_000, open: false },
  { id: 'chiangmai' as const, price: 110_000, open: false },
];
export const GRID = { w: 12, d: 8 };

// Cells where nothing can be built: pillars, entrance passage, floor gutter.
const BLOCKED: [number, number][] = [
  [2, 2], [9, 2], [2, 5], [9, 5],
  [4, 0], [5, 0], [6, 0], [7, 0],
  [0, 6], [0, 7],
];
export const PILLARS: [number, number][] = BLOCKED.slice(0, 4);
export const isBlocked = (x: number, z: number) => BLOCKED.some(([bx, bz]) => bx === x && bz === z);

export type Result = { ok: true; state: GameState } | { ok: false; reason: 'step' | 'blocked' | 'cash' | 'declined' | 'unknown' | 'tired' | 'limit' };
export type BuyResult = Result;

export function newGame(lang: Lang = 'pt'): GameState {
  return {
    saveVersion: 5, wageDay: TUNING.wageDay, day: 1, region: null, cash: TUNING.startCash, debt: TUNING.loan, debtDueDay: TUNING.loanDueDay,
    morale: 50, prestige: 5, step: 'intro', facilities: [], ledger: [], lang,
    staff: [], fighters: [], contracts: [], scout: null, declined: [],
    school: null, lastSession: [], sessions: 0, fight: null, adultBetting: true,
  };
}
const move = (s: GameState, amount: number, sourceType: string, recipient: string): GameState => ({
  ...s, cash: s.cash + amount,
  ledger: [...s.ledger, { id: s.ledger.length + 1, day: s.day, amount, sourceType, recipient }],
});
const spend = (s: GameState, amount: number, sourceType: string, recipient: string) => move(s, -amount, sourceType, recipient);

// ---- Scene 1-2: the chairs, the key ----------------------------------------
export function visitLocations(s: GameState): GameState { return s.step === 'intro' ? { ...s, step: 'locations' } : s; }
export function buyProperty(s: GameState, regionId: string): Result {
  if (s.step !== 'locations') return { ok: false, reason: 'step' };
  const r = REGIONS.find(r => r.id === regionId); if (!r || !r.open || r.id !== 'bangkok') return { ok: false, reason: 'unknown' };
  if (s.cash < r.price) return { ok: false, reason: 'cash' };
  return { ok: true, state: { ...spend(s, r.price, 'property', 'seller'), region: r.id, step: 'gate' } };
}
export function openGate(s: GameState): GameState { return s.step === 'gate' ? { ...s, step: 'walk' } : s; }
export function startPlacing(s: GameState): GameState { return s.step === 'walk' ? { ...s, step: 'place' } : s; }
export function cancelPlacing(s: GameState): GameState { return s.step === 'place' ? { ...s, step: 'walk' } : s; }

export function canPlace(s: GameState, x: number, z: number, w = TUNING.matW, d = TUNING.matD): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(z)) return false;
  if (x < 0 || z < 0 || x + w > GRID.w || z + d > GRID.d) return false;
  for (let i = x; i < x + w; i++) for (let j = z; j < z + d; j++) {
    if (isBlocked(i, j)) return false;
    if (s.facilities.some(f => i >= f.x && i < f.x + f.w && j >= f.z && j < f.z + f.d)) return false;
  }
  return true;
}
// Buys the first training mat. Debits exactly once: only valid in the 'place' step.
export function buyMat(s: GameState, x: number, z: number): Result {
  if (s.step !== 'place') return { ok: false, reason: 'step' };
  if (!canPlace(s, x, z)) return { ok: false, reason: 'blocked' };
  if (s.cash < TUNING.matCost) return { ok: false, reason: 'cash' };
  const n = spend(s, TUNING.matCost, 'equipment', 'supplier');
  return { ok: true, state: { ...n, step: 'coach', facilities: [...n.facilities, { id: 'mat-1', type: 'mat', x, z, w: TUNING.matW, d: TUNING.matD, level: 1 }] } };
}

// ---- Scene 3: first coach -------------------------------------------------
export const COACHES = [
  { id: 'somchai', name: 'Kru Somchai', specialty: 'pads' as const, signing: 6_000, wage: 14_000 },
  { id: 'daeng', name: 'Kru Daeng', specialty: 'clinch' as const, signing: 9_000, wage: 18_000 },
];
export function hireCoach(s: GameState, id: string): Result {
  if (s.step !== 'coach') return { ok: false, reason: 'step' };
  const c = COACHES.find(c => c.id === id); if (!c) return { ok: false, reason: 'unknown' };
  if (s.cash < c.signing) return { ok: false, reason: 'cash' };
  const n = spend(s, c.signing, 'staff-signing', c.id);
  return { ok: true, state: { ...n, step: 'scout', staff: [...n.staff, { id: c.id, role: 'coach', specialty: c.specialty, wage: c.wage }] } };
}

// ---- Scene 4: the scout's notebook ----------------------------------------
export const TRIPS = [
  { id: 'camp', days: 1, cost: 2_500, source: 'training' as const },
  { id: 'fair', days: 3, cost: 4_500, source: 'fight' as const },
];
// Most of the talent pool is male, as in the real circuit. `walkKg` is everyday weight; `weightKg` is the fighting class.
export const PROSPECTS = [
  { id: 'niran', name: 'Niran', sex: 'm' as const, age: 24, weightKg: 61, walkKg: 63, style: 'khao', record: '9-4', origin: 'Khon Kaen', signing: 8_000, stipend: 5_000, purseSharePct: 55, potential: 72, needsClinchCoach: true, tech: 44, clinch: 63, power: 55, cardio: 60 },
  { id: 'petch', name: 'Petch', sex: 'm' as const, age: 21, weightKg: 57, walkKg: 60.5, style: 'mat', record: '11-6', origin: 'Korat', signing: 7_000, stipend: 5_000, purseSharePct: 50, potential: 70, needsClinchCoach: false, tech: 50, clinch: 42, power: 64, cardio: 54 },
  { id: 'mali', name: 'Mali', sex: 'f' as const, age: 22, weightKg: 54, walkKg: 56, style: 'femur', record: '14-5', origin: 'Buriram', signing: 12_000, stipend: 6_000, purseSharePct: 60, potential: 78, needsClinchCoach: false, tech: 62, clinch: 40, power: 45, cardio: 58 },
];
/** Bouts are always same-sex and at the athlete's weight class. */
export const OPPONENTS = {
  m: { id: 'kaew', name: 'Kaew', tech: 50, clinch: 50, power: 52, cardio: 56, record: '11-7' },
  f: { id: 'fah', name: 'Fah', tech: 54, clinch: 46, power: 46, cardio: 57, record: '10-6' },
};
export const opponentFor = (fighterId: string) => OPPONENTS[PROSPECTS.find(p => p.id === fighterId)?.sex ?? 'm'];
export const opponentOf = (f: Fight) => Object.values(OPPONENTS).find(o => o.id === f.opponentId) ?? OPPONENTS.m;
export const nameOf = (id: string) => PROSPECTS.find(p => p.id === id)?.name ?? COACHES.find(c => c.id === id)?.name ?? Object.values(OPPONENTS).find(o => o.id === id)?.name ?? id;
/** What Rin could actually judge: a watched fight narrows the estimate, training alone does not. */
export function estimate(s: GameState, prospectId: string) {
  const p = PROSPECTS.find(p => p.id === prospectId)!; const trip = TRIPS.find(t => t.id === s.scout?.tripId);
  const spread = trip?.source === 'fight' ? 4 : 10;
  return { low: p.potential - spread, high: Math.min(99, p.potential + spread), confidence: trip?.source === 'fight' ? 'high' as const : 'medium' as const };
}
export function sendScout(s: GameState, tripId: string): Result {
  if (s.step !== 'scout') return { ok: false, reason: 'step' };
  const t = TRIPS.find(t => t.id === tripId); if (!t) return { ok: false, reason: 'unknown' };
  if (s.cash < t.cost) return { ok: false, reason: 'cash' };
  return { ok: true, state: { ...spend(s, t.cost, 'scouting', 'rin'), step: 'away', scout: { tripId, returnDay: s.day + t.days }, declined: [] } };
}
/** Time only moves because the player chose to wait. */
export function waitForScout(s: GameState): GameState {
  return s.step === 'away' && s.scout ? { ...s, day: s.scout.returnDay, step: 'report' } : s;
}
/** The athlete decides. No contract exists without their consent. */
export function willAccept(s: GameState, prospectId: string): boolean {
  const p = PROSPECTS.find(p => p.id === prospectId); if (!p) return false;
  return !p.needsClinchCoach || s.staff.some(c => c.specialty === 'clinch');
}
export function offerContract(s: GameState, prospectId: string): Result {
  if (s.step !== 'report') return { ok: false, reason: 'step' };
  const p = PROSPECTS.find(p => p.id === prospectId); if (!p) return { ok: false, reason: 'unknown' };
  if (s.fighters.some(f => f.id === p.id) || s.declined.includes(p.id)) return { ok: false, reason: 'step' };
  if (!willAccept(s, p.id)) return { ok: false, reason: 'declined' };
  if (s.cash < p.signing) return { ok: false, reason: 'cash' };
  const n = spend(s, p.signing, 'fighter-signing', p.id); const contractId = 'c-' + p.id;
  const [w, l] = p.record.split('-').map(Number);
  return { ok: true, state: { ...n,
    fighters: [...n.fighters, { id: p.id, contractId, tech: p.tech, clinch: p.clinch, power: p.power, cardio: p.cardio, fatigue: 0, record: { w, l, d: 0 } }],
    contracts: [...n.contracts, { id: contractId, fighterId: p.id, signing: p.signing, stipend: p.stipend, purseSharePct: p.purseSharePct, months: 12, consented: true }],
  } };
}
export function recordRefusal(s: GameState, prospectId: string): GameState {
  return s.step === 'report' && !s.declined.includes(prospectId) ? { ...s, declined: [...s.declined, prospectId] } : s;
}
export function closeReport(s: GameState): GameState { return s.step === 'report' ? { ...s, step: 'roster' } : s; }
export function searchAgain(s: GameState): GameState { return s.step === 'roster' && s.fighters.length === 0 ? { ...s, step: 'scout', scout: null } : s; }
export const monthlyPayroll = (s: GameState) => s.staff.reduce((a, c) => a + c.wage, 0) + s.contracts.reduce((a, c) => a + c.stipend, 0);

// ---- Scene 5-6: the camp's school, the first morning -----------------------
export function planTraining(s: GameState): GameState { return s.step === 'roster' && s.fighters.length > 0 ? { ...s, step: 'school' } : s; }
export function chooseSchool(s: GameState, school: School): GameState {
  return (s.step === 'school' || s.step === 'morning') ? { ...s, school, step: 'morning' } : s;
}
export function reopenSchool(s: GameState): GameState { return s.step === 'morning' ? { ...s, step: 'school' } : s; }
/** One pair of pads: one athlete works with the coach, the other skips rope. A clinch block uses the pair together. */
export function runMorning(s: GameState): GameState {
  if (s.step !== 'morning' || !s.school || !s.staff.length || !s.fighters.length) return s;
  const coach = s.staff[0]; const pair = s.school === 'clinch' && s.fighters.length >= 2;
  const fit = (kind: 'pads' | 'clinch') => (coach.specialty === kind ? 1.5 : 1);
  const lines: SessionLine[] = []; const turn = s.sessions % s.fighters.length;
  const fighters = s.fighters.map((f, i) => {
    const ready = Math.max(0.4, 1 - f.fatigue / 120); // tired athletes learn less
    let line: SessionLine;
    if (pair || (s.school === 'clinch' && i === turn)) line = { fighterId: f.id, activity: 'clinch', gains: { clinch: Math.round((pair ? 3 : 2) * fit('clinch') * ready), cardio: 1 }, fatigue: 26 };
    else if (i === turn) line = { fighterId: f.id, activity: 'pads', fatigue: 24, gains: s.school === 'technical' ? { tech: Math.round(3 * fit('pads') * ready) } : { tech: Math.round(1 * fit('pads') * ready), power: 1, cardio: 1 } };
    else line = { fighterId: f.id, activity: 'rope', gains: { cardio: 1 }, fatigue: 10 };
    lines.push(line);
    const g = line.gains;
    return { ...f, tech: f.tech + (g.tech ?? 0), clinch: f.clinch + (g.clinch ?? 0), power: f.power + (g.power ?? 0), cardio: f.cardio + (g.cardio ?? 0), fatigue: Math.min(100, f.fatigue + line.fatigue) };
  });
  return { ...s, fighters, lastSession: lines, sessions: s.sessions + 1, day: s.day + 1, step: 'summary' };
}

// ---- Scene 7: the next need, the first offer --------------------------------
export function seeOffer(s: GameState): GameState { return s.step === 'summary' ? { ...s, step: 'offer' } : s; }
export const offeredFighter = (s: GameState) => [...s.fighters].sort((a, b) => a.fatigue - b.fatigue)[0];
/** The athlete must agree to compete; an exhausted athlete says no. */
export const fighterAccepts = (f: Fighter) => f.fatigue < 70;
export function settlementPreview(s: GameState, win: boolean) {
  const f = offeredFighter(s); const c = s.contracts.find(c => c.fighterId === f.id)!;
  const purse = TUNING.purse + (win ? TUNING.winBonus : 0); const share = Math.round(purse * c.purseSharePct / 100);
  return { purse, share, camp: purse - share, travel: TUNING.travel, net: purse - share - TUNING.travel };
}
export function acceptOffer(s: GameState): Result {
  if (s.step !== 'offer') return { ok: false, reason: 'step' };
  const f = offeredFighter(s); if (!f) return { ok: false, reason: 'unknown' };
  if (!fighterAccepts(f)) return { ok: false, reason: 'tired' };
  if (s.cash < TUNING.travel) return { ok: false, reason: 'cash' };
  const seed = (s.ledger.length * 7919 + s.day * 104729 + f.tech * 31 + f.clinch * 17 + s.sessions * 53) >>> 0;
  return { ok: true, state: { ...s, step: 'camp', fight: {
    fighterId: f.id, opponentId: opponentFor(f.id).id, limitKg: PROSPECTS.find(p => p.id === f.id)!.weightKg, weighIn: null, day: s.day + TUNING.campWeeks * 7,
    campWeeks: TUNING.campWeeks, campLog: [], wearBeforeFinal: null, rounds: 5, purse: TUNING.purse, winBonus: TUNING.winBonus, travel: TUNING.travel,
    capacity: 120, attendance: 38, rng: seed || 1, energy: 100, oppEnergy: 100, log: [], next: 'keep', bets: [], odds: 2, delegated: false,
    outcome: null, settled: false, totals: [],
  } } };
}
/** Refusing is allowed: the camp trains another morning and the promoter calls again. */
export function declineOffer(s: GameState): GameState { return s.step === 'offer' ? { ...s, step: 'morning' } : s; }
export function restDay(s: GameState): GameState {
  return s.step === 'offer' ? { ...s, day: s.day + 1, fighters: s.fighters.map(f => ({ ...f, fatigue: Math.max(0, f.fatigue - 40) })) } : s;
}
// ---- Fight camp: one decision per week --------------------------------------
/** Moves the calendar and pays wages when the pay day passes. A shortfall becomes debt, never negative cash. */
export function advanceDays(s: GameState, days: number): GameState {
  let n = { ...s, day: s.day + days };
  while (n.day >= n.wageDay) {
    const due = monthlyPayroll(n);
    if (due > n.cash) { const gap = due - n.cash; n = { ...move(n, gap, 'emergency-loan', 'lender'), debt: n.debt + gap, morale: Math.max(0, n.morale - 6) }; }
    n = { ...spend(n, due, 'payroll', 'staff-and-athletes'), wageDay: n.wageDay + 30 };
  }
  return n;
}
export const weeksLeft = (f: Fight) => f.campWeeks - f.campLog.length;
const mainGain = (s: GameState, amount: number): CampWeek['gains'] => {
  const fit = (k: 'pads' | 'clinch') => (s.staff[0]?.specialty === k ? 1.5 : 1);
  if (s.school === 'clinch') return { clinch: Math.round(amount * fit('clinch')) };
  if (s.school === 'technical') return { tech: Math.round(amount * fit('pads')) };
  return amount >= 3 ? { tech: 1, clinch: 1, power: 1 } : amount >= 2 ? { tech: 1, power: 1 } : amount >= 1 ? { tech: 1 } : {};
};
const WEEK = { hard: { gain: 3, cardio: 2, fatigue: 22 }, moderate: { gain: 2, cardio: 1, fatigue: 8 }, light: { gain: 0, cardio: 0, fatigue: -25 },
  sharpen: { gain: 1, cardio: 0, fatigue: 10 }, rest: { gain: 0, cardio: 0, fatigue: -35 } };
/** What a week of this plan would do, before committing to it. */
export function previewWeek(s: GameState, plan: WeekPlan | FinalPlan) {
  const f = s.fight!, me = s.fighters.find(x => x.id === f.fighterId)!, w = WEEK[plan];
  const ready = Math.max(0.4, 1 - me.fatigue / 120); // a worn-out athlete absorbs less
  const gains: CampWeek['gains'] = Object.fromEntries(Object.entries(mainGain(s, w.gain)).map(([k, v]) => [k, Math.max(w.gain ? 1 : 0, Math.round(v! * ready))]));
  if (w.cardio) gains.cardio = (gains.cardio ?? 0) + w.cardio;
  return { gains, fatigueAfter: Math.max(0, Math.min(100, me.fatigue + w.fatigue)) };
}
/**
 * Chance of missing weight at the official weigh-in: a probability, never a certainty. It grows with the gap between
 * everyday and fighting weight and, above all, with how worn the athlete was going into the final week.
 * The game never models or rewards dehydration methods.
 */
export function missWeightChance(s: GameState, finalPlan: FinalPlan): number {
  const f = s.fight; if (!f) return 0; const p = PROSPECTS.find(p => p.id === f.fighterId)!; const me = s.fighters.find(x => x.id === f.fighterId)!;
  const wear = f.wearBeforeFinal ?? me.fatigue;
  const c = 0.03 + (p.walkKg - p.weightKg) * 0.03 + Math.max(0, wear - 40) * 0.005 + (finalPlan === 'sharpen' ? 0.06 : -0.03);
  return Math.round(Math.min(0.6, Math.max(0.02, c)) * 100) / 100;
}
/** What the coach would pick: push while fresh, back off when worn, never gamble the weigh-in. */
export function coachPick(s: GameState): WeekPlan | FinalPlan {
  const f = s.fight!, me = s.fighters.find(x => x.id === f.fighterId)!;
  if (weeksLeft(f) <= 1) return me.fatigue > 45 ? 'rest' : 'sharpen';
  return me.fatigue > 60 ? 'light' : me.fatigue < 35 ? 'hard' : 'moderate';
}
/** Runs one week of camp. The last week ends at the scales. */
export function runCampWeek(s: GameState, plan: WeekPlan | FinalPlan | 'coach'): Result {
  const f = s.fight; if (s.step !== 'camp' || !f || weeksLeft(f) <= 0) return { ok: false, reason: 'step' };
  const final = weeksLeft(f) === 1; const by = plan === 'coach' ? 'coach' as const : 'player' as const;
  const chosen = plan === 'coach' ? coachPick(s) : plan;
  if (final !== (chosen === 'sharpen' || chosen === 'rest')) return { ok: false, reason: 'unknown' };
  const me = s.fighters.find(x => x.id === f.fighterId)!; const pv = previewWeek(s, chosen); const g = pv.gains;
  const wear = final ? me.fatigue : null;
  const fighters = s.fighters.map(x => x.id !== f.fighterId ? { ...x, fatigue: Math.max(0, x.fatigue - 10) }
    : { ...x, tech: x.tech + (g.tech ?? 0), clinch: x.clinch + (g.clinch ?? 0), power: x.power + (g.power ?? 0), cardio: x.cardio + (g.cardio ?? 0), fatigue: pv.fatigueAfter });
  let n = advanceDays({ ...s, fighters }, 7);
  let fight: Fight = { ...f, campLog: [...f.campLog, { week: f.campLog.length + 1, plan: chosen, by, gains: g, fatigueAfter: pv.fatigueAfter }], wearBeforeFinal: wear ?? f.wearBeforeFinal };
  n = { ...n, fight };
  if (!final) return { ok: true, state: n };
  const chance = missWeightChance(n, chosen as FinalPlan);
  const [roll, seed] = rand(f.rng); const [roll2, seed2] = rand(seed);
  const made = roll >= chance; const overKg = made ? 0 : Math.round((0.3 + roll2 * 1.2) * 10) / 10;
  fight = { ...fight, rng: seed2, weighIn: { made, overKg, fine: made ? 0 : Math.round(f.purse * TUNING.weighFinePct / 100), chance }, energy: made ? 100 : 88 };
  return { ok: true, state: { ...n, day: f.day, step: 'weighin', prestige: Math.max(0, n.prestige - (made ? 0 : 3)), fight } };
}
/** "Set it once": the coach runs every remaining week, including the last one. */
export function automateCamp(s: GameState): GameState {
  let n = s; while (n.step === 'camp' && n.fight && weeksLeft(n.fight) > 0) { const r = runCampWeek(n, 'coach'); if (!r.ok) break; n = r.state; }
  return n;
}
export function enterRing(s: GameState): GameState {
  return s.step === 'weighin' && s.fight ? { ...s, step: 'fight', fight: { ...s.fight, odds: openingOdds(s) } } : s;
}

// ---- Fight night -----------------------------------------------------------
function rand(seed: number): [number, number] { // mulberry32: returns [value 0..1, next seed]
  let t = (seed + 0x6D2B79F5) >>> 0; const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
const rating = (a: { tech: number; clinch: number; power: number }, round: number) =>
  round <= 2 ? 0.5 * a.tech + 0.2 * a.clinch + 0.3 * a.power : 0.35 * a.tech + 0.45 * a.clinch + 0.2 * a.power; // later rounds reward clinch and control
const INSTR = { keep: { mult: 1, cost: 14 }, conserve: { mult: 0.88, cost: 8 }, pace: { mult: 1.15, cost: 22 } };
const oddsFrom = (lead: number) => { const p = Math.min(0.85, Math.max(0.15, 1 / (1 + Math.exp(-lead / 22)))); return Math.max(1.05, Math.round((0.92 / p) * 100) / 100); };
function openingOdds(s: GameState): number {
  const f = s.fighters.find(f => f.id === s.fight!.fighterId)!;
  const o = opponentOf(s.fight!);
  return oddsFrom((rating(f, 1) + rating(f, 4)) / 2 - (rating(o, 1) + rating(o, 4)) / 2);
}
export function setInstruction(s: GameState, next: Instruction): GameState {
  return s.step === 'fight' && s.fight && !s.fight.outcome ? { ...s, fight: { ...s.fight, next } } : s;
}
/**
 * Wagering uses the camp's own fictional baht, so a bad night at the ring can cost a month of wages.
 * A bet never touches the fight engine: judges score from the action alone.
 */
export function placeBet(s: GameState, stake: number): Result {
  const f = s.fight; if (s.step !== 'fight' || !f || f.outcome || !s.adultBetting) return { ok: false, reason: 'step' };
  if (!Number.isInteger(stake) || stake <= 0 || stake > TUNING.betCapPerRound) return { ok: false, reason: 'limit' };
  if (stake > s.cash) return { ok: false, reason: 'cash' };
  if (f.bets.some(b => b.afterRound === f.log.length)) return { ok: false, reason: 'limit' };
  const n = spend(s, stake, 'bet-stake', 'bookmaker');
  return { ok: true, state: { ...n, fight: { ...f, bets: [...f.bets, { afterRound: f.log.length, stake, odds: f.odds }] } } };
}
export function setAdultBetting(s: GameState, on: boolean): GameState { return { ...s, adultBetting: on }; }

/** Simulates only the next round, using the instruction chosen before it. */
export function simulateRound(s: GameState): GameState {
  const ft = s.fight; if (s.step !== 'fight' || !ft || ft.outcome) return s;
  const me = s.fighters.find(f => f.id === ft.fighterId)!; const round = ft.log.length + 1; const OPPONENT = opponentOf(ft);
  let seed = ft.rng; const r = () => { const [v, n] = rand(seed); seed = n; return v; };
  const ins = INSTR[ft.next];
  const oppIns = round >= 3 && round <= 4 ? INSTR.pace : round === 5 ? INSTR.conserve : INSTR.keep; // traditional pacing
  const eff = (a: { tech: number; clinch: number; power: number }, energy: number, mult: number, fatigue: number) =>
    rating(a, round) * (0.55 + 0.45 * energy / 100) * mult * (1 - fatigue / 250) + (r() - 0.5) * 16;
  const margin = eff(me, ft.energy, ins.mult, me.fatigue) - eff(OPPONENT, ft.oppEnergy, oppIns.mult, 0);
  const cards: [number, number][] = [0, 1, 2].map(() => {
    const m = margin + (r() - 0.5) * 8;
    return m > 14 ? [10, 8] : m > 0 ? [10, 9] : m < -14 ? [8, 10] : [9, 10];
  });
  const energy = Math.max(5, ft.energy - ins.cost * (1.3 - me.cardio / 100));
  const oppEnergy = Math.max(5, ft.oppEnergy - oppIns.cost * (1.3 - OPPONENT.cardio / 100));
  const lead = ft.log.reduce((a, l) => a + l.margin, 0) + margin;
  const seen = lead + (r() - 0.5) * 12; // the crowd's impression is noisy and is not the judges' score
  const crowd = seen > 5 ? 'ours' : seen < -5 ? 'theirs' : 'even';
  const odds = oddsFrom(seen);
  const log = [...ft.log, { round, instruction: ft.next, margin: Math.round(margin * 10) / 10, cards, energy: Math.round(energy), oppEnergy: Math.round(oppEnergy), crowd, odds } as RoundLog];
  let fight: Fight = { ...ft, rng: seed, energy, oppEnergy, log, odds };
  if (round >= ft.rounds) {
    const totals: [number, number][] = [0, 1, 2].map(j => [log.reduce((a, l) => a + l.cards[j][0], 0), log.reduce((a, l) => a + l.cards[j][1], 0)]);
    const ours = totals.filter(t => t[0] > t[1]).length, theirs = totals.filter(t => t[1] > t[0]).length;
    fight = { ...fight, totals, outcome: ours > theirs ? 'win' : theirs > ours ? 'loss' : 'draw' };
  }
  return { ...s, fight };
}
/** The coach follows the plan for the rest of the bout. */
export function delegateRest(s: GameState): GameState {
  let n = s; if (n.step !== 'fight' || !n.fight) return s;
  n = { ...n, fight: { ...n.fight, delegated: true } };
  while (n.fight && !n.fight.outcome) {
    const f = n.fight; const lead = f.log.reduce((a, l) => a + l.margin, 0);
    const next: Instruction = f.energy < 35 ? 'conserve' : f.log.length === 4 && lead > 8 ? 'conserve' : lead < -6 && f.energy > 55 ? 'pace' : 'keep';
    n = simulateRound({ ...n, fight: { ...f, next } });
  }
  return n;
}
/** Pays purse, athlete share, travel and any fictional bet exactly once, even after a reload. */
export function settleFight(s: GameState): GameState {
  const f = s.fight; if (s.step !== 'fight' || !f || !f.outcome || f.settled) return s;
  const c = s.contracts.find(c => c.fighterId === f.fighterId)!;
  const purse = f.purse + (f.outcome === 'win' ? f.winBonus : 0); const share = Math.round(purse * c.purseSharePct / 100);
  let n = move(s, purse, 'purse', 'promoter'); n = spend(n, share, 'purse-share', f.fighterId); n = spend(n, f.travel, 'travel', 'transport');
  if (f.weighIn?.fine) n = spend(n, f.weighIn.fine, 'weight-fine', f.opponentId);
  const payout = betPayout(f); if (payout) n = move(n, payout, 'bet-payout', 'bookmaker');
  const fighters = n.fighters.map(x => x.id !== f.fighterId ? x : { ...x, fatigue: Math.min(100, x.fatigue + 45),
    record: { w: x.record.w + (f.outcome === 'win' ? 1 : 0), l: x.record.l + (f.outcome === 'loss' ? 1 : 0), d: x.record.d + (f.outcome === 'draw' ? 1 : 0) } });
  const d = f.outcome === 'win' ? 1 : f.outcome === 'loss' ? -1 : 0;
  return { ...n, fighters, fight: { ...f, settled: true }, step: 'result',
    prestige: Math.max(0, Math.min(100, n.prestige + 2 + d * 3)), morale: Math.max(0, Math.min(100, n.morale + d * 8)) };
}
export function betPayout(f: Fight): number {
  return f.bets.reduce((a, b) => a + (f.outcome === 'win' ? Math.round(b.stake * b.odds) : f.outcome === 'draw' ? b.stake : 0), 0);
}
export function finish(s: GameState): GameState { return s.step === 'result' ? { ...s, step: 'end' } : s; }

// ---- Saves -----------------------------------------------------------------
/** Brings an older save forward without losing what the player already owns. */
export function migrate(raw: any): GameState | null {
  if (!raw || !Array.isArray(raw.ledger)) return null;
  let s = raw;
  if (s.saveVersion === 1) s = { ...s, saveVersion: 2, step: s.step === 'placed' ? 'coach' : s.step, staff: [], fighters: [], contracts: [], scout: null, declined: [] };
  if (s.saveVersion === 2) {
    const fighters = (s.fighters as any[]).map(f => { const p = PROSPECTS.find(p => p.id === f.id)!; const [w, l] = p.record.split('-').map(Number); return { tech: p.tech, clinch: p.clinch, power: p.power, cardio: p.cardio, fatigue: 0, record: { w, l, d: 0 }, ...f }; });
    s = { ...s, saveVersion: 3, fighters, school: null, lastSession: [], sessions: 0, fight: null, adultBetting: true };
  }
  if (s.saveVersion === 3) {
    const { credits: _c, ...rest } = s; const id = (x: string) => (x === 'dao' ? 'daeng' : x);
    const fight = s.fight ? { opponentId: opponentFor(s.fight.fighterId).id, limitKg: PROSPECTS.find(p => p.id === s.fight.fighterId)!.weightKg, weighIn: null, ...s.fight, bets: [] } : null;
    s = { ...rest, saveVersion: 4, staff: s.staff.map((c: any) => ({ ...c, id: id(c.id) })), fight };
  }
  if (s.saveVersion === 4) {
    const early = s.step === 'prefight';
    const fight = s.fight ? { campWeeks: early ? TUNING.campWeeks : 0, campLog: [], wearBeforeFinal: null, ...s.fight, day: early ? s.day + TUNING.campWeeks * 7 : s.fight.day,
      weighIn: s.fight.weighIn ? { chance: 0, ...s.fight.weighIn } : null } : null;
    s = { ...s, saveVersion: 5, wageDay: TUNING.wageDay, step: early ? 'camp' : s.step, fight };
  }
  return s.saveVersion === 5 ? s as GameState : null;
}
const KEY = 'nakmuay-save-v1';
export function save(s: GameState): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
export function load(): GameState | null {
  try { const raw = localStorage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : null; } catch { return null; }
}
export function clearSave(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
