import { describe, it, expect } from 'vitest';
import * as G from '../src/sim/state';
import type { GameState, Result } from '../src/sim/state';

const ok = (r: Result): GameState => { if (!r.ok) throw new Error(r.reason); return r.state; };
const reconciles = (s: GameState) => expect(G.TUNING.startCash + s.ledger.reduce((a, e) => a + e.amount, 0)).toBe(s.cash);
const owned = () => ok(G.buyProperty(G.visitLocations(G.newGame()), 'bangkok'));
const placing = () => G.startPlacing(G.openGate(owned()));
const withMat = () => ok(G.buyMat(placing(), 4, 3));
const scouted = (coach: string, trip: string) => G.waitForScout(ok(G.sendScout(ok(G.hireCoach(withMat(), coach)), trip)));
const roster = (coach = 'daeng', who = ['niran', 'mali']) => G.closeReport(who.reduce((s, id) => ok(G.offerContract(s, id)), scouted(coach, 'fair')));
const booked = (who = ['niran', 'mali'], school: G.School = 'clinch') => ok(G.acceptOffer(G.seeOffer(G.runMorning(G.chooseSchool(G.planTraining(roster('daeng', who)), school)))));
const atFight = (school: G.School = 'clinch') => G.enterRing(ok(G.goToWeighIn(booked(undefined, school), true)));

