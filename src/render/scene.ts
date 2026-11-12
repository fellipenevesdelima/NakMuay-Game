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
export interface ActorSpec { id: string; look?: string; x: number; z: number; away?: boolean; outside?: boolean; work?: boolean; }

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
  const nx = w * 2, nz = d * 2, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const [px, py] = toPx(x + i / 2, z + j / 2); pos.push(px, -py, 0); uv.push(i / nx, 1 - j / nz); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return new THREE.Mesh(g, mat);
}

interface Actor {
  id: string; mesh: THREE.Mesh; shadow: THREE.Mesh; pos: [number, number]; path: [number, number][]; inside: boolean; away: boolean; work: boolean;
  tex: Map<string, THREE.Texture>; key: string; phase: number; flip: boolean;
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
  private facilityGroup = new THREE.Group(); private built = new Map<string, THREE.Mesh>();
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
    this.facilityGroup.renderOrder = 1; s.add(this.facilityGroup);
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
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(190, 110), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, blending: THREE.AdditiveBlending, depthTest: false }));
    this.glow.position.copy(P(618, 318)); this.glow.renderOrder = 6000; s.add(this.glow);
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
    for (const f of list) {
      if (this.built.has(f.id)) continue;
      const mat = new THREE.MeshBasicMaterial({ map: this.matTex, ...FLAT, color: '#d8c7b4', opacity: animateNew && !this.reduced ? 0 : 1 });
      const m = floorPatch(f.x, f.z, f.w, f.d, mat); m.renderOrder = 1; this.facilityGroup.add(m); this.built.set(f.id, m);
    }
  }

  /** People in the camp, straight from simulation data: one sprite per entity. Newcomers walk in from the street. */
  setActors(list: ActorSpec[], instant = false) {
    for (const [id, a] of this.actors) if (!list.some(l => l.id === id)) { this.scene.remove(a.mesh, a.shadow); this.actors.delete(id); }
    for (const l of list) {
      const target: [number, number] = l.outside ? DOORSTEP : toPx(l.x, l.z); const wantInside = !l.outside && !l.away;
      let a = this.actors.get(l.id);
      if (!a) {
        const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ ...FLAT, alphaTest: 0.25, side: THREE.DoubleSide, color: '#f1e3d2' }));
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: '#000', ...FLAT, opacity: 0.32 })); shadow.scale.set(15, 6, 1);
        const start: [number, number] = instant ? (l.away ? ROUTE_IN[0] : target) : ROUTE_IN[0];
        a = { id: l.look ?? l.id, mesh, shadow, pos: [...start], path: [], inside: instant && wantInside, away: false, work: false, tex: new Map(), key: '', phase: this.actors.size * 0.37, flip: false };
        this.actors.set(l.id, a); this.scene.add(mesh, shadow);
      }
      a.away = !!l.away; a.work = !!l.work;
      const dest: [number, number] = a.away ? ROUTE_IN[0] : target;
      // Walk through the entrance, never through a wall.
      if (instant) { a.pos = [...dest]; a.path = []; a.inside = wantInside; }
      else if (a.inside && !wantInside) a.path = [ROUTE_IN[2], ROUTE_IN[1], dest];
      else if (!a.inside && wantInside) a.path = [ROUTE_IN[1], ROUTE_IN[2], dest];
      else a.path = [dest];
      a.inside = wantInside;
    }
  }

  private show(a: Actor, key: string, time: number) {
    const sheet: Sheet | undefined = SHEETS[key];
    if (a.key !== key) {
      a.key = key; let t = a.tex.get(key);
      if (!t) { t = load(sheet ? sheet.url : SPRITES[a.id]); if (sheet) t.repeat.x = 1 / sheet.frames; a.tex.set(key, t); }
      (a.mesh.material as THREE.MeshBasicMaterial).map = t; (a.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
    const t = a.tex.get(key)!; let h = PERSON, w = PERSON * 0.45;
    if (sheet) { t.offset.x = (Math.floor((time + a.phase) * 9) % sheet.frames) / sheet.frames; h = PERSON * sheet.h / 150; w = h * sheet.w / sheet.h; }
    else if (t.image) { const im = t.image as HTMLImageElement; if (im.width) w = h * im.width / im.height; }
    const faceLeft = !sheet || sheet.face === 'L';
    a.mesh.scale.set((a.flip === faceLeft ? -1 : 1) * w, h, 1); // flip = "should look to the right"
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05), time = this.clock.elapsedTime;
    if (Math.abs(this.shutterGoal - this.shutterOpen) > 0.001) { this.shutterOpen += (this.shutterGoal - this.shutterOpen) * Math.min(1, dt * (this.reduced ? 60 : 1.7)); this.layoutShutter(); }
    const lit = this.shutterOpen > 0.45 ? (this.reduced || Math.sin(time * 31) > -0.97 ? 1 : 0.5) : 0;
    const nm = this.night.material as THREE.MeshBasicMaterial; nm.opacity += ((1 - lit) * 0.6 - nm.opacity) * Math.min(1, dt * 6);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = lit * (0.16 + (this.reduced ? 0 : Math.sin(time * 13) * 0.03 + Math.sin(time * 2.1) * 0.03));
    for (const m of this.built.values()) { const mat = m.material as THREE.MeshBasicMaterial; if (mat.opacity < 1) mat.opacity = Math.min(1, mat.opacity + dt * 1.6); }
    for (const a of this.actors.values()) {
      let moving = false;
      if (a.path.length) {
        const [tx, ty] = a.path[0], dx = tx - a.pos[0], dy = ty - a.pos[1], d = Math.hypot(dx, dy), step = (this.reduced ? 2000 : 62) * dt;
        if (d <= step) { a.pos = [tx, ty]; a.path.shift(); } else { a.pos[0] += dx / d * step; a.pos[1] += dy / d * step; }
        if (Math.abs(dx) > 0.5) a.flip = dx > 0; moving = a.path.length > 0 || d > step;
      }
      const hidden = a.away && !moving;
      a.mesh.visible = a.shadow.visible = !hidden;
      if (moving) this.show(a, SHEETS[a.id + '_walk'] ? a.id + '_walk' : a.id, time);
      else if (a.work) {
        // athletes face the coach on their right; coaches face the athletes
        const coach = !!SHEETS[a.id + '_work']; a.flip = !coach;
        const cycle = Math.floor((time + a.phase * 5) / 0.89) % 3;
        this.show(a, coach ? a.id + '_work' : cycle === 2 || !SHEETS[a.id + '_guard'] ? a.id + '_attack' : a.id + '_guard', time);
      } else { a.flip = false; this.show(a, a.id, time); }
      a.mesh.position.copy(P(a.pos[0], a.pos[1])); a.mesh.renderOrder = a.pos[1];
      a.shadow.position.copy(P(a.pos[0], a.pos[1] - 1)); a.shadow.renderOrder = a.pos[1] - 0.5;
    }
    if (this.ghost) this.ghostMat.opacity = 0.42 + Math.sin(time * 5) * 0.14;
    const p = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 2) { let y = p.getY(i) - dt * 520, x = p.getX(i) - dt * 130; if (y < -IMG * 1.15) { y += IMG * 1.3; x += 325; } p.setXY(i, x, y); p.setXY(i + 1, x - 4, y - 16); }
    p.needsUpdate = true;
    this.renderer.render(this.scene, this.cam);
  }
}
