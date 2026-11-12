import { describe, it, expect } from 'vitest';
import * as G from '../src/sim/state';
import type { GameState, Result } from '../src/sim/state';

const ok = (r: Result): GameState => { if (!r.ok) throw new Error(r.reason); return r.state; };
const reconciles = (s: GameState) => expect(G.TUNING.startCash + s.ledger.reduce((a, e) => a + e.amount, 0)).toBe(s.cash);
const roster = (who: string[]) => G.closeReport(who.reduce((s, id) => ok(G.offerContract(s, id)),
  G.waitForScout(ok(G.sendScout(ok(G.hireCoach(ok(G.buyMat(G.startPlacing(G.openGate(ok(G.buyProperty(G.visitLocations(G.newGame()), 'bangkok')))), 4, 3)), 'daeng')), 'fair')))));
const booked = (who = ['niran', 'petch']) => ok(G.acceptOffer(G.seeOffer(G.runMorning(G.chooseSchool(G.planTraining(roster(who)), 'clinch')))));
const fightOut = (s: GameState) => G.finish(G.settleFight(G.delegateRest(G.enterRing(G.automateCamp(s)))));
const fresh = (s: GameState): GameState => ({ ...s, fighters: s.fighters.map(f => ({ ...f, fatigue: 0 })) });
const hub = (who?: string[]) => fresh(fightOut(booked(who)));
const weeks = (s: GameState, n: number) => { for (let i = 0; i < n && s.step === 'hub'; i++) s = ok(G.runWeek(s)); return s; };

describe('season hub', () => {
  it('the first fight leads into the camp hub, not to an ending', () => {
    const s = hub(); expect(s.step).toBe('hub'); expect(s.fight).toBeNull(); expect(s.lastFight?.settled).toBe(true); reconciles(s);
  });
  it('saving and reloading keeps cash, roster, camp and a fight in progress', () => {
    const h = weeks({ ...hub(), tourism: { slots: 3, price: 'normal' } }, 2); expect(G.migrate(JSON.parse(JSON.stringify(h)))).toEqual(h);
    const camp = ok(G.runCampWeek(ok(G.takeOffer(h, h.offers[0].id)), 'coach')); const back = G.migrate(JSON.parse(JSON.stringify(camp)))!;
    expect(back).toEqual(camp); expect(G.automateCamp(back)).toEqual(G.automateCamp(camp));
  });
  it('a version 5 save that had ended lands in the hub with careers filled in', () => {
    const { fans: _f, level: _l, mood, respect, ...old } = hub() as any;
    const m = G.migrate({ ...old, saveVersion: 5, morale: mood, prestige: respect, step: 'end', fight: (hub() as any).lastFight, fighters: old.fighters.map(({ life: _x, ...f }: any) => f) })!;
    expect(m.step).toBe('hub'); expect(m.fighters[0].life).toBeGreaterThan(0); expect(m.level).toBe(1); expect(m.respect).toBe(respect);
  });
});

