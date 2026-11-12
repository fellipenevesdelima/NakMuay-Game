// Rendering layer. The camp is a painted backdrop with a calibrated floor plane: simulation grid cells are mapped onto
// the painting through a homography, and people, equipment and effects are layered on top, sorted by depth.
// It knows nothing about money or rules.
import * as THREE from 'three';
import { GRID, type Facility } from '../sim/state';
import { SHEETS, type Sheet } from '../assets/anim';
import campUrl from '../assets/camp.webp';
import matUrl from '../assets/mat.webp';
import shutterUrl from '../assets/shutter.webp';
import rinUrl from '../assets/rin.webp';
import somchaiUrl from '../assets/somchai.webp';
import daengUrl from '../assets/daeng.webp';
import maliUrl from '../assets/mali.webp';
import niranUrl from '../assets/niran.webp';
import petchUrl from '../assets/petch.webp';

export const SPRITES: Record<string, string> = { rin: rinUrl, somchai: somchaiUrl, daeng: daengUrl, mali: maliUrl, niran: niranUrl, petch: petchUrl };
/**
 * One person in the camp. `x`/`z` is where they stand when not training. Those with `work` are placed by the scene itself:
 * each coach takes one athlete on the mat at a time, the others shadow-box beside it and take turns.
 */
export interface ActorSpec { id: string; look?: string; x: number; z: number; away?: boolean; outside?: boolean; work?: boolean; role?: 'coach' | 'fighter'; lead?: boolean; tempo?: number; }
const CYCLE = 2.2, STRIKE = 0.4, TURN = 3;   // seconds per pad cycle; share of it that is the strike; cycles before athletes swap
const NO_STAND: [number, number][] = [[3, 2], [3, 6], [3, 7], [4, 7], [5, 7]];

// ---- calibration, in the painting's 1024x1024 space ---------------------------
const IMG = 1024;
// Homography: unit square (back corner, right corner, front corner, left corner of the visible floor) -> painting pixels.
const M = [224.8329, -207.7809, 482.0, 46.6276, 77.6411, 366.0, -0.0748, -0.1267, 1.0];
const MI = (() => { const m = new THREE.Matrix3().set(M[0], M[1], M[2], M[3], M[4], M[5], M[6], M[7], M[8]).invert().elements; return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; })();
function toPx(x: number, z: number): [number, number] { const u = x / GRID.w, v = z / GRID.d, w = M[6] * u + M[7] * v + M[8]; return [(M[0] * u + M[1] * v + M[2]) / w, (M[3] * u + M[4] * v + M[5]) / w]; }
function toGrid(px: number, py: number): [number, number] { const w = MI[6] * px + MI[7] * py + MI[8]; return [(MI[0] * px + MI[1] * py + MI[2]) / w * GRID.w, (MI[3] * px + MI[4] * py + MI[5]) / w * GRID.d]; }
const PILLARS: [number, number, number, number][] = [[507, 335, 537, 440], [430, 418, 461, 530]];           // x0, y0, x1, y1
const FRONT_WALL: [number, number][] = [[305, 510], [625, 615], [627, 740], [600, 735], [600, 660], [338, 572], [338, 640], [305, 640]];
const OPENING = { tl: [338, 572], tr: [600, 660], br: [600, 737], bl: [338, 640] } as const;           // where the shutter hangs
const ROUTE_IN: [number, number][] = [[300, 770], [455, 705], [470, 645]];                              // street -> gutter -> under the beam
const DOORSTEP: [number, number] = [430, 712];
const FLOOR_CENTRE: [number, number] = [540, 490];
const PERSON = 60;                                                                                     // standing height in painting pixels

