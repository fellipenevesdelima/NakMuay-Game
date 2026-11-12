import { describe, it, expect } from 'vitest';
import { newGame, openGate, startPlacing, buyMat, canPlace, TUNING } from '../src/sim/state';

const placing = () => startPlacing(openGate(newGame()));
describe('opening economics', () => {
  it('Bangkok leaves 110,000 after purchase and logs it', () => {
    const s = newGame();
    expect(s.cash).toBe(110_000);
    expect(s.ledger).toHaveLength(1);
    expect(s.facilities).toHaveLength(0);
  });
});
describe('first mat', () => {
  it('debits exactly once and persists one facility', () => {
    const r = buyMat(placing(), 4, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cash).toBe(110_000 - TUNING.matCost);
    expect(r.state.facilities).toHaveLength(1);
    const again = buyMat(r.state, 0, 0);
    expect(again.ok).toBe(false);
    const total = r.state.ledger.reduce((a, e) => a + e.amount, 0);
    expect(TUNING.startCash + total).toBe(r.state.cash);
  });
  it('rejects pillars, passage, gutter and out of bounds', () => {
    const s = placing();
    expect(canPlace(s, 1, 2)).toBe(false);  // pillar at 2,2
    expect(canPlace(s, 4, 0)).toBe(false);  // passage
    expect(canPlace(s, 0, 6)).toBe(false);  // gutter
    expect(canPlace(s, 10, 3)).toBe(false); // out of bounds
    expect(buyMat(s, 1, 2)).toEqual({ ok: false, reason: 'blocked' });
  });
  it('keeps cash and map coherent when money is short', () => {
    const s = { ...placing(), cash: 100 };
    expect(buyMat(s, 4, 3)).toEqual({ ok: false, reason: 'cash' });
  });
  it('cannot buy before the gate is open', () => {
    expect(buyMat(newGame(), 4, 3)).toEqual({ ok: false, reason: 'step' });
  });
});
