// Rendering layer: builds the Bangkok plot from data. Knows nothing about money or rules.
import * as THREE from 'three';
import { GRID, PILLARS, type Facility } from '../sim/state';

const PIXEL = 3; // screen pixels per rendered pixel (chunky pixel-art look)

function tex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat?: [number, number]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function noise(c: CanvasRenderingContext2D, s: number, base: [number, number, number], amp: number, seed: number) {
  const r = rng(seed);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const n = (r() - 0.5) * amp;
    c.fillStyle = `rgb(${base[0] + n | 0},${base[1] + n | 0},${base[2] + n | 0})`; c.fillRect(x, y, 1, 1);
  }
}
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
  private rin!: THREE.Sprite; private rinGoal = -3.2;
  private ghost!: THREE.Mesh; private rain!: THREE.Points; private drip!: THREE.Mesh;
  private facilityGroup = new THREE.Group(); private built = new Map<string, THREE.Group>();
  private ray = new THREE.Raycaster(); private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private clock = new THREE.Clock(); private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.scene.background = new THREE.Color('#0d1418');
    this.scene.fog = new THREE.Fog('#0d1418', 42, 70);
    this.build();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private build() {
    const s = this.scene;
    s.add(new THREE.AmbientLight('#5f7f96', 1.25));
    const moon = new THREE.DirectionalLight('#8fb4c8', 0.9); moon.position.set(8, 14, 10); s.add(moon);
    const street = new THREE.PointLight('#ff9a4a', 30, 16, 1.6); street.position.set(6, 3.2, -2.6); s.add(street);
    const neon = new THREE.PointLight('#ff3f7a', 18, 12, 1.8); neon.position.set(-2.2, 2.2, 3); s.add(neon);
    this.tube = new THREE.PointLight('#ffd9a0', 0, 18, 1.4); this.tube.position.set(6, 2.6, 3.5); s.add(this.tube);

    // --- ground ---
    const alleyTex = tex(32, (c, n) => { noise(c, n, [38, 46, 52], 16, 7); c.fillStyle = 'rgba(120,170,190,.18)'; c.fillRect(5, 9, 11, 3); c.fillRect(19, 22, 8, 2); }, [14, 14]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), mat({ map: alleyTex, roughness: 0.35, metalness: 0.25 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(6, -0.02, 4); s.add(ground);

    const floorTex = tex(32, (c, n) => {
      noise(c, n, [118, 112, 102], 22, 3);
      c.strokeStyle = 'rgba(40,36,32,.55)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, n - 1, n - 1);
      c.strokeStyle = 'rgba(30,26,24,.5)'; c.beginPath(); c.moveTo(6, 4); c.lineTo(12, 13); c.lineTo(10, 21); c.lineTo(17, 29); c.stroke();
      c.fillStyle = 'rgba(60,52,44,.35)'; c.fillRect(20, 6, 6, 4);
    }, [GRID.w, GRID.d]);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(GRID.w, 0.2, GRID.d), mat({ map: floorTex }));
    floor.position.set(GRID.w / 2, -0.1, GRID.d / 2); s.add(floor);

    // --- walls (far sides full height, near sides cut away) ---
    const wallTex = tex(32, (c, n) => { noise(c, n, [150, 132, 104], 20, 11); c.fillStyle = 'rgba(40,60,50,.3)'; c.fillRect(0, 24, n, 8); c.fillStyle = 'rgba(30,24,20,.3)'; c.fillRect(9, 0, 2, 20); }, [4, 1]);
    const wall = mat({ map: wallTex }); const H = 2.6;
    s.add(box(0.25, H, GRID.d, wall, -0.125, H / 2, GRID.d / 2));           // left wall
    s.add(box(4, H, 0.25, wall, 2, H / 2, -0.125));                         // back wall, left of entrance
    s.add(box(4, H, 0.25, wall, 10, H / 2, -0.125));                        // back wall, right of entrance
    s.add(box(4, 0.5, 0.25, wall, 6, H - 0.25, -0.125));                    // lintel
    const curb = mat({ color: '#6d665c' });
    s.add(box(GRID.w + 0.25, 0.28, 0.2, curb, GRID.w / 2, 0.14, GRID.d + 0.1)); // near cut wall
    s.add(box(0.2, 0.28, GRID.d, curb, GRID.w + 0.1, 0.14, GRID.d / 2));

    // posters on the left wall
    const posterTex = tex(16, (c) => { c.fillStyle = '#b8472f'; c.fillRect(0, 0, 16, 16); c.fillStyle = '#e9d7a8'; c.fillRect(2, 2, 12, 3); c.fillStyle = '#2a2320'; c.fillRect(4, 7, 3, 7); c.fillRect(9, 7, 3, 7); });
    [[2.2, '#ffffff'], [3.6, '#9bb0a0'], [6.1, '#c9b48a']].forEach(([z, tint]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), mat({ map: posterTex, color: tint as string }));
      p.rotation.y = Math.PI / 2; p.position.set(0.02, 1.5, z as number); s.add(p);
    });

    // pillars
    const pil = mat({ color: '#8d8474' });
    PILLARS.forEach(([x, z]) => s.add(box(0.5, H, 0.5, pil, x + 0.5, H / 2, z + 0.5)));

    // gutter + leak
    s.add(box(0.5, 0.03, 2, mat({ color: '#1c2a30', roughness: 0.2, metalness: 0.4 }), 0.45, 0.02, 7));
    this.drip = box(0.06, 0.25, 0.06, new THREE.MeshBasicMaterial({ color: '#bfe3f2' }), 0.5, 2.6, 6.6); s.add(this.drip);

    // fluorescent tube
    this.tubeMesh = box(1.6, 0.06, 0.08, new THREE.MeshBasicMaterial({ color: '#3a3833' }), 6, 2.55, 3.5); s.add(this.tubeMesh);
    s.add(box(0.03, 0.5, 0.03, pil, 5.3, 2.8, 3.5), box(0.03, 0.5, 0.03, pil, 6.7, 2.8, 3.5));

    // roll-up shutter
    const shTex = tex(16, (c) => { for (let y = 0; y < 16; y++) { c.fillStyle = y % 4 === 0 ? '#3d2f28' : y % 4 === 1 ? '#8a5a3c' : '#7a4a32'; c.fillRect(0, y, 16, 1); } c.fillStyle = 'rgba(190,110,60,.5)'; c.fillRect(3, 5, 2, 6); c.fillRect(11, 2, 1, 9); }, [3, 2]);
    const g = new THREE.BoxGeometry(4, 2.1, 0.08); g.translate(0, -1.05, 0); // pivot at the top
    this.shutter = new THREE.Mesh(g, mat({ map: shTex, metalness: 0.4, roughness: 0.6 }));
    this.shutter.position.set(6, 2.1, -0.1); s.add(this.shutter);

    // --- neighbourhood (decor only, not simulation entities) ---
    const r = rng(42);
    const win = new THREE.MeshBasicMaterial({ color: '#ffcf7a' }); const winC = new THREE.MeshBasicMaterial({ color: '#7fd3e0' });
    const roofTex = tex(16, (c) => { for (let x = 0; x < 16; x++) { c.fillStyle = x % 3 === 0 ? '#3a4a52' : '#56666c'; c.fillRect(x, 0, 1, 16); } }, [3, 3]);
    const addHouse = (x: number, z: number, w: number, d: number, h: number, col: string) => {
      s.add(box(w, h, d, mat({ color: col }), x, h / 2, z));
      s.add(box(w + 0.3, 0.12, d + 0.3, mat({ map: roofTex }), x, h + 0.06, z));
      for (let i = 0; i < 3; i++) if (r() > 0.35) {
        s.add(box(0.45, 0.5, 0.05, r() > 0.5 ? win : winC, x - w / 2 + 0.8 + i * (w - 1.6) / 2, h * 0.6, z + d / 2 + 0.03));
        s.add(box(0.05, 0.5, 0.45, r() > 0.5 ? win : winC, x + w / 2 + 0.03, h * 0.6, z - d / 2 + 0.8 + i * (d - 1.6) / 2));
      }
    };
    addHouse(-4.2, 3, 5, 6, 3.4, '#4d4a45'); addHouse(-4.5, -6.5, 6, 5, 4.6, '#55504a'); addHouse(3, -8.5, 6, 4.5, 3.8, '#4a5354');
    addHouse(10.5, -8.2, 6.5, 4, 5.2, '#5a4f48'); addHouse(-5, 10.5, 6, 5, 3, '#46484a'); addHouse(17.5, -3, 5, 7, 4.2, '#4f4a4d');
    // neon sign
    s.add(box(0.08, 1.4, 0.5, new THREE.MeshBasicMaterial({ color: '#ff4f86' }), -1.65, 2.3, 3));
    // food cart
    const cart = new THREE.Group();
    cart.add(box(1.1, 0.6, 0.7, mat({ color: '#b9b2a2', metalness: 0.5, roughness: 0.4 }), 0, 0.6, 0));
    cart.add(box(0.05, 1.4, 0.05, pil, 0, 1.3, 0));
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1, 0.4, 8), mat({ color: '#c5402f', flatShading: true })); umb.position.y = 2.1; cart.add(umb);
    cart.add(box(0.18, 0.18, 0.18, win, 0.3, 1.0, 0));
    cart.position.set(10.2, 0, -2.4); s.add(cart);
    // power pole + lines
    s.add(box(0.18, 5.4, 0.18, mat({ color: '#3b332c' }), 1.2, 2.7, -3.6), box(1.4, 0.1, 0.1, mat({ color: '#3b332c' }), 1.2, 5, -3.6));
    const lm = new THREE.LineBasicMaterial({ color: '#15191c' });
    [[-0.5, 0], [0, 0.3], [0.5, -0.2]].forEach(([o, sag]) => {
      const pts = []; for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new THREE.Vector3(1.2 + o + k * 17, 5 - Math.sin(k * Math.PI) * (0.9 + sag), -3.6 + k * 0.6)); }
      s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
    });
    // street lamp, plants, scooter
    s.add(box(0.1, 3.2, 0.1, mat({ color: '#2a2a2a' }), 6, 1.6, -2.9), box(0.35, 0.12, 0.35, win, 6, 3.2, -2.75));
    [[13, 2], [13.2, 5.5], [-0.9, -1.2], [8.8, -0.9]].forEach(([x, z]) => {
      s.add(box(0.4, 0.35, 0.4, mat({ color: '#8a4b33' }), x, 0.17, z));
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat({ color: '#3f7a4a', flatShading: true })); leaf.position.set(x, 0.75, z); s.add(leaf);
    });
    s.add(box(1.1, 0.45, 0.3, mat({ color: '#2f6f86', metalness: 0.5, roughness: 0.4 }), 13.4, 0.4, -1.5), box(0.3, 0.3, 0.3, mat({ color: '#15191c' }), 12.95, 0.15, -1.5), box(0.3, 0.3, 0.3, mat({ color: '#15191c' }), 13.85, 0.15, -1.5));

    // --- Rin (billboard pixel sprite) ---
    const rinTex = tex(16, (c) => {
      c.clearRect(0, 0, 16, 16);
      const px = (col: string, x: number, y: number, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
      px('#1b1512', 5, 0, 6, 3); px('#1b1512', 4, 2, 1, 4); px('#1b1512', 11, 2, 1, 4);   // hair
      px('#c98d63', 5, 2, 6, 4); px('#1b1512', 6, 4); px('#1b1512', 9, 4);                 // face
      px('#597789', 4, 6, 8, 5); px('#c98d63', 3, 7, 1, 3); px('#c98d63', 12, 7, 1, 3);    // jacket + arms
      px('#f0e5cd', 10, 8, 3, 3);                                                          // notebook
      px('#2c2a30', 5, 11, 6, 4); px('#141214', 5, 15, 2, 1); px('#141214', 9, 15, 2, 1);  // legs + shoes
    });
    this.rin = new THREE.Sprite(new THREE.SpriteMaterial({ map: rinTex, transparent: true, alphaTest: 0.5 }));
    this.rin.scale.set(1.25, 1.25, 1); this.rin.position.set(6, 0.62, -3.2); s.add(this.rin);

    // --- placement ghost ---
    this.ghost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#f0e5cd', transparent: true, opacity: 0.55, depthTest: false }));
    this.ghost.rotation.x = -Math.PI / 2; this.ghost.visible = false; this.ghost.renderOrder = 5; s.add(this.ghost);
    s.add(this.facilityGroup);

    // --- rain ---
    const n = this.reduced ? 0 : 320; const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = -8 + r() * 30; pos[i * 3 + 1] = r() * 12; pos[i * 3 + 2] = -12 + r() * 28; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: '#9fc4d6', size: 1, sizeAttenuation: false, transparent: true, opacity: 0.4 }));
    s.add(this.rain);
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(Math.ceil(w / PIXEL), Math.ceil(h / PIXEL), false);
    const aspect = w / h; const viewH = Math.max(19 / aspect, 15.5);
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
    this.shutterGoal = open ? 1 : 0; this.rinGoal = open ? 1.6 : -3.2;
    if (instant) { this.shutterOpen = this.shutterGoal; this.rin.position.z = this.rinGoal; }
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
    this.tube.intensity = 46 * lit; (this.tubeMesh.material as THREE.MeshBasicMaterial).color.set(lit > 0.5 ? '#fff1cf' : '#3a3833');
    this.rin.position.z += (this.rinGoal - this.rin.position.z) * Math.min(1, dt * (this.reduced ? 60 : 1.2));
    const moving = Math.abs(this.rinGoal - this.rin.position.z) > 0.08;
    this.rin.position.y = 0.62 + (moving ? Math.abs(Math.sin(time * 9)) * 0.07 : 0);
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