describe('trainers', () => {
  const crowded = () => weeks({ ...hub(), fans: 40, tourism: { slots: 8, price: 'normal' } }, 3);
  it('one trainer with too many people yields less and raises the risk at the scales', () => {
    const calm = weeks(hub(), 3), busy = crowded();
    expect(G.loads(busy)[0].people).toBeGreaterThan(G.loads(busy)[0].capacity);
    expect(busy.staff[0].fatigue).toBeGreaterThan(calm.staff[0].fatigue);
    expect(G.trainerEff(busy)).toBeLessThan(G.trainerEff(calm));
    const b = booked(), tired = { ...b, staff: busy.staff };
    expect(G.missWeightChance(tired, 'sharpen')).toBeGreaterThan(G.missWeightChance(b, 'sharpen'));
    expect(G.previewWeek(tired, 'hard').gains.clinch!).toBeLessThan(G.previewWeek(b, 'hard').gains.clinch!);
  });
  it('a second trainer improves both numbers', () => {
    const base = { ...hub(), fans: 40, level: 2, tourism: { slots: 8, price: 'normal' as const } };
    const one = weeks(base, 3), two = weeks(ok(G.hireTrainer(base, 'somchai')), 3);
    expect(G.trainerEff(two)).toBeGreaterThan(G.trainerEff(one)); expect(G.scaleRisk(two)).toBeLessThan(G.scaleRisk(one));
  });
  it('level 1 has room for one trainer only', () => { expect(G.hireTrainer(hub(), 'somchai')).toEqual({ ok: false, reason: 'slots' }); });
  it('kratom relieves fatigue the first week and less on every week in a row', () => {
    const tired = (s: GameState) => ({ ...s, staff: s.staff.map(c => ({ ...c, fatigue: 90 })) });
    let s = tired(hub()); const drops: number[] = []; const trust: number[] = [];
    for (let i = 0; i < 3; i++) { const u = ok(G.useKratom(s, 'daeng')); drops.push(90 - u.staff[0].fatigue); trust.push(u.staff[0].reliability); expect(G.useKratom(u, 'daeng').ok).toBe(false); s = tired(ok(G.runWeek(u))); }
    expect(drops[0]).toBeGreaterThan(drops[1]); expect(drops[1]).toBeGreaterThan(drops[2]); expect(trust[2]).toBeLessThan(trust[0]); reconciles(s);
    const clean = tired(ok(G.runWeek(s))); expect(90 - ok(G.useKratom(clean, 'daeng')).staff[0].fatigue).toBe(drops[0]); // a week without it resets the streak
  });
  it('a raise adds capacity for good and weighs on the payroll', () => {
    const s = hub(), r = ok(G.giveRaise(s, 'daeng'));
    expect(G.capacityOf(r.staff[0])).toBe(G.capacityOf(s.staff[0]) + 1); expect(G.monthlyPayroll(r)).toBe(G.monthlyPayroll(s) + G.TRAINER.raiseWage); expect(r.cash).toBe(s.cash);
  });
  it('a trainer kept at the limit misses work and then leaves', () => {
    let s: GameState = { ...hub(), fans: 60, tourism: { slots: 8, price: 'low' } }; const seen = new Set<string>();
    for (let i = 0; i < 14 && s.step === 'hub' && s.staff.length; i++) { s = ok(G.runWeek(s)); s.lastWeek.events.forEach(e => seen.add(e.key)); }
    expect(seen.has('ev_absent')).toBe(true); expect(seen.has('ev_left')).toBe(true); expect(s.staff).toHaveLength(0);
  });
});

describe('tourists', () => {
  it('more fans bring more tourists, and more tourists load the trainers', () => {
    const few = { ...hub(), fans: 5, tourism: { slots: 8, price: 'normal' as const } }, many = { ...few, fans: 30 };
    expect(G.touristsNow(many)).toBeGreaterThan(G.touristsNow(few)); expect(G.loads(many)[0].people).toBeGreaterThan(G.loads(few)[0].people);
    expect(G.demand(many, 'high')).toBeLessThan(G.demand(many, 'low'));
  });
  it('classes are paid into the ledger each week', () => {
    const s = { ...hub(), tourism: { slots: 2, price: 'normal' as const } }, n = ok(G.runWeek(s));
    expect(n.ledger.filter(e => e.sourceType === 'tourism').map(e => e.amount)).toEqual([2 * G.TOURISM.price.normal.fee]); reconciles(n);
  });
});

