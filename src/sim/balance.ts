// Every balancing number of the game lives in this file.
// ALL VALUES ARE FICTIONAL: money, venues, odds and names are game tuning, not real Thai market data.

export const TUNING = {
  startCash: 300_000, loan: 250_000, loanDueDay: 30, wageDay: 30,
  loanInstallment: 8_000,     // paid with the payroll every month until the debt is gone
  matCost: 8_000, matW: 3, matD: 2,
  purse: 6_000, winBonus: 3_000, travel: 800,
  betCapPerRound: 2_000,      // bets use the camp's own fictional baht: a real risk to the runway
  weighFinePct: 20, campWeeks: 3,
  seed: 20261112,
};

export const REGIONS = [
  { id: 'bangkok' as const, price: 190_000, open: true },
  { id: 'phuket' as const, price: 150_000, open: false },
  { id: 'chiangmai' as const, price: 110_000, open: false },
];

/** Academy levels. Index 0 is level 1. `goal` is what must have been achieved before the upgrade can be bought. */
export const LEVELS = [
  { level: 1, fans: 0, goalWins: 0, cost: 0, trainers: 1, fighters: 3, cashCap: 300_000, maxFighterLevel: 1 },
  { level: 2, fans: 20, goalWins: 5, cost: 120_000, trainers: 2, fighters: 6, cashCap: 800_000, maxFighterLevel: 2 },
  { level: 3, fans: 45, goalWins: Infinity, cost: 400_000, trainers: 3, fighters: 10, cashCap: 2_500_000, maxFighterLevel: 3 },
  { level: 4, fans: 70, goalWins: Infinity, cost: 1_200_000, trainers: 5, fighters: 16, cashCap: 8_000_000, maxFighterLevel: 4 },
  { level: 5, fans: 90, goalWins: Infinity, cost: 3_500_000, trainers: 7, fighters: 24, cashCap: Infinity, maxFighterLevel: 5 },
];
/** Highest level that is actually playable in this build. */
export const MAX_BUILT_LEVEL = 2;

export const SEASON = { weeks: 12, ageEvery: 4, walkGainKg: 0.4, lowLife: 1.5, lowLifeDecay: 2 };

export const TRAINER = {
  capacity: [0, 6, 8, 10, 12, 14],     // people served well per week, by trainer level
  attrCap: [0, 78, 84, 90, 95, 99],    // how far a trainer of this level can take an attribute
  overPerPerson: 9, recover: 12,       // fatigue per person above capacity, recovery when at or under it
  tiredFrom: 30, tiredSpan: 140,       // efficiency = 1 - (fatigue - tiredFrom) / tiredSpan
  scaleFrom: 40, scalePerPoint: 0.003, // extra miss-weight chance per fatigue point above scaleFrom
  strainAt: 85, absentAfter: 2, leaveAfter: 4,
  kratomCost: 400, kratomRelief: [30, 18, 9, 4], kratomReliability: [3, 6, 9, 12],
  raiseWage: 2_000, raiseCapacity: 1, raiseRelief: 10, maxRaises: 3,
  fitBonus: 1.5,
};

export const COACHES = [
  { id: 'somchai', name: 'Kru Somchai', specialty: 'pads' as const, signing: 6_000, wage: 14_000, level: 1 },
  { id: 'daeng', name: 'Kru Daeng', specialty: 'clinch' as const, signing: 9_000, wage: 18_000, level: 1 },
];

export const TOURISM = {
  maxSlots: 8, base: 2, fansPerTourist: 5,
  price: { low: { fee: 1_500, demand: 1.4 }, normal: { fee: 2_500, demand: 1 }, high: { fee: 4_000, demand: 0.6 } },
};

export const TRAINING = { gain: 1, fatigue: 12, rest: 25, backOff: 70, easy: 10 };

export const TRIPS = [
  { id: 'camp', days: 1, cost: 2_500, source: 'training' as const },
  { id: 'fair', days: 3, cost: 4_500, source: 'fight' as const },
];
/** What the manager can be sent out to bring back. While away, no new opportunity arrives. */
export const MISSIONS = {
  talents: { weeks: 2, cost: 4_000 },
  fights: { weeks: 1, cost: 2_500 },
  sponsors: { weeks: 2, cost: 3_500 },
};
export const OFFERS = {
  everyDays: 14, validDays: 21,
  walkIn: { purse: [8_000, 12_000], winBonus: 4_000, travel: 800, campWeeks: [3], edge: [-10, -2] },
  mission: { purse: [12_000, 18_000], winBonus: 6_000, travel: 1_200, campWeeks: [2, 3, 4], edge: [-7, 1] },
  fans: { win: 2, loss: 1 }, respect: { win: 3, loss: -1 },
};
export const SPONSORS = [
  { id: 'gear', monthly: 5_000, months: 3, minFights: 1 },
  { id: 'drink', monthly: 9_000, months: 3, minFights: 2 },
  { id: 'market', monthly: 3_000, months: 4, minFights: 0, minFans: 10 },
];

