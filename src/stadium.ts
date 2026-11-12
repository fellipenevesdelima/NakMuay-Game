// Fight night around the ring: the crowd, the corners, the referee, the ringside band and the gamblers.
// Everything here READS the fight (attendance, round, what the crowd thinks it saw). Nothing here can change a result.
import crowdUrl from './assets/crowd.webp';
import ringsideUrl from './assets/ringside.webp';

export type React = 'ours' | 'even' | 'theirs';
interface Fan { el: HTMLElement; side: React; x: number; y: number; until: number; }
const CROWD_KINDS = 6, RING: [number, number] = [53.5, 50];
// ringside cast: [atlas index, x%, y% (feet), size, class]
const CAST: [number, number, number, number, string][] = [
  [0, 55.5, 50.5, 1, 'ref'], [1, 35.5, 56.5, 0.8, 'corner ours'], [2, 74, 49, 1, 'corner theirs'],
  [3, 67, 33.5, 1, 'bettor'], [4, 71.5, 35, 1, 'bettor b'], [3, 40, 32, 1, 'bettor c'],
  [5, 33.5, 69, 0.74, 'band'], [6, 38.5, 71, 0.74, 'band b'], [7, 43.5, 73, 0.74, 'band c'], [8, 69, 70.5, 0.86, 'judge'], [9, 61.5, 74.5, 0.6, 'kid'],
];
const mulberry = (seed: number) => () => { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export class Stadium {
  private box: HTMLElement; private fans: Fan[] = []; private key = ''; private timer = 0; private round = 1; private react: React | null = null; private hot = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; private audio: AudioContext | null = null;
  constructor(private stage: HTMLElement) {
    this.box = document.createElement('div'); this.box.id = 'crowd'; stage.querySelector('.sq')!.append(this.box);
    for (const c of ['haze', 'lights']) { const d = document.createElement('div'); d.className = c; stage.querySelector('.sq')!.append(d); }
  }

  /** Fills the stands for this bout. A near-empty fair and a packed one must look different. */
  open(key: string, attendance: number, capacity: number, seed: number) {
    if (key === this.key) return; this.key = key; this.box.replaceChildren(); this.fans = [];
    const rnd = mulberry(seed || 1), spots: [number, number][] = [];
    for (const [rx, ry, n] of [[30, 17, 15], [35.5, 21.5, 18], [41, 26, 21]]) for (let i = 0; i < n; i++) {
      const a = (i + (ry % 2 ? 0.5 : 0)) / n * Math.PI * 2, x = RING[0] + Math.cos(a) * rx + (rnd() - 0.5) * 2.2, y = RING[1] + Math.sin(a) * ry + (rnd() - 0.5) * 1.6;
      if (CAST.some(c => Math.abs(c[1] - x) < 3.4 && Math.abs(c[2] - y) < 3)) continue;   // keep the band, corners and gamblers clear
      spots.push([x, y]);
    }
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    const n = Math.max(5, Math.min(spots.length, Math.round(spots.length * attendance / Math.max(1, capacity))));
    for (const [x, y] of spots.slice(0, n)) {
      const kind = Math.floor(rnd() * CROWD_KINDS), r = rnd(), side: React = r < 0.42 ? 'ours' : r < 0.8 ? 'theirs' : 'even';
      const el = this.sprite(crowdUrl, kind, CROWD_KINDS, 2, x, y, 8.4 * (0.92 + rnd() * 0.14), 80 / 120, 'fan');
      el.style.setProperty('--o', (-rnd() * 3).toFixed(2) + 's'); el.style.setProperty('--d', (1.6 + rnd() * 1.4).toFixed(2) + 's'); if (rnd() < 0.5) el.style.scale = '-1 1';
      this.fans.push({ el, side, x, y, until: 0 });
    }
    for (const [i, x, y, k, cls] of CAST) this.sprite(ringsideUrl, i, 10, 1, x, y, 9.4 * k, 112 / 120, 'cast ' + cls);
    for (let i = 0; i < 7; i++) { const m = document.createElement('i'); m.className = 'moth'; m.style.left = 30 + rnd() * 46 + '%'; m.style.top = 22 + rnd() * 12 + '%'; m.style.animationDelay = -rnd() * 6 + 's'; m.style.animationDuration = 3 + rnd() * 4 + 's'; this.box.append(m); }
    this.start();
  }
  private sprite(url: string, col: number, cols: number, rows: number, x: number, y: number, h: number, aspect: number, cls: string) {
    const el = document.createElement('div'); el.className = 'sp ' + cls;
    el.style.cssText = `left:${x}%;bottom:${100 - y}%;height:${h}%;aspect-ratio:${aspect};background-image:url(${url});background-size:${cols * 100}% ${rows * 100}%;background-position:${cols > 1 ? col / (cols - 1) * 100 : 0}% 0;z-index:${Math.round(y * 10)}`;
    this.box.append(el); return el;
  }

  /** The stands follow the rhythm of five rounds: slow start, loud in three and four, cooling at the end. */
  setRound(round: number, rounds: number) {
    this.round = round; const peak = rounds >= 5 ? (round === 3 || round === 4) : round === 2;
    this.stage.dataset.heat = peak ? '3' : round >= rounds ? '1' : round === 1 ? '1' : '2';
  }
  private heat() { return Number(this.stage.dataset.heat ?? 1); }

  private start() {
    clearInterval(this.timer); if (this.reduced) return;
    this.timer = window.setInterval(() => {
      const now = performance.now(), base = this.hot ? 0.3 : 0.035 * this.heat();
      for (const f of this.fans) {
        if (f.until && now > f.until) { f.until = 0; f.el.classList.remove('cheer'); }
        if (f.until) continue;
        // people cheer for what they think they saw; the other side sulks
        const lean = !this.react ? 1 : this.react === 'even' ? 0.7 : f.side === this.react ? 1.5 : f.side === 'even' ? 0.5 : 0.08;
        if (Math.random() < base * lean) { f.until = now + 500 + Math.random() * (this.hot ? 900 : 600); f.el.classList.add('cheer'); if (this.hot && Math.random() < 0.3) this.shout(f); }
      }
    }, 260);
  }
  private shout(f: Fan) {
    const b = document.createElement('span'); b.className = 'shout'; b.textContent = Math.random() < 0.7 ? 'โอ้ย!' : 'อี๊!';
    b.style.left = f.x + '%'; b.style.bottom = 100 - f.y + 9 + '%'; this.box.append(b); setTimeout(() => b.remove(), 900);
  }

  /** A round is being fought. `react` is the crowd's noisy impression from the simulation, not the judges' score. */
  clash(react: React, on: boolean) {
    this.hot = on; this.react = on ? react : this.react; this.stage.classList.toggle('roar', on);
    if (on) this.roar(0.5 + this.heat() * 0.18, 1.8);
  }
  /** Knockout: the place erupts or goes quiet. */
  knockout(winner: React) {
    this.react = winner; this.hot = true; this.roar(1.2, 2.6);
    if (!this.reduced) for (let i = 0; i < 6; i++) setTimeout(() => { const f = this.fans[Math.floor(Math.random() * this.fans.length)]; if (!f) return; const fl = document.createElement('i'); fl.className = 'flash'; fl.style.left = f.x + '%'; fl.style.bottom = 100 - f.y + 5 + '%'; this.box.append(fl); setTimeout(() => fl.remove(), 300); }, i * 220);
    setTimeout(() => { this.hot = false; }, 2600);
  }
  /** After the decision: one side celebrates, the other is silent. */
  settle(winner: React | null) { this.react = winner; this.hot = false; this.stage.dataset.heat = winner ? '3' : '1'; }
  close() { clearInterval(this.timer); this.key = ''; this.box.replaceChildren(); this.fans = []; this.react = null; this.hot = false; this.stage.classList.remove('roar'); }

  /** Crowd noise, synthesised: filtered noise with a swell. Placeholder until the recorded layers come in. Only ever called from a tap. */
  private roar(level: number, seconds: number) {
    try {
      this.audio ??= new AudioContext(); const ac = this.audio, n = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < n; i++) { last = (last + 0.03 * (Math.random() * 2 - 1)) / 1.03; d[i] = last * 4; }
      const src = ac.createBufferSource(); src.buffer = buf; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6; const g = ac.createGain(), t = ac.currentTime;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * level, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      src.connect(bp).connect(g).connect(ac.destination); src.start();
    } catch { /* audio unavailable */ }
  }
}