describe('fighters', () => {
  it('a knockout costs more career than a points loss, a severe cut more than a light one', () => {
    const base = { outcome: 'loss' as const, ko: false, cutPct: 2, wear: 20, gapDays: 60, streak: 1 };
    expect(G.lifeCost({ ...base, ko: true })).toBeGreaterThan(G.lifeCost(base));
    expect(G.lifeCost({ ...base, cutPct: 6 })).toBeGreaterThan(G.lifeCost(base));
    expect(G.lifeCost({ ...base, streak: 3 })).toBeGreaterThan(G.lifeCost(base));
    expect(G.lifeCost({ ...base, wear: 80 })).toBeGreaterThan(G.lifeCost(base)); expect(G.lifeCost({ ...base, gapDays: 10 })).toBeGreaterThan(G.lifeCost(base));
  });
  it('every fight shortens the career of the one who fought', () => {
    const s = hub(), id = s.lastFight!.fighterId, f = s.fighters.find(x => x.id === id)!; expect(f.life).toBeLessThan(f.lifeMax); expect(f.lastFightDay).toBeGreaterThan(0);
  });
  it('an athlete above the camp level refuses the contract', () => {
    const s = { ...hub(['niran']), candidates: ['somsak', 'chai'] };
    expect(G.signCandidate(s, 'chai')).toEqual({ ok: false, reason: 'level' }); expect(G.appraise(s, 'chai').needsLevel).toBe(2);
    const signed = ok(G.signCandidate(s, 'somsak')); expect(signed.fighters).toHaveLength(2); expect(signed.contracts[1].consented).toBe(true); reconciles(signed);
    expect(ok(G.signCandidate({ ...s, level: 2 }, 'chai')).fighters.some(f => f.id === 'chai')).toBe(true);
  });
  it('the roster cannot pass the level limit', () => { expect(G.signCandidate({ ...hub(['niran', 'petch', 'mali']), candidates: ['somsak'] }, 'somsak')).toEqual({ ok: false, reason: 'slots' }); });
  it('over 200 weigh-ins a worn athlete makes weight sometimes and misses sometimes', () => {
    let made = 0; const b = booked();
    for (let i = 1; i <= 200; i++) {
      const worn = { ...b, fighters: b.fighters.map(f => ({ ...f, fatigue: 85 })), fight: { ...b.fight!, rng: i * 7919, campLog: [b, b].map((_, w) => ({ week: w + 1, plan: 'hard' as const, by: 'player' as const, gains: {}, fatigueAfter: 85 })) } };
      if (ok(G.runCampWeek(worn, 'sharpen')).fight!.weighIn!.made) made++;
    }
    expect(made).toBeGreaterThan(20); expect(made).toBeLessThan(180);
  });
  it('retiring is the player\'s call and never happens to an athlete with a bout booked', () => {
    const s = weeks(hub(), 1), o = s.offers[0], camp = ok(G.takeOffer(s, o.id));
    expect(G.retire(camp, o.fighterId)).toEqual({ ok: false, reason: 'busy' });
    const r = ok(G.retire(s, o.fighterId)); expect(r.fighters.some(f => f.id === o.fighterId)).toBe(false); expect(r.alumni).toHaveLength(1); expect(r.offers).toHaveLength(0);
    expect(G.monthlyPayroll(r)).toBeLessThan(G.monthlyPayroll(s));
  });
  it('a season closes careers by one and lets everyday weight creep up', () => {
    const s = weeks({ ...hub(), nextOfferDay: 9999 }, 12); expect(s.step).toBe('season');
    const row = s.seasonReport!.rows[0]; expect(row.life).toBe(Math.round((row.lifeBefore - 1) * 10) / 10);
    expect(s.fighters[0].walkKg).toBeGreaterThan(hub().fighters[0].walkKg); expect(G.nextSeason(s).seasonNo).toBe(2);
  });
});

describe('manager', () => {
  it('brings back talents, fight contracts or sponsors, and nothing new arrives while away', () => {
    const start = { ...hub(), nextOfferDay: 0 };
    const t = weeks(ok(G.sendManager(start, 'talents')), 2); expect(t.candidates.length).toBeGreaterThan(0); expect(t.offers).toHaveLength(0); expect(t.manager.mission).toBeNull();
    const f = weeks(ok(G.sendManager(start, 'fights')), 1); expect(f.offers.length).toBeGreaterThan(0); expect(f.offers.every(o => o.source === 'mission')).toBe(true);
    const sp = weeks(ok(G.sendManager(start, 'sponsors')), 2); expect(sp.sponsorOffers.length).toBeGreaterThan(0);
    expect(G.sendManager(ok(G.sendManager(start, 'fights')), 'talents')).toEqual({ ok: false, reason: 'busy' }); reconciles(f);
  });
  it('offers are always against an opponent of the same sex and at the athlete\'s class', () => {
    const s = weeks(hub(['mali']), 1), o = s.offers[0]; expect(o.opp.look).toBe('fah'); expect(ok(G.takeOffer(s, o.id)).fight!.limitKg).toBe(54);
  });
  it('a sponsor pays monthly and leaves when the promised fights did not happen', () => {
    const s = ok(G.signSponsor({ ...hub(), sponsorOffers: ['drink'], nextOfferDay: 9999, fightsThisMonth: 0 }, 'drink'));
    const n = weeks(s, 5); expect(n.sponsors).toHaveLength(0); expect(n.ledger.some(e => e.sourceType === 'sponsorship')).toBe(false);
    const kept = weeks({ ...s, fightsThisMonth: 2 }, 5); expect(kept.ledger.filter(e => e.sourceType === 'sponsorship').map(e => e.amount)).toEqual([9000]);
  });
});

