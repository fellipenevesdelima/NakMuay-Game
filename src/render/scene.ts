// Rendering layer: builds the Bangkok plot from data. Knows nothing about money or rules.
import * as THREE from 'three';
import { GRID, PILLARS, type Facility } from '../sim/state';

import floorUrl from '../assets/floor.webp';
import wallUrl from '../assets/wall.webp';
import roofUrl from '../assets/roof.webp';
import alleyUrl from '../assets/alley.webp';
import shutterUrl from '../assets/shutter.webp';
import postersUrl from '../assets/posters.webp';
import rinUrl from '../assets/rin.webp';
import cartUrl from '../assets/cart.webp';
import plantsUrl from '../assets/plants.webp';
import scooterUrl from '../assets/scooter.webp';
import somchaiUrl from '../assets/somchai.webp';
import daengUrl from '../assets/daeng.webp';
import petchUrl from '../assets/petch.webp';
import maliUrl from '../assets/mali.webp';
import niranUrl from '../assets/niran.webp';

export const SPRITES: Record<string, string> = { rin: rinUrl, somchai: somchaiUrl, daeng: daengUrl, mali: maliUrl, niran: niranUrl, petch: petchUrl };
export interface ActorSpec { id: string; x: number; z: number; away?: boolean; busy?: boolean; }
interface Actor { sp: THREE.Sprite; gx: number; gz: number; away: boolean; busy: boolean; phase: number; }
const GATE = { x: 6, z: 0.5 }, OUTSIDE = { x: 6, z: -3.4 };

const PIXEL = 2; // screen pixels per rendered pixel (chunky pixel-art look)

const loader = new THREE.TextureLoader();
/** Loads a generated texture (art made for this game; see README). */
function load(url: string, repeat?: [number, number]) {
  const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
/** Upright billboard anchored at its feet; `height` is on-screen height in world units. */
function sprite(url: string, height: number, x: number, z: number) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.35, color: '#e6d6c4' }));
  sp.center.set(0.5, 0); sp.position.set(x, 0, z); sp.scale.set(height * 0.6, height, 1);
  sp.material.map = loader.load(url, t => { const im = t.image as HTMLImageElement; sp.scale.set(height * im.width / im.height, height, 1); });
  sp.material.map.colorSpace = THREE.SRGBColorSpace;
  return sp;
}
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const mat = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b;
}

