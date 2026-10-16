import * as THREE from 'three';
import { Room } from '../app/Room.js';
import { getHall } from '../hall/Hall.js';
import { h } from '../core/dom.js';
import { clamp, ease, lerp } from '../core/math.js';

// ROOM 07 · Moving every point.
// Arriving through the PC screen, the raycaster's flat maze rises into real
// 3D walls, then sinks into a grid seen from above. On that grid, two
// arrows (green for "one step right", red for "one step up") define
// everything: a matrix is just where those arrows land, and moving them
// drags the whole grid along. A third arrow adds depth, and dividing by
// distance turns 3D points into a picture.

const N = 14;                // grid half-size, in units
const GREEN = 0x83e07b, RED = 0xff6b5e, BLUE = 0x6fb7ff, GOLD = 0xffcf5a;

// Grid lines are drawn as thin screen-space ribbons so they keep a constant,
// anti-aliased width however the matrix stretches the plane (plain WebGL
// lines are always one hairline pixel wide).
const LINE_VERT = /* glsl */`
uniform mat4 uM;
uniform vec2 uRes;
uniform float uWidth;
attribute vec3 aOther;
attribute float aSide, aFade;
varying float vFade, vEdge;
void main(){
  vFade = aFade; vEdge = aSide;
  vec4 a = projectionMatrix * viewMatrix * (uM * vec4(position, 1.0));
  vec4 b = projectionMatrix * viewMatrix * (uM * vec4(aOther, 1.0));
  vec2 sa = a.xy / a.w * uRes, sb = b.xy / b.w * uRes;
  vec2 d = sb - sa; float L = length(d);
  vec2 n = L > 1e-5 ? vec2(-d.y, d.x) / L : vec2(0.0, 1.0);
  float w = uWidth * (0.6 + 0.4 * aFade);
  a.xy += n * aSide * w / uRes * a.w;
  gl_Position = a;
}`;
const LINE_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uOpacity;
varying float vFade, vEdge;
void main(){
  float soft = 1.0 - smoothstep(0.5, 1.0, abs(vEdge));
  gl_FragColor = vec4(uColor, uOpacity * vFade * soft);
}`;

function gridGeometry(n, { three = false } = {}) {
  const pos = [], other = [], side = [], fade = [], index = [];
  const seg = (a, b, f) => {
    const i = pos.length / 3;
    for (const [p, q, s] of [[a, b, -1], [a, b, 1], [b, a, 1], [b, a, -1]]) { pos.push(...p); other.push(...q); side.push(s); fade.push(f); }
    index.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const zs = three ? [-3, -2, -1, 0, 1, 2, 3] : [0];
  for (const z of zs) {
    for (let i = -n; i <= n; i++) {
      const f = (i === 0 ? 1 : 0.7) * (three ? (z === 0 ? 1 : 0.5) : 1);
      seg([i, -n, z], [i, n, z], f);
      seg([-n, i, z], [n, i, z], f);
    }
  }
  if (three) for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) seg([x, y, -3], [x, y, 3], 0.3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOther', new THREE.Float32BufferAttribute(other, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  g.setIndex(index);
  return g;
}

const RES = { value: new THREE.Vector2(1, 1) };   // half the drawing buffer size, shared by every grid
function lineMaterial(color, opacity, uM, width = 1.2) {
  return new THREE.ShaderMaterial({
    uniforms: { uM, uRes: RES, uWidth: { value: width }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// The default shape on the grid: a mouse pointer, lopsided on purpose so
// that turns and mirror images are easy to see.
const POINTER = [
  'X.......', 'XX......', 'XXX.....', 'XXXX....', 'XXXXX...', 'XXXXXX..',
  'XXXXXXX.', 'XXXX....', 'XX.XX...', 'X..XX...', '....XX..', '....XX..',
].join('').split('').map((c) => (c === 'X' ? 1 : 0));

class Arrow {
  constructor(color) {
    this.group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color });
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 12), mat);
    this.head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 20), mat);
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
    this.group.add(this.shaft, this.head, this.tip);
    this.to = new THREE.Vector3(1, 0, 0);
  }
  set(v) {
    this.to.copy(v);
    const len = Math.max(1e-4, v.length()), dir = v.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const shaftLen = Math.max(0, len - 0.3);
    this.shaft.scale.set(1, shaftLen, 1); this.shaft.position.copy(dir).multiplyScalar(shaftLen / 2); this.shaft.quaternion.copy(q);
    this.head.position.copy(dir).multiplyScalar(len - 0.16); this.head.quaternion.copy(q);
    this.tip.position.copy(v);
  }
}

export default (app) => new TransformsRoom(app, {
  id: 'transforms', title: 'Moving Every Point', years: '1963 – today', music: 'synth',
  secrets: [
    { id: 'flip', title: 'Through the looking glass', hint: 'Drag the arrows so the grid flips over.', desc: 'A negative determinant: the grid has been mirrored.' },
    { id: 'squash', title: 'Flatland', hint: 'Line the two arrows up.', desc: 'When both arrows point the same way, the whole plane collapses onto a line.' },
  ],
  notes: [
    { title: 'Points are numbers', body: [
      'In 3D graphics, every corner of every shape is stored as a few numbers: how far right, how far up, how far back. Moving, turning or resizing a shape means doing arithmetic on those numbers.',
    ] },
    { title: 'A matrix is where the arrows land', body: [
      'Take the arrow “one step right” and the arrow “one step up”. Wherever you move them, every other point follows, because every point is just some amount of the first arrow plus some amount of the second. Writing down where the two arrows land gives you a grid of numbers: a matrix.',
      { eq: '[ a  b ]   first column: where “right” lands\n[ c  d ]   second column: where “up” lands' },
      'Graphics cards multiply millions of points by matrices like this every frame.',
    ] },
    { title: 'Perspective', body: [
      'To turn 3D into a flat picture, divide by distance: far things shrink toward the centre.',
      { eq: 'x on screen = x ÷ z\ny on screen = y ÷ z' },
      'Real renderers fold this into a 4 × 4 matrix with an extra number, w, and the hardware does the division for every point.',
    ] },
  ],
});

class TransformsRoom extends Room {
  constructor(app, meta) { super(app, meta); this.kind = 'scene'; }

  get camera() { return this.cam; }
  transitionFrom(from) { return from?.id === 'raycast' ? 'none' : 'dissolve'; }

  async load() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x07080d);
    this.cam = new THREE.PerspectiveCamera(10, 1, 0.1, 400);
    this.uM = { value: new THREE.Matrix4() };
    this.M = new THREE.Matrix3();          // the 2D/3D linear map being shown (column-major in three)
    this.base = new THREE.Mesh(gridGeometry(N), lineMaterial(0x5a6070, 0.35, { value: new THREE.Matrix4() }, 0.8));
    this.grid = new THREE.Mesh(gridGeometry(N), lineMaterial(0x3d8bff, 0.95, this.uM, 1.4));
    this.grid3 = new THREE.Mesh(gridGeometry(3, { three: true }), lineMaterial(0x6fb7ff, 0.6, this.uM, 1.2));
    for (const m of [this.base, this.grid, this.grid3]) m.frustumCulled = false;
    this.base.renderOrder = 0; this.grid.renderOrder = 1; this.grid3.renderOrder = 1;
    this.grid3.visible = false;
    s.add(this.base, this.grid, this.grid3);
    this.arrows = [new Arrow(GREEN), new Arrow(RED), new Arrow(BLUE)];
    this.arrows.forEach((a) => s.add(a.group));
    this.arrows[2].group.visible = false;
    // the visitor's cursor glyph, as a shape on the grid
    const glyph = new THREE.Group();
    this.glyphMat = new THREE.ShaderMaterial({ uniforms: { uM: this.uM, uColor: { value: new THREE.Color(GOLD) }, uOpacity: { value: 0.9 } }, vertexShader: 'uniform mat4 uM; void main(){ gl_Position = projectionMatrix * viewMatrix * (uM * vec4(position, 1.0)); }', fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; void main(){ gl_FragColor = vec4(uColor, uOpacity); }', transparent: true, side: THREE.DoubleSide });
    this.glyph = glyph; s.add(glyph);
    // the probe point and its coordinate guides
    this.point = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.guides = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.7 }));
    s.add(this.point, this.guides);
    // perspective: an eye, an image plane, rays
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: GOLD }));
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    this.planeEdge = new THREE.LineSegments(new THREE.EdgesGeometry(this.plane.geometry), new THREE.LineBasicMaterial({ color: GOLD }));
    this.plane.add(this.planeEdge);
    this.rays = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55 }));
    this.hits = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: GOLD, size: 0.12 }));
    this.persp = new THREE.Group(); this.persp.add(this.eye, this.plane, this.rays, this.hits); this.persp.visible = false;
    s.add(this.persp);
    // the maze that rises out of the raycaster
    this.maze = new THREE.Group(); s.add(this.maze);
    this.ray = new THREE.Raycaster();
    this.view = { pos: new THREE.Vector3(0, 0, 60), look: new THREE.Vector3(0, 0, 0), fov: 10, up: new THREE.Vector3(0, 1, 0) };
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(w, hgt) { this.cam.aspect = w / hgt; this.cam.updateProjectionMatrix(); }

  /** Field of view that frames about ±4.5 units of the plane in the free area. */
  get flatFov() { return 9; }

  buildGlyph() {
    this.glyph.clear();
    const st = this.app.state, g = st.glyphEdited ? st.glyph : POINTER, geos = [];
    for (let i = 0; i < 96; i++) if (g[i]) { const q = new THREE.PlaneGeometry(0.25, 0.25); q.translate(0.5 + (i % 8) * 0.25 + 0.125, 3.25 - Math.floor(i / 8) * 0.25 - 0.125, 0.01); geos.push(q); }
    const merged = new THREE.BufferGeometry();
    const pos = []; for (const q of geos) { const a = q.toNonIndexed().attributes.position.array; pos.push(...a); }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.glyph.add(new THREE.Mesh(merged, this.glyphMat));
  }

  buildMaze() {
    this.maze.clear();
    const rows = this.app.rooms.find((r) => r.id === 'raycast')?.grid;
    if (!rows) return;
    const H = rows.length, W = rows[0].length;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a4aa8, roughness: 0.6, emissive: 0x0a1230 });
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0, 0.5);
    let count = 0; for (const r of rows) for (const c of r) if (c) count++;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    let i = 0; const m4 = new THREE.Matrix4();
    // map x → world x, map y → world -y, walls rise along +z
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rows[y][x]) { m4.makeTranslation(x + 0.5 - W / 2, -(y + 0.5 - H / 2), 0); mesh.setMatrixAt(i++, m4); }
    this.maze.add(mesh, new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(3, -5, 8); this.maze.add(dl);
    this.mazeInfo = { W, H };
  }

  // ------------------------------------------------------------------ math display
  buildOverlay(scope) {
    const col = (cls) => h('div', { class: `col ${cls}` }, h('span'), h('span'), h('span'));
    this.matEl = h('div', { class: 'matrix', style: { left: '28px', top: '96px' } }, h('div', { class: 'bracket' }, col('c0'), col('c1'), col('c2')));
    this.coordEl = h('div', { class: 'matrix coord', style: { display: 'none' } });
    scope.mount(this.matEl, this.app.chrome.overlay);
    scope.mount(this.coordEl, this.app.chrome.overlay);
  }

  showMatrix(on, dims = 2) {
    this.matEl.style.display = on ? '' : 'none';
    this.dims = dims;
  }

  updateOverlay() {
    const e = this.M.elements, d = this.dims || 2;
    const cols = this.matEl.querySelectorAll('.col');
    cols.forEach((c, j) => {
      c.style.display = j < d ? '' : 'none';
      c.querySelectorAll('span').forEach((s, i) => { s.style.display = i < d ? '' : 'none'; s.textContent = (Math.round(e[j * 3 + i] * 100) / 100).toFixed(e[j * 3 + i] % 1 === 0 ? 0 : 1); });
    });
    if (this.coordEl.style.display !== 'none') {
      const p = this.pointPos.clone().applyMatrix3(this.M);
      const v = p.clone().project(this.cam);
      this.coordEl.style.left = `${(v.x + 1) / 2 * window.innerWidth + 16}px`;
      this.coordEl.style.top = `${(1 - v.y) / 2 * window.innerHeight - 50}px`;
      this.coordEl.textContent = `(${Math.round(p.x * 10) / 10}, ${Math.round(p.y * 10) / 10})`;
    }
  }

  setMatrix(m) {
    this.M.copy(m);
    const e = m.elements;
    this.uM.value.set(e[0], e[3], e[6], 0, e[1], e[4], e[7], 0, e[2], e[5], e[8], 0, 0, 0, 0, 1);
    this.arrows.forEach((a, j) => a.set(new THREE.Vector3(e[j * 3], e[j * 3 + 1], e[j * 3 + 2])));
    const det = m.determinant();
    if (det < -0.05 && !this.guided) this.app.secret('flip', 'Through the looking glass', 'A negative determinant: the grid has been mirrored.');
    if (Math.abs(det) < 0.05 && !this.guided) this.app.secret('squash', 'Flatland', 'Both arrows on one line: the whole plane collapses.');
  }

  /** Smoothly blend the matrix to a target, like moving the arrows by hand. */
  animateTo(scope, target, duration = 1.8, live = () => true) {
    const from = this.M.clone(), a = from.elements, b = target.elements;
    const tw = scope.tween(duration, (k) => {
      if (!live()) { tw.cancel(); return; }
      const m = new THREE.Matrix3(); for (let i = 0; i < 9; i++) m.elements[i] = lerp(a[i], b[i], k); this.setMatrix(m);
    }, { ease: 'inOutCubic' });
    return tw.promise;
  }

  /** Move the camera to a pose; 2D shots look straight down a long lens. */
  shot(scope, { pos, look = [0, 0, 0], fov, up = [0, 1, 0] }, duration = 2) {
    const v = this.view, from = { pos: v.pos.clone(), look: v.look.clone(), fov: v.fov, up: v.up.clone() };
    const to = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov, up: new THREE.Vector3(...up) };
    return scope.tween(duration, (k) => { v.pos.lerpVectors(from.pos, to.pos, k); v.look.lerpVectors(from.look, to.look, k); v.fov = lerp(from.fov, to.fov, k); v.up.lerpVectors(from.up, to.up, k).normalize(); }, { ease: 'inOutSine' }).promise;
  }

  // ------------------------------------------------------------------ visit
  enter(scope, ctx) {
    this.buildGlyph();
    this.buildOverlay(scope);
    this.setMatrix(new THREE.Matrix3());
    this.pointPos = new THREE.Vector3(3, 2, 0);
    this.showMatrix(false);
    this.grid3.visible = false; this.arrows[2].group.visible = false; this.persp.visible = false;
    this.base.visible = this.grid.visible = this.glyph.visible = true;
    this.arrows.forEach((a, i) => (a.group.visible = i < 2));
    this.point.visible = false; this.guides.visible = false;
    this.maze.visible = false;
    this.phase = 'scene';
    this.view.pos.set(0, 0, 60); this.view.look.set(0, 0, 0); this.view.fov = this.flatFov; this.view.up.set(0, 1, 0);
    scope.add(() => { this.dragging = null; this.app.canvas.style.cursor = ''; });

    const I = new THREE.Matrix3();
    const M2 = (a, b, c, d) => new THREE.Matrix3().set(a, b, 0, c, d, 0, 0, 0, 1);
    // each step's animation stops as soon as another step begins
    let runId = 0;
    const run = (fn) => { const id = ++runId; fn(() => id === runId); };
    const steps = [
      { caption: 'Every point is just numbers: how far right, and how far up.', duration: 7,
        enter: () => { this.guided = true; this.setMatrix(I); this.showMatrix(false); this.point.visible = true; this.guides.visible = true; this.coordEl.style.display = ''; },
        update: (t) => { this.pointPos.set(Math.round(3 + 2 * Math.sin(t * 0.8)), Math.round(2 + 1.5 * Math.cos(t * 0.6)), 0); },
        exit: () => { this.point.visible = false; this.guides.visible = false; this.coordEl.style.display = 'none'; } },
      { caption: 'Two arrows define the whole grid: green is one step right, red is one step up.', duration: 6,
        enter: () => { this.guided = true; this.setMatrix(I); this.showMatrix(true); } },
      { caption: 'Move the arrows and the whole grid follows. The arrows’ new positions are the matrix.', duration: 11,
        enter: () => { this.guided = true; this.setMatrix(I); this.showMatrix(true); run(async (live) => {
          for (const m of [M2(0, -1, 1, 0), M2(1, 1, 0, 1), M2(1.5, 0.5, -0.4, 0.9), I]) {
            if (!live() || !(await this.animateTo(scope, m, 1.8, live))) return;
            if (!(await scope.wait(0.6))) return;
          }
        }); },
        exit: () => run(() => {}) },
      { caption: 'Your turn: drag the tips of the green and red arrows.',
        enter: () => { this.guided = false; this.showMatrix(true); } },
      { caption: 'Add a third arrow, blue for “one step back”, and the same idea works in 3D.', duration: 8,
        enter: () => { this.guided = true; this.showMatrix(true, 3); this.setMatrix(I); this.enter3D(scope); } },
      { caption: 'To draw it on a flat screen, divide by distance: far things shrink toward the middle.', duration: 10,
        enter: () => { this.guided = true; this.enter3D(scope, true); this.showMatrix(false); } },
      { caption: 'Every 3D game does this for every corner of every shape, millions of times a second.',
        enter: () => { this.guided = true; this.enter3D(scope, true); this.showMatrix(false); } },
    ];

    // arriving from the raycaster, the guide starts once the maze has sunk into the grid
    this.tour = null;
    if (ctx.fromId === 'raycast') this.mazeIntro(scope, steps);
    else this.tour = this.startTour(scope, steps);
  }

  /** The dive: through the PC glass, the maze rises in 3D and sinks into the grid. */
  async mazeIntro(scope, steps) {
    this.buildMaze();
    const hall = getHall(this.app);
    this.phase = 'dive';
    this.app.audio.whoosh(2.4, true, 0.3);
    const ok = await hall.goTo(hall.view('pc', 'glass'), { duration: 1.8, lift: 0 });
    if (!ok || scope.disposed) return;
    this.phase = 'maze';
    const rc = this.app.rooms.find((r) => r.id === 'raycast');
    const p = rc?.p || { x: 1.5, y: 5.5, a: 0 };
    const { W, H } = this.mazeInfo;
    const ex = p.x - W / 2, ey = -(p.y - H / 2);
    const fwd = new THREE.Vector3(Math.cos(p.a), -Math.sin(p.a), 0);
    this.maze.visible = true; this.maze.scale.set(1, 1, 1);
    this.grid.visible = this.base.visible = this.glyph.visible = false;
    this.arrows.forEach((a) => (a.group.visible = false));
    this.view.pos.set(ex, ey, 0.5); this.view.look.set(ex + fwd.x, ey + fwd.y, 0.5); this.view.fov = 50; this.view.up.set(0, 0, 1);
    if (!(await scope.wait(0.9))) return;
    // rise above the maze
    if (!(await this.shot(scope, { pos: [ex - fwd.x * 6, ey - fwd.y * 6, 9], look: [0, 0, 0], fov: 45, up: [0, 0, 1] }, 2.4))) return;
    this.grid.visible = this.base.visible = true;
    await Promise.all([
      scope.tween(1.8, (k) => { this.maze.scale.z = Math.max(0.001, 1 - k); }).promise,
      this.shot(scope, { pos: [0, 0, 60], look: [0, 0, 0], fov: this.flatFov, up: [0, 1, 0] }, 2.6),
    ]);
    if (scope.disposed) return;
    this.maze.visible = false;
    this.glyph.visible = true;
    this.arrows.forEach((a, i) => (a.group.visible = i < 2));
    this.phase = 'scene';
    this.tour = this.startTour(scope, steps);
  }

  enter3D(scope, perspective = false) {
    this.grid3.visible = true; this.grid.visible = false; this.base.visible = false;
    this.arrows[2].group.visible = true;
    this.persp.visible = perspective;
    this.shot(scope, { pos: perspective ? [9, 5, 12] : [7, -9, 7], look: [0, 0, 0], fov: 40, up: [0, 0, 1] }, 2.5);
    if (perspective) {
      // an eye looking at the lattice, an image plane between them
      this.eye.position.set(0, -9, 0);
      this.plane.position.set(0, -6, 0); this.plane.rotation.set(Math.PI / 2, 0, 0);
      const corners = [];
      for (const x of [-3, 3]) for (const y of [-3, 3]) for (const z of [-3, 3]) corners.push(new THREE.Vector3(x, y, z));
      const rays = [], hits = [];
      for (const c of corners) {
        rays.push(c.x, c.y, c.z, 0, -9, 0);
        const t = (-6 - -9) / (c.y + 9);
        hits.push(c.x * t, -6, c.z * t);
      }
      this.rays.geometry.setAttribute('position', new THREE.Float32BufferAttribute(rays, 3));
      this.hits.geometry.setAttribute('position', new THREE.Float32BufferAttribute(hits, 3));
    }
  }

  // ------------------------------------------------------------------ input
  pointer(e) {
    if (this.phase !== 'scene') return;
    this.ray.setFromCamera(new THREE.Vector2(e.nx, e.ny), this.cam);
    if (e.type === 'down') {
      const tips = this.arrows.slice(0, 2).filter((a) => a.group.visible).map((a) => a.tip);
      const hit = this.ray.intersectObjects(tips)[0];
      if (hit && !this.grid3.visible) {
        this.dragging = this.arrows.findIndex((a) => a.tip === hit.object);
        this.tour.pause();
        if (this.tour.index < 3) this.tour.go(3);
        this.guided = false;
      }
    }
    if (e.type === 'move') {
      if (this.dragging !== null && this.dragging !== undefined && e.buttons) {
        const p = new THREE.Vector3();
        if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p)) {
          const snap = (v) => (e.shift ? v : Math.round(v * 2) / 2);
          const m = this.M.clone(), el = m.elements, j = this.dragging;
          el[j * 3] = clamp(snap(p.x), -N, N); el[j * 3 + 1] = clamp(snap(p.y), -N, N);
          this.setMatrix(m);
        }
      } else {
        const tips = this.arrows.slice(0, 2).map((a) => a.tip);
        this.app.canvas.style.cursor = !this.grid3.visible && this.ray.intersectObjects(tips).length ? 'grab' : '';
      }
    }
    if (e.type === 'up') this.dragging = null;
  }

  // ------------------------------------------------------------------ frame
  update(dt, t) {
    const v = this.view, cam = this.cam;
    if (this.grid3.visible && this.tour && !this.tour.autoplay) {
      // gentle orbit while the visitor watches the 3D lattice
      v.pos.applyAxisAngle(new THREE.Vector3(0, 0, 1), dt * 0.1);
    }
    cam.position.copy(v.pos); cam.up.copy(v.up); cam.lookAt(v.look);
    if (cam.fov !== v.fov) { cam.fov = v.fov; cam.updateProjectionMatrix(); }
    if (this.point.visible) {
      const p = this.pointPos.clone().applyMatrix3(this.M);
      this.point.position.copy(p);
      this.guides.geometry.setFromPoints([new THREE.Vector3(p.x, 0, 0), p, new THREE.Vector3(0, p.y, 0), p]);
      this.guides.computeLineDistances();
    }
    if (this.matEl) this.updateOverlay();
  }

  render(renderer, target) {
    if (this.phase === 'dive') { getHall(this.app).render(renderer, target); return; }
    renderer.getDrawingBufferSize(RES.value).multiplyScalar(0.5);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }

  pickables() { return []; }
}