const LAMP: [number, number] = [618, 318];
/** People get a little smaller towards the back of the yard, as the painted floor does. */
const depth = (py: number) => 0.94 + 0.13 * Math.max(0, Math.min(1, (py - 330) / 390));
/** True when someone standing here would be covered by a pillar. Nobody is ever parked in such a spot. */
const hidden = (px: number, py: number) => PILLARS.some(([x0, , x1, y1]) => px > x0 - 16 && px < x1 + 16 && py < y1 + 3 && py > y1 - 62);
function clearSpot(x: number, z: number): [number, number] {
  for (const dx of [0, 0.9, -0.9, 1.6, -1.6]) { const gx = Math.max(0.4, Math.min(GRID.w - 0.4, x + dx)); const [px, py] = toPx(gx, z); if (!hidden(px, py) && !NO_STAND.some(([bx, bz]) => Math.floor(gx) === bx && Math.floor(z) === bz)) return [gx, z]; }
  return [x, z];
}
const walkable = (x: number, z: number) => x >= 0 && z >= 0 && x < GRID.w && z < GRID.d && !NO_STAND.slice(0, 2).some(([bx, bz]) => bx === x && bz === z);   // only the pillars block a walk
const sight = (a: [number, number], b: [number, number]) => { for (let i = 1; i < 14; i++) { const t = i / 14; if (!walkable(Math.floor(a[0] + (b[0] - a[0]) * t), Math.floor(a[1] + (b[1] - a[1]) * t))) return false; } return true; };
/** A way across the yard that goes around the pillars: breadth-first on the grid, then straightened. Grid coordinates. */
function route(from: [number, number], to: [number, number]): [number, number][] {
  const cl = (v: number, hi: number) => Math.max(0, Math.min(hi - 1, Math.floor(v))), s0 = [cl(from[0], GRID.w), cl(from[1], GRID.d)], e = [cl(to[0], GRID.w), cl(to[1], GRID.d)];
  if (sight(from, to)) return [to];
  const key = (x: number, z: number) => z * GRID.w + x, prev = new Map<number, number>([[key(s0[0], s0[1]), -1]]), q = [s0];
  while (q.length) { const [x, z] = q.shift()!; if (x === e[0] && z === e[1]) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + dx, nz = z + dz;
      if (!walkable(nx, nz) || prev.has(key(nx, nz)) || (dx && dz && (!walkable(x + dx, z) || !walkable(x, z + dz)))) continue; prev.set(key(nx, nz), key(x, z)); q.push([nx, nz]); } }
  const cells: [number, number][] = []; let k = key(e[0], e[1]); if (!prev.has(k)) return [to];
  while (k !== -1 && k !== key(s0[0], s0[1])) { cells.unshift([k % GRID.w + 0.5, Math.floor(k / GRID.w) + 0.5]); k = prev.get(k)!; }
  const pts: [number, number][] = [...cells.slice(0, -1), to], out: [number, number][] = []; let at = from;
  for (let i = 0; i < pts.length; i++) { let j = pts.length - 1; while (j > i && !sight(at, pts[j])) j--; out.push(pts[j]); at = pts[j]; i = j; }
  return out;
}
const loader = new THREE.TextureLoader();
function load(url: string) { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; return t; }
const P = (px: number, py: number, z = 0) => new THREE.Vector3(px, -py, z);
// Everything is one flat stack ordered by renderOrder (feet position), so nothing relies on the depth buffer.
const FLAT = { transparent: true, depthTest: false, depthWrite: false } as const;
/** A flat polygon that shows the matching part of the backdrop: used to put walls and pillars in front of people. */
function cutout(points: [number, number][], map: THREE.Texture, order: number) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, -y)));
  const g = new THREE.ShapeGeometry(shape); const pos = g.getAttribute('position'); const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / IMG; uv[i * 2 + 1] = 1 + pos.getY(i) / IMG; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, ...FLAT })); m.renderOrder = order; return m;
}
/** A textured patch lying on the floor plane, subdivided per half cell so it follows the painting's perspective. */
function floorPatch(x: number, z: number, w: number, d: number, mat: THREE.Material) {
  // whole numbers of subdivisions only: a fractional count once produced stray triangles across the yard
  const nx = Math.max(1, Math.round(w * 2)), nz = Math.max(1, Math.round(d * 2)), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const [px, py] = toPx(x + i * w / nx, z + j * d / nz); pos.push(px, -py, 0); uv.push(i / nx, 1 - j / nz); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return new THREE.Mesh(g, mat);
}