/**
 * Talent pool. Most of it is male, as in the real circuit. `walkKg` is everyday weight, `weightKg` the fighting class.
 * `look` names the sprite set an athlete without their own art borrows for now.
 */
export const PROSPECTS = [
  { id: 'niran', name: 'Niran', sex: 'm' as const, age: 24, level: 1, life: 11, weightKg: 61, walkKg: 63, style: 'khao', record: '9-4', origin: 'Khon Kaen', signing: 8_000, stipend: 5_000, purseSharePct: 55, potential: 72, needsClinchCoach: true, tech: 44, clinch: 63, power: 55, cardio: 60, look: 'niran' },
  { id: 'petch', name: 'Petch', sex: 'm' as const, age: 21, level: 1, life: 14, weightKg: 57, walkKg: 60.5, style: 'mat', record: '11-6', origin: 'Korat', signing: 7_000, stipend: 5_000, purseSharePct: 50, potential: 70, needsClinchCoach: false, tech: 50, clinch: 42, power: 64, cardio: 54, look: 'petch' },
  { id: 'mali', name: 'Mali', sex: 'f' as const, age: 22, level: 1, life: 13, weightKg: 54, walkKg: 56, style: 'femur', record: '14-5', origin: 'Buriram', signing: 12_000, stipend: 6_000, purseSharePct: 60, potential: 78, needsClinchCoach: false, tech: 62, clinch: 40, power: 45, cardio: 58, look: 'mali' },
  { id: 'somsak', name: 'Somsak', sex: 'm' as const, age: 29, level: 1, life: 4, weightKg: 63.5, walkKg: 66, style: 'khao', record: '38-21', origin: 'Surin', signing: 4_000, stipend: 4_000, purseSharePct: 50, potential: 64, needsClinchCoach: false, tech: 56, clinch: 60, power: 50, cardio: 48, look: 'niran' },
  { id: 'chai', name: 'Chai', sex: 'm' as const, age: 20, level: 2, life: 16, weightKg: 59, walkKg: 60.5, style: 'femur', record: '22-5', origin: 'Ubon', signing: 20_000, stipend: 8_000, purseSharePct: 60, potential: 84, needsClinchCoach: false, tech: 68, clinch: 55, power: 58, cardio: 66, look: 'petch' },
  { id: 'yod', name: 'Yod', sex: 'm' as const, age: 23, level: 3, life: 13, weightKg: 65, walkKg: 68, style: 'mat', record: '41-9', origin: 'Nakhon Si Thammarat', signing: 45_000, stipend: 14_000, purseSharePct: 65, potential: 90, needsClinchCoach: false, tech: 74, clinch: 62, power: 78, cardio: 70, look: 'petch' },
];
/** Bouts are always same-sex and at the athlete's weight class. */
export const OPPONENTS = {
  m: { id: 'kaew', name: 'Kaew', tech: 50, clinch: 50, power: 52, cardio: 56, record: '11-7' },
  f: { id: 'fah', name: 'Fah', tech: 54, clinch: 46, power: 46, cardio: 57, record: '10-6' },
};
export const OPP_NAMES = {
  m: ['Kaew', 'Dam', 'Lek', 'Nong', 'Tong', 'Bank', 'Arm', 'Pon'],
  f: ['Fah', 'Nam', 'Ploy', 'Dao', 'Mint'],
};

/** Career wear, in seasons of fighting life. */
export const LIFE = {
  season: 1, fight: 0.1, lossPoints: 0.2, lossKo: 0.7, streakFrom: 2, streak: 0.2,
  severeCutPct: 4, severeCut: 0.3, lightCut: 0.1,
  wornFrom: 60, worn: 0.2, shortGapDays: 21, shortGap: 0.2,
};
export const KO = { behind: -16, ahead: 18, base: 0.16, tired: 0.12, lowLife: 0.15, ours: 0.12 };