export class CampScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  private target = new THREE.Vector3(GRID.w / 2, 0, GRID.d / 2 - 0.6);
  private shutter!: THREE.Mesh; private shutterOpen = 0; private shutterGoal = 0;
  private tube!: THREE.PointLight; private tubeMesh!: THREE.Mesh;
  private actors = new Map<string, Actor>();
  private ghost!: THREE.Mesh; private rain!: THREE.Points; private drip!: THREE.Mesh;
  private facilityGroup = new THREE.Group(); private built = new Map<string, THREE.Group>();
  private ray = new THREE.Raycaster(); private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private clock = new THREE.Clock(); private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.scene.background = new THREE.Color('#14100e');
    this.scene.fog = new THREE.Fog('#14100e', 44, 72);
    this.build();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private build() {
    const s = this.scene;
    s.add(new THREE.AmbientLight('#9a8c80', 1.7));
    const dusk = new THREE.DirectionalLight('#ffb070', 0.85); dusk.position.set(10, 12, 6); s.add(dusk);
    const sky = new THREE.DirectionalLight('#6f93a8', 0.5); sky.position.set(-6, 10, -8); s.add(sky);
    const lamp = (col: string, power: number, x: number, y: number, z: number, dist = 14) => { const l = new THREE.PointLight(col, power, dist, 1.6); l.position.set(x, y, z); s.add(l); return l; };
    lamp('#ff9a4a', 40, 6, 3.2, -2.6, 18); lamp('#ffb060', 22, 13.6, 2.6, 4, 12); lamp('#ffa850', 20, -2, 2.4, 9.5, 12); lamp('#ff3f7a', 16, -2.2, 2.2, 3, 10);
    this.tube = lamp('#ffd9a0', 0, 6, 2.6, 3.5, 20);

    // --- ground ---
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), mat({ map: load(alleyUrl, [16, 16]), roughness: 0.3, metalness: 0.3 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(6, -0.02, 4); s.add(ground);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(GRID.w, 0.2, GRID.d), mat({ map: load(floorUrl, [GRID.w / 4, GRID.d / 4]), roughness: 0.55, metalness: 0.1 }));
    floor.position.set(GRID.w / 2, -0.1, GRID.d / 2); s.add(floor);

    // --- walls (far sides full height, near sides cut away) ---
    const H = 2.6; const wallM = (len: number) => mat({ map: load(wallUrl, [len / H, 1]) });
    s.add(box(0.25, H, GRID.d, wallM(GRID.d), -0.125, H / 2, GRID.d / 2));   // left wall
    s.add(box(4, H, 0.25, wallM(4), 2, H / 2, -0.125));                     // back wall, left of entrance
    s.add(box(4, H, 0.25, wallM(4), 10, H / 2, -0.125));                    // back wall, right of entrance
    s.add(box(4, 0.5, 0.25, mat({ color: '#b9ab8f' }), 6, H - 0.25, -0.125)); // lintel
    const curb = mat({ color: '#8a7d6c' });
    s.add(box(GRID.w + 0.25, 0.3, 0.22, curb, GRID.w / 2, 0.15, GRID.d + 0.11)); // near cut walls
    s.add(box(0.22, 0.3, GRID.d, curb, GRID.w + 0.11, 0.15, GRID.d / 2));

    // old fight posters on the left wall and beside the entrance
    const posterM = mat({ map: load(postersUrl) });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.26), posterM); p1.rotation.y = Math.PI / 2; p1.position.set(0.02, 1.55, 3.8); s.add(p1);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.12), posterM); p2.position.set(10, 1.55, 0.02); s.add(p2);

    // pillars
    const pilM = mat({ map: load(wallUrl, [0.2, 1]) }); const pil = mat({ color: '#4a4038' });
    PILLARS.forEach(([x, z]) => s.add(box(0.5, H, 0.5, pilM, x + 0.5, H / 2, z + 0.5)));

    // gutter + leak
    s.add(box(0.5, 0.03, 2, mat({ color: '#1c2a30', roughness: 0.15, metalness: 0.5 }), 0.45, 0.02, 7));
    this.drip = box(0.06, 0.25, 0.06, new THREE.MeshBasicMaterial({ color: '#bfe3f2' }), 0.5, 2.6, 6.6); s.add(this.drip);

    // fluorescent tube
    this.tubeMesh = box(1.6, 0.06, 0.08, new THREE.MeshBasicMaterial({ color: '#3a3833' }), 6, 2.55, 3.5); s.add(this.tubeMesh);
    s.add(box(0.03, 0.5, 0.03, pil, 5.3, 2.8, 3.5), box(0.03, 0.5, 0.03, pil, 6.7, 2.8, 3.5));

    // roll-up shutter
    const g = new THREE.BoxGeometry(4, 2.1, 0.08); g.translate(0, -1.05, 0); // pivot at the top
    this.shutter = new THREE.Mesh(g, mat({ map: load(shutterUrl, [1.6, 1]), metalness: 0.35, roughness: 0.6 }));
    this.shutter.position.set(6, 2.1, -0.1); s.add(this.shutter);

    // --- neighbourhood (decor only, not simulation entities) ---
    const r = rng(42);
    const win = new THREE.MeshBasicMaterial({ color: '#ffc25e' }); const winC = new THREE.MeshBasicMaterial({ color: '#ffe2a6' });
    const addHouse = (x: number, z: number, w: number, d: number, h: number, tint: string) => {
      s.add(box(w, h, d, mat({ map: load(wallUrl, [w / 3, 1]), color: tint }), x, h / 2, z));
      const roof = box(w + 0.5, 0.14, d + 0.5, mat({ map: load(roofUrl, [w / 3, d / 3]), metalness: 0.3, roughness: 0.6 }), x, h + 0.07, z); s.add(roof);
      for (let i = 0; i < 3; i++) if (r() > 0.25) {
        s.add(box(0.5, 0.55, 0.05, r() > 0.5 ? win : winC, x - w / 2 + 0.8 + i * (w - 1.6) / 2, h * 0.58, z + d / 2 + 0.03));
        s.add(box(0.05, 0.55, 0.5, r() > 0.5 ? win : winC, x + w / 2 + 0.03, h * 0.58, z - d / 2 + 0.8 + i * (d - 1.6) / 2));
      }
    };
    addHouse(-4.2, 3, 5, 6, 3.2, '#9c8f84'); addHouse(-4.5, -6.5, 6, 5, 4.4, '#8f857c'); addHouse(3, -8.5, 6, 4.5, 3.6, '#9a9088');
    addHouse(10.5, -8.2, 6.5, 4, 5, '#8c8178'); addHouse(-5, 10.5, 6, 5, 3, '#958a80'); addHouse(17.5, -3, 5, 7, 4, '#90857c');
    addHouse(17.8, 6.5, 5, 6, 3.2, '#998e84'); addHouse(4, 14, 7, 5, 3.4, '#8f857c'); addHouse(13, 13.5, 6, 5, 3, '#958a80');
    s.add(box(0.08, 1.4, 0.5, new THREE.MeshBasicMaterial({ color: '#ff4f86' }), -1.65, 2.3, 3)); // neon sign
    // power pole + lines
    s.add(box(0.18, 5.4, 0.18, pil, 1.2, 2.7, -3.6), box(1.4, 0.1, 0.1, pil, 1.2, 5, -3.6));
    const lm = new THREE.LineBasicMaterial({ color: '#15191c' });
    [[-0.5, 0], [0, 0.3], [0.5, -0.2]].forEach(([o, sag]) => {
      const pts = []; for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new THREE.Vector3(1.2 + o + k * 17, 5 - Math.sin(k * Math.PI) * (0.9 + sag), -3.6 + k * 0.6)); }
      s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
    });
    s.add(box(0.1, 3.2, 0.1, pil, 6, 1.6, -2.9), box(0.35, 0.12, 0.35, win, 6, 3.2, -2.75)); // street lamp
    // generated prop sprites
    s.add(sprite(cartUrl, 2.3, 9.9, -2.3), sprite(plantsUrl, 1.5, 12.9, 2.2), sprite(plantsUrl, 1.3, -0.9, -1.3), sprite(plantsUrl, 1.2, 2.6, 9.1), sprite(scooterUrl, 1.15, 13.3, 6.4));

    // --- placement ghost ---
    this.ghost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#f0e5cd', transparent: true, opacity: 0.55, depthTest: false }));
    this.ghost.rotation.x = -Math.PI / 2; this.ghost.visible = false; this.ghost.renderOrder = 5; s.add(this.ghost);
    s.add(this.facilityGroup);

    // --- rain ---
    const n = this.reduced ? 0 : 320; const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = -8 + r() * 30; pos[i * 3 + 1] = r() * 12; pos[i * 3 + 2] = -12 + r() * 28; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: '#c9dbe2', size: 1, sizeAttenuation: false, transparent: true, opacity: 0.4 }));
    s.add(this.rain);
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(Math.ceil(w / PIXEL), Math.ceil(h / PIXEL), false);
    const aspect = w / h; const viewH = Math.max(15.5 / aspect, 12.5);
    this.cam.left = -viewH * aspect / 2; this.cam.right = viewH * aspect / 2; this.cam.top = viewH / 2; this.cam.bottom = -viewH / 2;
    const el = THREE.MathUtils.degToRad(52), az = THREE.MathUtils.degToRad(45), dist = 40;
    this.cam.position.set(this.target.x + dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), this.target.z + dist * Math.cos(el) * Math.cos(az));
    this.cam.lookAt(this.target); this.cam.updateProjectionMatrix();
  }

  /** Grid cell under a screen point, or null when outside the floor. */
  pickCell(clientX: number, clientY: number): { x: number; z: number } | null {
    const b = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam);
    const hit = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.plane, hit)) return null;
    if (hit.x < 0 || hit.z < 0 || hit.x >= GRID.w || hit.z >= GRID.d) return null;
    return { x: Math.floor(hit.x), z: Math.floor(hit.z) };
  }

  setGate(open: boolean, instant = false) {
    this.shutterGoal = open ? 1 : 0; if (instant) this.shutterOpen = this.shutterGoal;
  }
  /** People in the camp, straight from simulation data: one sprite per entity. Newcomers walk in through the gate. */
  setActors(list: ActorSpec[], instant = false) {
    for (const [id, a] of this.actors) if (!list.some(l => l.id === id)) { this.scene.remove(a.sp); this.actors.delete(id); }
    for (const l of list) {
      let a = this.actors.get(l.id);
      if (!a) {
        const start = instant ? (l.away ? OUTSIDE : l) : OUTSIDE;
        const sp = sprite(SPRITES[l.id], 1.45, start.x, start.z); this.scene.add(sp);
        a = { sp, gx: l.x, gz: l.z, away: false, busy: false, phase: this.actors.size * 1.7 }; this.actors.set(l.id, a);
      }
      a.away = !!l.away; a.busy = !!l.busy; a.gx = a.away ? OUTSIDE.x : l.x; a.gz = a.away ? OUTSIDE.z - 1.2 : l.z;
      if (instant) { a.sp.position.x = a.gx; a.sp.position.z = a.gz; }
    }
  }
  setGhost(g: { x: number; z: number; w: number; d: number; valid: boolean } | null) {
    this.ghost.visible = !!g; if (!g) return;
    this.ghost.scale.set(g.w, g.d, 1); this.ghost.position.set(g.x + g.w / 2, 0.03, g.z + g.d / 2);
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(g.valid ? '#f0e5cd' : '#b64f38');
  }
  /** Rebuilds facilities from data so a loaded save shows the same camp. */
  setFacilities(list: Facility[], animateNew = false) {
    for (const [id, grp] of this.built) if (!list.some(f => f.id === id)) { this.facilityGroup.remove(grp); this.built.delete(id); }
    for (const f of list) {
      if (this.built.has(f.id)) continue;
      const grp = new THREE.Group();
      for (let i = 0; i < f.w * 2; i++) for (let j = 0; j < f.d * 2; j++) {
        const m = mat({ color: (i + j) % 2 ? '#2f5f8f' : '#a8392e', roughness: 0.8 });
        grp.add(box(0.48, 0.07, 0.48, m, f.x + 0.25 + i * 0.5, 0.035, f.z + 0.25 + j * 0.5));
      }
      grp.userData.t = animateNew && !this.reduced ? 0 : 1;
      this.facilityGroup.add(grp); this.built.set(f.id, grp);
    }
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05), time = this.clock.elapsedTime;
    this.shutterOpen += (this.shutterGoal - this.shutterOpen) * Math.min(1, dt * (this.reduced ? 60 : 1.8));
    this.shutter.scale.y = 1 - this.shutterOpen * 0.86;
    const lit = this.shutterOpen > 0.5 ? (Math.sin(time * 23) > -0.96 || this.reduced ? 1 : 0.35) : 0;
    this.tube.intensity = 24 * lit; (this.tubeMesh.material as THREE.MeshBasicMaterial).color.set(lit > 0.5 ? '#fff1cf' : '#3a3833');
    for (const a of this.actors.values()) {
      const p = a.sp.position;
      // Walk through the doorway instead of through the wall.
      const outside = p.z < 0.2, goalOutside = a.gz < 0.2; let tx = a.gx, tz = a.gz;
      if (outside !== goalOutside) {
        if (outside) { tx = GATE.x; tz = Math.abs(p.x - GATE.x) > 0.1 ? p.z : GATE.z + 0.1; }
        else { tx = GATE.x; tz = Math.abs(p.x - GATE.x) > 0.1 || p.z > GATE.z + 0.2 ? GATE.z : -0.5; }
      }
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), far = Math.hypot(a.gx - p.x, a.gz - p.z), step = (this.reduced ? 40 : 2.6) * dt;
      if (d > 0.03) { p.x += dx / d * Math.min(step, d); p.z += dz / d * Math.min(step, d); }
      const moving = far > 0.06;
      a.sp.visible = !(a.away && !moving);
      p.y = moving ? Math.abs(Math.sin(time * 9 + a.phase)) * 0.07 : a.busy && !this.reduced ? Math.abs(Math.sin(time * 6 + a.phase)) * 0.12 : 0;
      a.sp.material.rotation = a.busy && !moving && !this.reduced ? Math.sin(time * 6 + a.phase) * 0.08 : 0;
    }
    this.drip.position.y = 2.6 - ((time * 1.7) % 1) * 2.6;
    const p = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 14; if (y < 0) y += 12; p.setY(i, y); }
    p.needsUpdate = true;
    for (const grp of this.built.values()) if (grp.userData.t < 1) {
      grp.userData.t = Math.min(1, grp.userData.t + dt * 2);
      grp.children.forEach((c, i) => { const k = THREE.MathUtils.clamp(grp.userData.t * 2.2 - i * 0.045, 0, 1); c.scale.setScalar(k); c.position.y = 0.035 + (1 - k) * 0.6; });
    }
    if (this.ghost.visible) (this.ghost.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(time * 5) * 0.15;
    this.renderer.render(this.scene, this.cam);
  }
}
