// Simulation layer: pure data + pure functions. No rendering imports.
// All money values are FICTIONAL game-balancing numbers, not real Thai market prices.
export type Lang = 'pt' | 'en' | 'th';
export type Step = 'gate' | 'walk' | 'place' | 'placed';

export interface LedgerEntry { id: number; day: number; amount: number; sourceType: string; recipient: string; }
export interface Facility { id: string; type: 'mat'; x: number; z: number; w: number; d: number; level: number; }
export interface GameState {
  saveVersion: 1; day: number; region: 'bangkok'; cash: number; debt: number; debtDueDay: number;
  morale: number; prestige: number; step: Step; facilities: Facility[]; ledger: LedgerEntry[]; lang: Lang;
}

export const TUNING = {
  startCash: 300_000, bangkokPrice: 190_000, loan: 250_000, loanDueDay: 30,
  matCost: 8_000, matW: 3, matD: 2,
};
export const GRID = { w: 12, d: 8 };

// Cells where nothing can be built: pillars, entrance passage, floor gutter.
const BLOCKED: [number, number][] = [
  [2, 2], [9, 2], [2, 5], [9, 5],          // pillars
  [4, 0], [5, 0], [6, 0], [7, 0],          // passage behind the shutter
  [0, 6], [0, 7],                          // gutter under the roof leak
];
export const PILLARS: [number, number][] = BLOCKED.slice(0, 4);
export const isBlocked = (x: number, z: number) => BLOCKED.some(([bx, bz]) => bx === x && bz === z);

export function newGame(lang: Lang = 'pt'): GameState {
  return {
    saveVersion: 1, day: 1, region: 'bangkok',
    cash: TUNING.startCash - TUNING.bangkokPrice, debt: TUNING.loan, debtDueDay: TUNING.loanDueDay,
    morale: 50, prestige: 5, step: 'gate', facilities: [], lang,
    ledger: [{ id: 1, day: 1, amount: -TUNING.bangkokPrice, sourceType: 'property', recipient: 'seller' }],
  };
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

export type BuyResult = { ok: true; state: GameState } | { ok: false; reason: 'step' | 'blocked' | 'cash' };

// Buys the first training mat. Debits exactly once: only valid in the 'place' step.
export function buyMat(s: GameState, x: number, z: number): BuyResult {
  if (s.step !== 'place') return { ok: false, reason: 'step' };
  if (!canPlace(s, x, z)) return { ok: false, reason: 'blocked' };
  if (s.cash < TUNING.matCost) return { ok: false, reason: 'cash' };
  const id = s.ledger.length + 1;
  return { ok: true, state: {
    ...s, cash: s.cash - TUNING.matCost, step: 'placed',
    facilities: [...s.facilities, { id: 'mat-1', type: 'mat', x, z, w: TUNING.matW, d: TUNING.matD, level: 1 }],
    ledger: [...s.ledger, { id, day: s.day, amount: -TUNING.matCost, sourceType: 'equipment', recipient: 'supplier' }],
  } };
}

const KEY = 'nakmuay-save-v1';
export function save(s: GameState): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s && s.saveVersion === 1 && Array.isArray(s.ledger) ? s : null;
  } catch { return null; }
}
export function clearSave(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