describe('opening economics', () => {
  it('starts on day 1 with 300,000, no camp, no people', () => {
    const s = G.newGame(); expect(s.cash).toBe(300_000); expect(s.day).toBe(1); expect(s.region).toBeNull();
    expect(s.staff.length + s.fighters.length + s.facilities.length + s.ledger.length).toBe(0);
  });
  it('Bangkok costs 190,000 and leaves 110,000, once', () => {
    const s = owned(); expect(s.cash).toBe(110_000); expect(G.buyProperty(s, 'bangkok').ok).toBe(false); reconciles(s);
  });
  it('regions not built yet cannot be bought', () => { expect(G.buyProperty(G.visitLocations(G.newGame()), 'phuket').ok).toBe(false); });
});
describe('first mat', () => {
  it('debits exactly once and persists one facility', () => {
    const s = withMat(); expect(s.cash).toBe(102_000); expect(s.facilities).toHaveLength(1);
    expect(G.buyMat(s, 0, 0).ok).toBe(false); reconciles(s);
  });
  it('rejects pillars, passage, gutter and out of bounds', () => {
    const s = placing();
    for (const [x, z] of [[1, 2], [4, 0], [0, 6], [10, 3]]) expect(G.canPlace(s, x, z)).toBe(false);
    expect(G.buyMat(s, 1, 2)).toEqual({ ok: false, reason: 'blocked' });
  });
  it('keeps cash and map coherent when money is short', () => { expect(G.buyMat({ ...placing(), cash: 100 }, 4, 3)).toEqual({ ok: false, reason: 'cash' }); });
});
describe('coach and scouting', () => {
  it('hires exactly one coach and charges the signing fee once', () => {
    const s = ok(G.hireCoach(withMat(), 'daeng')); expect(s.staff).toHaveLength(1); expect(s.cash).toBe(93_000);
    expect(G.hireCoach(s, 'somchai').ok).toBe(false); reconciles(s);
  });
  it('debits the trip once and time moves only when the player waits', () => {
    const s = ok(G.sendScout(ok(G.hireCoach(withMat(), 'daeng')), 'fair'));
    expect(s.day).toBe(1); expect(s.scout).toEqual({ tripId: 'fair', returnDay: 4 }); expect(G.sendScout(s, 'camp').ok).toBe(false);
    expect(G.waitForScout(s).day).toBe(4);
  });
  it('a watched fight gives a narrower estimate than training', () => {
    const a = G.estimate(scouted('daeng', 'fair'), 'mali'), b = G.estimate(scouted('daeng', 'camp'), 'mali');
    expect(a.high - a.low).toBeLessThan(b.high - b.low);
  });
  it('only the athlete who accepted joins; no contract without consent', () => {
    const s = scouted('somchai', 'camp');
    expect(G.offerContract(s, 'niran')).toEqual({ ok: false, reason: 'declined' });
    const signed = ok(G.offerContract(s, 'mali'));
    expect(signed.fighters.map(f => f.id)).toEqual(['mali']); expect(signed.contracts[0].consented).toBe(true);
    expect(G.offerContract(signed, 'mali').ok).toBe(false); expect(G.monthlyPayroll(signed)).toBe(20_000); reconciles(signed);
  });
  it('signing nobody leaves the camp empty and allows another search', () => {
    const s = G.closeReport(scouted('somchai', 'camp')); expect(s.fighters).toHaveLength(0);
    expect(G.planTraining(s).step).toBe('roster'); expect(G.searchAgain(s).step).toBe('scout');
  });
});
describe('training', () => {
  it('improves the right skill, raises fatigue and advances one day', () => {
    const before = G.chooseSchool(G.planTraining(roster()), 'clinch'); const after = G.runMorning(before);
    expect(after.day).toBe(before.day + 1);
    after.fighters.forEach((f, i) => { expect(f.clinch).toBeGreaterThan(before.fighters[i].clinch); expect(f.fatigue).toBeGreaterThan(0); });
    expect(after.lastSession.every(l => l.activity === 'clinch')).toBe(true);
  });
  it('with one pair of pads only one athlete does padwork', () => {
    const s = G.runMorning(G.chooseSchool(G.planTraining(roster()), 'technical'));
    expect(s.lastSession.filter(l => l.activity === 'pads')).toHaveLength(1); expect(s.lastSession.filter(l => l.activity === 'rope')).toHaveLength(1);
  });
});
describe('first fight', () => {
  it('an exhausted athlete refuses the bout', () => {
    const s = G.seeOffer(G.runMorning(G.chooseSchool(G.planTraining(roster('daeng', ['mali'])), 'balanced')));
    const tired = { ...s, fighters: s.fighters.map(f => ({ ...f, fatigue: 90 })) };
    expect(G.acceptOffer(tired)).toEqual({ ok: false, reason: 'tired' }); expect(G.restDay(tired).fighters[0].fatigue).toBe(50);
  });
  it('simulates one round at a time and ends after five', () => {
    let s = atFight(); expect(s.fight!.log).toHaveLength(0);
    s = G.simulateRound(s); expect(s.fight!.log).toHaveLength(1); expect(s.fight!.outcome).toBeNull();
    for (let i = 0; i < 4; i++) s = G.simulateRound(G.setInstruction(s, 'keep'));
    expect(s.fight!.log).toHaveLength(5); expect(s.fight!.outcome).not.toBeNull(); expect(G.simulateRound(s)).toBe(s);
  });
  it('is reproducible, and instructions change the bout', () => {
    const run = (ins: G.Instruction) => { let s = atFight(); for (let i = 0; i < 5; i++) s = G.simulateRound(G.setInstruction(s, ins)); return s.fight!; };
    expect(run('keep').totals).toEqual(run('keep').totals);
    expect(run('pace').energy).toBeLessThan(run('conserve').energy);
  });
  it('bets never change the judges, are capped, and settle once', () => {
    let a = atFight(), b = atFight();
    const before = b.cash; b = ok(G.placeBet(b, 2000)); expect(b.cash).toBe(before - 2000); expect(G.placeBet(b, 500).ok).toBe(false); expect(G.placeBet(atFight(), 2001).ok).toBe(false);
    expect(G.placeBet({ ...atFight(), cash: 100 }, 500)).toEqual({ ok: false, reason: 'cash' });
    for (let i = 0; i < 5; i++) { a = G.simulateRound(a); b = G.simulateRound(b); }
    expect(b.fight!.totals).toEqual(a.fight!.totals); expect(b.fight!.log.map(l => l.cards)).toEqual(a.fight!.log.map(l => l.cards));
    expect(G.placeBet({ ...atFight(), adultBetting: false }, 50).ok).toBe(false);
    const done = G.settleFight(b); reconciles(done); expect(done.ledger.filter(e => e.sourceType === 'bet-stake')).toHaveLength(1);
    expect(done.ledger.filter(e => e.sourceType === 'bet-payout').length).toBe(G.betPayout(b.fight!) > 0 ? 1 : 0); expect(G.settleFight(done)).toBe(done);
  });
  it('purse, athlete share and travel reconcile with the ledger, once', () => {
    const fought = G.delegateRest(atFight()); const s = G.settleFight(fought); const f = s.fight!;
    const purse = 6_000 + (f.outcome === 'win' ? 3_000 : 0); const share = Math.round(purse * 0.6);
    const tail = s.ledger.filter(e => ['purse', 'purse-share', 'travel'].includes(e.sourceType)).map(e => e.amount); expect(tail).toHaveLength(3);
    expect(tail[0]).toBe(purse); expect([Math.round(purse * 0.6), Math.round(purse * 0.55)]).toContain(-tail[1]); expect(tail[2]).toBe(-800);
    expect(-tail[1]).toBeGreaterThanOrEqual(purse / 2); void share;
    reconciles(s); expect(G.settleFight(s)).toBe(s); expect(s.step).toBe('result');
    const rec = s.fighters.find(x => x.id === f.fighterId)!.record; expect(rec.w + rec.l + rec.d).toBe(14);
  });
  it('better preparation wins more often across many seeds', () => {
    const wins = (boost: number) => { let w = 0; for (let k = 1; k <= 60; k++) { let s = atFight();
      s = { ...s, fighters: s.fighters.map(f => ({ ...f, tech: f.tech + boost, clinch: f.clinch + boost })), fight: { ...s.fight!, rng: k * 7919 } };
      if (G.delegateRest(s).fight!.outcome === 'win') w++; } return w; };
    expect(wins(15)).toBeGreaterThan(wins(-15));
  });
});
describe('realism', () => {
  it('bouts are same-sex and at the athlete\'s weight', () => {
    expect(booked(['mali']).fight!.opponentId).toBe('fah'); expect(booked(['petch']).fight!.opponentId).toBe('kaew');
    expect(booked(['mali']).fight!.limitKg).toBe(54);
  });
  it('most of the scouted pool is male', () => { expect(G.PROSPECTS.filter(p => p.sex === 'm').length).toBeGreaterThan(G.PROSPECTS.filter(p => p.sex === 'f').length); });
  it('missing weight is more likely without support, with a bigger cut, and when tired', () => {
    const petch = booked(['petch']), mali = booked(['mali']);
    expect(G.missWeightChance(petch, false)).toBeGreaterThan(G.missWeightChance(petch, true));
    expect(G.missWeightChance(petch, false)).toBeGreaterThan(G.missWeightChance(mali, false));
    const tired = { ...mali, fighters: mali.fighters.map(f => ({ ...f, fatigue: 90 })) };
    expect(G.missWeightChance(tired, false)).toBeGreaterThan(G.missWeightChance(mali, false));
  });
  it('a missed weight is fined once, hurts prestige and weakens the athlete', () => {
    let missed: GameState | null = null, made = 0;
    for (let k = 1; k <= 200; k++) { const b = booked(['petch']); const w = ok(G.goToWeighIn({ ...b, fight: { ...b.fight!, rng: k * 104729 } }, false)); if (w.fight!.weighIn!.made) made++; else missed ??= w; }
    expect(made).toBeGreaterThan(120); expect(made).toBeLessThan(190); expect(missed).not.toBeNull();
    const w = missed!; expect(w.fight!.weighIn!.fine).toBe(1200); expect(w.fight!.energy).toBe(88); expect(w.prestige).toBe(2);
    const done = G.settleFight(G.delegateRest(G.enterRing(w))); expect(done.ledger.filter(e => e.sourceType === 'weight-fine').map(e => e.amount)).toEqual([-1200]); reconciles(done);
  });
  it('the nutritionist is paid once', () => { const b = booked(); const w = ok(G.goToWeighIn(b, true)); expect(w.cash).toBe(b.cash - 600); expect(G.goToWeighIn(w, true).ok).toBe(false); });
});
describe('saves', () => {
  it('migrates older saves and keeps what was bought', () => {
    const v1: any = { saveVersion: 1, day: 1, region: 'bangkok', cash: 102_000, debt: 250_000, debtDueDay: 30, morale: 50, prestige: 5, step: 'placed', lang: 'pt',
      facilities: [{ id: 'mat-1', type: 'mat', x: 4, z: 3, w: 3, d: 2, level: 1 }], ledger: [{ id: 1, day: 1, amount: -190_000, sourceType: 'property', recipient: 'seller' }] };
    const m = G.migrate(v1)!; expect(m.saveVersion).toBe(4); expect(m.step).toBe('coach'); expect(m.facilities).toHaveLength(1); expect(m.cash).toBe(102_000);
  });
  it('save data round-trips mid-fight', () => {
    const s = G.simulateRound(atFight()); const back = G.migrate(JSON.parse(JSON.stringify(s)))!;
    expect(G.simulateRound(back).fight!.log).toEqual(G.simulateRound(s).fight!.log);
  });
});
import { missingKeys } from '../src/i18n';
describe('localization', () => { it('every string exists in pt, en and th', () => { expect(missingKeys()).toEqual([]); }); });