interface Actor {
  id: string; mesh: THREE.Mesh; shadow: THREE.Mesh; pos: [number, number]; path: [number, number][]; inside: boolean; away: boolean; work: boolean;
  tex: Map<string, THREE.Texture>; key: string; phase: number; flip: boolean;
  walked: number; spec: ActorSpec; home: [number, number]; job: { kind: 'pair' | 'solo'; partner?: Actor; clock: number } | null;
}

export class CampScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(0, IMG, 0, -IMG, -10, 10);
  private backdrop = load(campUrl);
  private shutter!: THREE.Mesh; private shutterOpen = 0; private shutterGoal = 0;
  private night!: THREE.Mesh; private glow!: THREE.Mesh;
  private ghost: THREE.Mesh | null = null; private ghostMat = new THREE.MeshBasicMaterial({ color: '#f0e5cd', transparent: true, opacity: 0.5, depthTest: false });
  private rain!: THREE.LineSegments;
  private actors = new Map<string, Actor>();
  private facilityGroup = new THREE.Group(); private built = new Map<string, THREE.Mesh>(); private mats: Facility[] = []; private turn = -1; private glowTex!: THREE.Texture; private water!: THREE.Mesh; private ripples: { m: THREE.Mesh; t: number; life: number }[] = []; private shimmer!: THREE.Mesh; private windows: THREE.Mesh[] = []; private spark!: THREE.Mesh; private moths!: THREE.Points;
  private matTex = load(matUrl);
  private clock = new THREE.Clock(); private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private unitsPerPx = 1; private view = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.renderer.sortObjects = true;
    this.scene.background = new THREE.Color('#0d0a08');
    this.build(); this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private build() {
    const s = this.scene;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(IMG, IMG), new THREE.MeshBasicMaterial({ map: this.backdrop, ...FLAT })); bg.position.set(IMG / 2, -IMG / 2, 0); bg.renderOrder = 0; s.add(bg);
    s.add(this.facilityGroup);   // no group renderOrder: three.js would then draw the mat after every person
    // things that stand in front of people
    for (const [x0, y0, x1, y1] of PILLARS) s.add(cutout([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], this.backdrop, y1));
    s.add(cutout(FRONT_WALL, this.backdrop, 5000));
    // roll-up shutter hanging in the entrance (closed until the player lifts it)
    const st = load(shutterUrl); st.wrapS = st.wrapT = THREE.RepeatWrapping;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 2.5, 1, 2.5, 0, 0, 0], 2)); g.setIndex([0, 3, 1, 1, 3, 2]);
    this.shutter = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: st, color: '#b7a89a', ...FLAT })); this.shutter.renderOrder = 640; s.add(this.shutter); this.layoutShutter();
    // warm flicker around the fluorescent tube
    const gc = document.createElement('canvas'); gc.width = gc.height = 64; const c = gc.getContext('2d')!; const gr = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,214,150,.9)'); gr.addColorStop(1, 'rgba(255,214,150,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(190, 110), new THREE.MeshBasicMaterial({ map: (this.glowTex = new THREE.CanvasTexture(gc)), transparent: true, blending: THREE.AdditiveBlending, depthTest: false }));
    this.glow.position.copy(P(618, 318)); this.glow.renderOrder = 6000; s.add(this.glow);
    // the pop of glove on pad, and moths circling the tube
    this.spark = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false })); this.spark.renderOrder = 6400; this.spark.visible = false; s.add(this.spark);
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    this.moths = new THREE.Points(mg, new THREE.PointsMaterial({ color: '#ffe9b0', size: 2.2, transparent: true, opacity: 0.85, depthTest: false })); this.moths.renderOrder = 6500; s.add(this.moths);
    // the gutter by the entrance actually runs
    const wc = document.createElement('canvas'); wc.width = 8; wc.height = 64; const wg = wc.getContext('2d')!;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 8; x++) { const v = Math.random(); wg.fillStyle = `rgba(215,235,245,${v > 0.55 ? 0.25 + v * 0.6 : 0.08})`; wg.fillRect(x, y, 1, 1); }
    const wt = new THREE.CanvasTexture(wc); wt.wrapT = THREE.RepeatWrapping; wt.magFilter = THREE.NearestFilter; wt.repeat.set(1, 2);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(7, 124), new THREE.MeshBasicMaterial({ map: wt, ...FLAT })); this.water.position.copy(P(569.5, 669)); this.water.renderOrder = 5200; s.add(this.water);
    // rain rings on the wet street, and the splash where the gutter lands
    const ring = new THREE.RingGeometry(0.72, 1, 20), spots = (): [number, number] => { const r = Math.random(); return r < 0.2 ? [569.5 + (Math.random() - 0.5) * 8, 733 + Math.random() * 3] : r < 0.75 ? ((x) => [x, 590 + (x - 70) * 0.44 + Math.random() * 110] as [number, number])(70 + Math.random() * 500) : [690 + Math.random() * 190, 560 + Math.random() * 220]; };
    for (let i = 0; i < (this.reduced ? 0 : 22); i++) { const m = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#d5e4ee', ...FLAT, opacity: 0 })); m.renderOrder = 5100; m.userData.spot = spots; s.add(m); this.ripples.push({ m, t: Math.random() * 1.4, life: 0.9 + Math.random() * 0.7 }); }
    // the tube's reflection trembling on the wet cement, and neighbours' lights that are not perfectly steady
    this.shimmer = new THREE.Mesh(new THREE.PlaneGeometry(250, 110), new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, opacity: 0 })); this.shimmer.position.copy(P(585, 425)); this.shimmer.renderOrder = 0.8; s.add(this.shimmer);
    for (const [x, y, w] of [[233, 149, 46], [787, 273, 50], [989, 543, 54], [800, 920, 60], [240, 900, 56], [113, 527, 64], [153, 247, 40]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.8), new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, opacity: 0.2 })); m.position.copy(P(x, y)); m.renderOrder = 5300; s.add(m); this.windows.push(m); }
    // darkness while the camp is still locked
    this.night = new THREE.Mesh(new THREE.PlaneGeometry(IMG * 3, IMG * 3), new THREE.MeshBasicMaterial({ color: '#070a12', transparent: true, opacity: 0.6, depthTest: false }));
    this.night.position.copy(P(IMG / 2, IMG / 2)); this.night.renderOrder = 7000; s.add(this.night);
    // rain streaks
    const n = this.reduced ? 0 : 150, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { const x = Math.random() * IMG * 1.3 - 150, y = Math.random() * IMG * 1.3 - 150; pos.set([x, -y, 0, x - 4, -(y + 16), 0], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#d9e6ea', transparent: true, opacity: 0.22, depthTest: false })); this.rain.renderOrder = 8000; s.add(this.rain);
  }

  private layoutShutter() {
    const o = OPENING, k = 1 - this.shutterOpen * 0.93, pos = this.shutter.geometry.getAttribute('position') as THREE.BufferAttribute;
    const bl = [o.tl[0] + (o.bl[0] - o.tl[0]) * k, o.tl[1] + (o.bl[1] - o.tl[1]) * k], br = [o.tr[0] + (o.br[0] - o.tr[0]) * k, o.tr[1] + (o.br[1] - o.tr[1]) * k];
    pos.setXYZ(0, o.tl[0], -o.tl[1], 0); pos.setXYZ(1, o.tr[0], -o.tr[1], 0); pos.setXYZ(2, br[0], -br[1], 0); pos.setXYZ(3, bl[0], -bl[1], 0); pos.needsUpdate = true;
    const uv = this.shutter.geometry.getAttribute('uv') as THREE.BufferAttribute; uv.setY(2, 1 - k); uv.setY(3, 1 - k); uv.needsUpdate = true;
    this.shutter.geometry.computeBoundingSphere();
  }

  /** Fits the plot into the part of the screen the drawer leaves free. */
  resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight); this.renderer.setSize(w, h, false);
    const landscape = w > h && h < 520;
    let u = landscape ? Math.max(560 / (w * 0.6), 330 / h) : Math.max(480 / w, 330 / (h * 0.42));
    if (!landscape) u = Math.min(u, IMG / w, IMG / h); this.unitsPerPx = u;   // never show past the edge of the painting
    const vw = w * u, vh = h * u;
    const cx = FLOOR_CENTRE[0] + (landscape ? 0.18 * vw : 0), cy = FLOOR_CENTRE[1] + (landscape ? 0 : 0.2 * vh);
    const clamp = (v: number, size: number) => (size <= IMG ? Math.max(0, Math.min(IMG - size, v)) : v);
    this.view = { x: landscape ? Math.max(0, cx - vw / 2) : clamp(cx - vw / 2, vw), y: clamp(cy - vh / 2, vh) };
    this.cam.left = this.view.x; this.cam.right = this.view.x + vw; this.cam.top = -this.view.y; this.cam.bottom = -(this.view.y + vh); this.cam.updateProjectionMatrix();
  }

  /** Grid cell under a screen point, or null when outside the floor. */
  pickCell(clientX: number, clientY: number): { x: number; z: number } | null {
    const b = this.canvas.getBoundingClientRect();
    const [gx, gz] = toGrid(this.view.x + (clientX - b.left) * this.unitsPerPx, this.view.y + (clientY - b.top) * this.unitsPerPx);
    if (gx < 0 || gz < 0 || gx >= GRID.w || gz >= GRID.d) return null;
    return { x: Math.floor(gx), z: Math.floor(gz) };
  }

  setGate(open: boolean, instant = false) { this.shutterGoal = open ? 1 : 0; if (instant) { this.shutterOpen = this.shutterGoal; this.layoutShutter(); } }

  setGhost(g: { x: number; z: number; w: number; d: number; valid: boolean } | null) {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost.geometry.dispose(); this.ghost = null; }
    if (!g) return;
    this.ghostMat.color.set(g.valid ? '#f0e5cd' : '#d0553c');
    this.ghost = floorPatch(g.x, g.z, g.w, g.d, this.ghostMat); this.ghost.renderOrder = 2; this.scene.add(this.ghost);
  }

  /** Rebuilds facilities from data so a loaded save shows the same camp. */
  setFacilities(list: Facility[], animateNew = false) {
    for (const [id, m] of this.built) if (!list.some(f => f.id === id)) { this.facilityGroup.remove(m); this.built.delete(id); }
    this.mats = list.filter(f => f.type === 'mat');
    for (const f of list) {
      if (this.built.has(f.id)) continue;
      // a thin contact shadow so the mat sits on the cement instead of hovering over it
      const sh = floorPatch(f.x - 0.06, f.z - 0.02, f.w + 0.16, f.d + 0.14, new THREE.MeshBasicMaterial({ color: '#000', ...FLAT, opacity: 0.42 })); sh.renderOrder = 0.5; this.facilityGroup.add(sh);
      const mat = new THREE.MeshBasicMaterial({ map: this.matTex, ...FLAT, color: '#b5a595', opacity: animateNew && !this.reduced ? 0 : 1 });
      const m = floorPatch(f.x, f.z, f.w, f.d, mat); m.renderOrder = 1; this.facilityGroup.add(m); this.built.set(f.id, m);
    }
  }

  /** People in the camp, straight from simulation data: one sprite per entity. Newcomers walk in from the street. */
  setActors(list: ActorSpec[], instant = false) {
    for (const [id, a] of this.actors) if (!list.some(l => l.id === id)) { this.scene.remove(a.mesh, a.shadow); this.actors.delete(id); }
    for (const l of list) {
      const home: [number, number] = l.outside ? DOORSTEP : toPx(...clearSpot(l.x, l.z));
      let a = this.actors.get(l.id);
      if (!a) {
        const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ ...FLAT, alphaTest: 0.25, side: THREE.DoubleSide, color: '#f1e3d2' }));
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: '#000', ...FLAT, opacity: 0.32 })); shadow.scale.set(15, 6, 1);
        const start: [number, number] = instant && !l.away ? home : ROUTE_IN[0];
        a = { id: l.look ?? l.id, mesh, shadow, pos: [...start], path: [], inside: instant && !l.outside && !l.away, away: false, work: false, tex: new Map(), key: '', phase: this.actors.size * 0.37, flip: false, walked: 0, spec: l, home, job: null };
        this.actors.set(l.id, a); this.scene.add(mesh, shadow);
      }
      a.spec = l; a.home = home; a.away = !!l.away; a.work = !!l.work;
    }
    this.turn = -1; this.assign(instant);
  }

  /** Sends an actor somewhere, through the entrance and never through a wall. */
  private go(a: Actor, dest: [number, number], wantInside: boolean, instant: boolean) {
    const last = a.path.length ? a.path[a.path.length - 1] : a.pos; if (Math.hypot(last[0] - dest[0], last[1] - dest[1]) < 1 && a.inside === wantInside) return;
    const door = toGrid(...ROUTE_IN[2]) as [number, number], px = (pts: [number, number][]) => pts.map(([x, z]) => toPx(x, z));
    if (instant) { a.pos = [...dest]; a.path = []; }
    else if (a.inside && !wantInside) a.path = [...px(route(toGrid(...a.pos) as [number, number], door)), ROUTE_IN[2], ROUTE_IN[1], dest];
    else if (!a.inside && wantInside) a.path = [ROUTE_IN[1], ROUTE_IN[2], ...px(route(door, toGrid(...dest) as [number, number]))];
    else if (wantInside) a.path = px(route(toGrid(...a.pos) as [number, number], toGrid(...dest) as [number, number]));
    else a.path = [dest];
    a.inside = wantInside;
  }

  /**
   * Training choreography. Each working coach holds pads for one athlete on the mat; the rest shadow-box beside it and
   * rotate in every few cycles. An athlete in fight camp (`lead`) keeps the pads.
   */
  private assign(instant = false) {
    const all = [...this.actors.values()], mat = this.mats[0];
    const coaches = all.filter(a => a.spec.role === 'coach' && a.spec.work && !a.away), fighters = all.filter(a => a.spec.role === 'fighter' && a.spec.work && !a.away);
    for (const a of all) a.job = null;
    if (mat && fighters.length) {
      const lead = fighters.filter(f => f.spec.lead), free = fighters.filter(f => !f.spec.lead), k = free.length ? Math.max(0, this.turn) % free.length : 0;
      const order = [...lead, ...free.slice(k), ...free.slice(0, k)];
      const solo = ([[mat.x - 0.7, mat.z + 0.5], [mat.x - 0.7, mat.z + 1.5], [mat.x + 0.7, mat.z + mat.d + 0.6], [mat.x + 2.1, mat.z + mat.d + 0.6], [mat.x + mat.w + 0.7, mat.z + 1.4], [mat.x + 1.5, mat.z - 0.6]] as [number, number][])
        .map(([x, z]) => [Math.max(0.4, Math.min(GRID.w - 0.4, x)), Math.max(0.4, Math.min(GRID.d - 1.4, z))] as [number, number])
        .filter(([x, z]) => !NO_STAND.some(([bx, bz]) => Math.floor(x) === bx && Math.floor(z) === bz));
      order.forEach((f, i) => {
        const c = coaches[i];
        if (c) {
          const z = mat.z + (coaches.length > 1 ? 0.55 + i * 0.9 : mat.d / 2 + 0.1), tempo = c.spec.tempo ?? 1;
          f.job = { kind: 'pair', partner: c, clock: tempo }; c.job = { kind: 'pair', partner: f, clock: tempo };
          this.go(f, toPx(mat.x + mat.w / 2 - 0.5, z), true, instant); this.go(c, toPx(mat.x + mat.w / 2 + 0.5, z), true, instant);
        } else { f.job = { kind: 'solo', clock: 1 }; const [x, z] = solo[(i - coaches.length) % solo.length]; this.go(f, toPx(...clearSpot(x, z)), true, instant); }
      });
    }
    for (const a of all) if (!a.job) this.go(a, a.away ? ROUTE_IN[0] : a.home, !a.away && !a.spec.outside, instant);
  }

  private show(a: Actor, key: string, frame: number) {
    const sheet: Sheet | undefined = SHEETS[key];
    if (a.key !== key) {
      a.key = key; let t = a.tex.get(key);
      if (!t) { t = load(sheet ? sheet.url : SPRITES[a.id]); if (sheet) t.repeat.x = 1 / sheet.frames; a.tex.set(key, t); }
      (a.mesh.material as THREE.MeshBasicMaterial).map = t; (a.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
    const t = a.tex.get(key)!; let h = PERSON, w = PERSON * 0.45;
    if (sheet) { t.offset.x = (((Math.floor(frame) % sheet.frames) + sheet.frames) % sheet.frames) / sheet.frames; h = PERSON * sheet.h / 150; w = h * sheet.w / sheet.h; }
    else if (t.image) { const im = t.image as HTMLImageElement; if (im.width) w = h * im.width / im.height; }
    const faceLeft = !sheet || sheet.face === 'L';
    const k = depth(a.pos[1]); a.mesh.scale.set((a.flip === faceLeft ? -1 : 1) * w * k, h * k, 1); // flip = "should look to the right"
    // warm under the tube, cold towards the street: the same light the painting has
    const warm = Math.max(0, 1 - Math.hypot(a.pos[0] - LAMP[0], a.pos[1] - LAMP[1] - 90) / 330), out = a.pos[1] > 640 ? 0.8 : 1;
    (a.mesh.material as THREE.MeshBasicMaterial).color.setRGB((0.7 + 0.3 * warm) * out, (0.7 + 0.24 * warm) * out, (0.78 + 0.06 * warm) * out);
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05), time = this.clock.elapsedTime;
    if (Math.abs(this.shutterGoal - this.shutterOpen) > 0.001) { this.shutterOpen += (this.shutterGoal - this.shutterOpen) * Math.min(1, dt * (this.reduced ? 60 : 1.7)); this.layoutShutter(); }
    const lit = this.shutterOpen > 0.45 ? (this.reduced || Math.sin(time * 31) > -0.97 ? 1 : 0.5) : 0;
    const nm = this.night.material as THREE.MeshBasicMaterial; nm.opacity += ((1 - lit) * 0.6 - nm.opacity) * Math.min(1, dt * 6);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = lit * (0.16 + (this.reduced ? 0 : Math.sin(time * 13) * 0.03 + Math.sin(time * 2.1) * 0.03));
    for (const m of this.built.values()) { const mat = m.material as THREE.MeshBasicMaterial; if (mat.opacity < 1) mat.opacity = Math.min(1, mat.opacity + dt * 1.6); }
    this.spark.visible = false; this.moths.visible = lit > 0;
    if (!this.reduced) {
      (this.water.material as THREE.MeshBasicMaterial).map!.offset.y += dt * 2.6;
      for (const r of this.ripples) { r.t += dt; if (r.t > r.life) { r.t = 0; r.life = 0.8 + Math.random() * 0.8; const [x, y] = (r.m.userData.spot as () => [number, number])(); r.m.position.copy(P(x, y)); }
        const k = r.t / r.life; r.m.scale.set(2 + k * 9, (2 + k * 9) * 0.5, 1); (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.5; }
      (this.shimmer.material as THREE.MeshBasicMaterial).opacity = lit * (0.1 + Math.sin(time * 7.3) * 0.02 + Math.sin(time * 2.9) * 0.03); this.shimmer.scale.x = 1 + Math.sin(time * 1.7) * 0.04;
      this.windows.forEach((m, i) => { (m.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(time * (0.7 + i * 0.31) + i * 1.9) * 0.08 + (Math.sin(time * (5 + i)) > 0.985 ? -0.15 : 0); });
    }
    if (!this.reduced) { const mp = this.moths.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < mp.count; i++) { const a = time * (0.9 + i * 0.23) + i * 2.1; mp.setXYZ(i, 618 + Math.cos(a) * (18 + i * 5) + Math.sin(a * 2.3) * 6, -(316 + Math.sin(a * 1.4) * (9 + i * 2)), 0); } mp.needsUpdate = true; }
    const turn = Math.floor(time / (CYCLE * TURN)); if (turn !== this.turn) { this.turn = turn; this.assign(); }
    for (const a of this.actors.values()) {
      let moving = false;
      if (a.path.length) {
        const [tx, ty] = a.path[0], dx = tx - a.pos[0], dy = ty - a.pos[1], d = Math.hypot(dx, dy), step = (this.reduced ? 2000 : 62) * dt;
        if (d <= step) { a.pos = [tx, ty]; a.path.shift(); } else { a.pos[0] += dx / d * step; a.pos[1] += dy / d * step; }
        if (Math.abs(dx) > 0.5) a.flip = dx > 0; moving = a.path.length > 0 || d > step; a.walked += Math.min(d, step);
      }
      const hidden = a.away && !moving;
      a.mesh.visible = a.shadow.visible = !hidden;
      const job = a.job, partner = job?.partner, ready = !!partner && !partner.path.length && !a.path.length;
      if (moving) this.show(a, SHEETS[a.id + '_walk'] ? a.id + '_walk' : a.id, a.walked / 4.2);   // the stride follows the ground covered, so nobody glides
      else if (job?.kind === 'pair' && partner && ready) {
        // one clock for the two of them: the strike and the pad land on the same frame, then both reset
        a.flip = partner.pos[0] > a.pos[0];
        const p = ((time * job.clock) % CYCLE) / CYCLE, hit = p < STRIKE, f = hit ? p / STRIKE * 8 : 0;
        if (a.spec.role === 'coach') { this.show(a, SHEETS[a.id + '_work'] ? a.id + '_work' : a.id, f);
          if (hit && f >= 3 && f < 5 && !this.reduced) { this.spark.visible = true; this.spark.position.copy(P((a.pos[0] + partner.pos[0]) / 2, (a.pos[1] + partner.pos[1]) / 2 - 34)); this.spark.scale.setScalar(0.7 + (f - 3) * 0.5); } }
        else this.show(a, hit && SHEETS[a.id + '_attack'] ? a.id + '_attack' : SHEETS[a.id + '_guard'] ? a.id + '_guard' : a.id, hit ? f : time * 7);
      } else if (job?.kind === 'solo') {
        // shadow-boxing alone, each in their own time, turned towards the pads
        const mat = this.mats[0]; if (mat) a.flip = toPx(mat.x + mat.w / 2, mat.z + mat.d / 2)[0] > a.pos[0];
        const p = ((time + a.phase * 4) % (CYCLE * 1.6)) / (CYCLE * 1.6), hit = p < 0.25 && !!SHEETS[a.id + '_attack'];
        this.show(a, hit ? a.id + '_attack' : SHEETS[a.id + '_guard'] ? a.id + '_guard' : a.id, hit ? p / 0.25 * 8 : (time + a.phase) * 6);
      } else { a.flip = false; this.show(a, a.id, 0); }
      a.mesh.position.copy(P(a.pos[0], a.pos[1])); a.mesh.renderOrder = a.pos[1];
      // the shadow falls away from the tube, like the painted ones
      const vx = a.pos[0] - LAMP[0], vy = a.pos[1] - LAMP[1], vl = Math.hypot(vx, vy) || 1, sk = depth(a.pos[1]);
      a.shadow.position.copy(P(a.pos[0] + vx / vl * 7, a.pos[1] - 1 + vy / vl * 3)); a.shadow.rotation.z = -Math.atan2(vy * 0.5, vx); a.shadow.scale.set(18 * sk, 6 * sk, 1); a.shadow.renderOrder = a.pos[1] - 0.5;
    }
    if (this.ghost) this.ghostMat.opacity = 0.42 + Math.sin(time * 5) * 0.14;
    const p = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 2) { let y = p.getY(i) - dt * 520, x = p.getX(i) - dt * 130; if (y < -IMG * 1.15) { y += IMG * 1.3; x += 325; } p.setXY(i, x, y); p.setXY(i + 1, x - 4, y - 16); }
    p.needsUpdate = true;
    this.renderer.render(this.scene, this.cam);
  }
}