describe('academy level and money', () => {
  it('the upgrade is refused without fans, goal or cash, and charges the works once', () => {
    const s = hub(), rich = (x: GameState, cash: number): GameState => ({ ...x, cash, ledger: [...x.ledger, { id: 999, day: 1, amount: cash - x.cash, sourceType: 'test', recipient: 'x' }] });
    expect(G.levelUp(rich({ ...s, fans: 10, wins: 5 }, 200_000))).toEqual({ ok: false, reason: 'level' });
    expect(G.levelUp(rich({ ...s, fans: 20, wins: 4 }, 200_000))).toEqual({ ok: false, reason: 'level' });
    expect(G.levelUp(rich({ ...s, fans: 20, wins: 5 }, 100_000))).toEqual({ ok: false, reason: 'cash' });
    const up = ok(G.levelUp(rich({ ...s, fans: 20, wins: 5 }, 200_000))); expect(up.level).toBe(2); expect(up.cash).toBe(80_000);
    expect(up.ledger.filter(e => e.sourceType === 'construction')).toHaveLength(1); expect(G.levelUp(up).ok).toBe(false); reconciles(up);
  });
  it('cash above the level ceiling is lost and the ledger records it', () => {
    const s = hub(), full = { ...s, cash: 299_000, ledger: [...s.ledger, { id: 999, day: 1, amount: 299_000 - s.cash, sourceType: 'test', recipient: 'x' }], tourism: { slots: 2, price: 'normal' as const } };
    const n = ok(G.runWeek(full)); expect(n.cash).toBeLessThanOrEqual(300_000); expect(n.ledger.some(e => e.sourceType === 'over-ceiling')).toBe(true); reconciles(n);
  });
  it('the loan is paid down with the payroll', () => {
    const s = weeks({ ...hub(), tourism: { slots: 3, price: 'normal' as const }, nextOfferDay: 9999 }, 5);
    expect(s.debt).toBeLessThan(250_000); expect(s.ledger.some(e => e.sourceType === 'loan-payment')).toBe(true); reconciles(s);
  });
  it('a careful season without a single bet ends with cash in hand and no new debt', () => {
    let s: GameState = { ...hub(), adultBetting: false, tourism: { slots: 4, price: 'normal' } }; s = ok(G.sendManager(s, 'sponsors'));
    for (let guard = 0; guard < 40 && s.step !== 'season'; guard++) {
      if (s.sponsorOffers.includes('gear')) s = ok(G.signSponsor(s, 'gear'));
      if (s.step === 'hub' && s.offers.length && !s.fight) { const r = G.takeOffer(s, s.offers[0].id); if (r.ok) { s = fightOut(r.state); continue; } }
      if (s.step === 'hub' && !s.manager.mission && !s.offers.length && s.cash > 20_000) { const r = G.sendManager(s, 'fights'); if (r.ok) s = r.state; }
      s = ok(G.runWeek(s));
    }
    expect(s.step).toBe('season'); expect(s.cash).toBeGreaterThan(0); expect(s.debt).toBeLessThan(250_000);
    expect(s.ledger.some(e => e.sourceType === 'emergency-loan' || e.sourceType === 'bet-stake')).toBe(false); expect(s.wins + s.fightsThisMonth).toBeGreaterThan(0); reconciles(s);
  });
  it('the same seed plays the same season', () => { const a = weeks(hub(), 6), b = weeks(hub(), 6); expect(a).toEqual(b); });
});
