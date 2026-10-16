import * as THREE from 'three';
import { Room } from '../app/Room.js';
import { canvasTexture, glowTexture } from '../gfx/three-utils.js';
import { fitCamera } from '../gfx/fit.js';
import { damp, seeded } from '../core/math.js';

// ROOM 15 · The optics bench.
// Five small puzzles on a lab table: mirrors, a lens, a glass block and a
// prism. The beams obey the same two rules the ray tracer in the next room
// uses for every ray: reflection and refraction.

const VW = 1600, VH = 1000;            // bench coordinates
const TEX = 1.28;                      // canvas pixels per bench unit
const TABLE_W = 16, TABLE_H = 10;      // world units
const WAVES = [410, 450, 490, 530, 570, 610, 660];

function waveColor(l) {
  let r = 0, g = 0, b = 0;
  if (l < 440) { r = -(l - 440) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; } else if (l < 510) { g = 1; b = -(l - 510) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; } else if (l < 645) { r = 1; g = -(l - 645) / 65; } else r = 1;
  return [r, g, b];
}
// refractive index per wavelength (dispersion exaggerated so it is easy to see)
const nGlass = (l) => (l ? 1.5 + 0.022 * (1 / (l / 1000) ** 2 - 1 / 0.55 ** 2) * 1.4 : 1.5);
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const isBar = (e) => e.t === 'mirror' || e.t === 'lens';

function makeLevels() {
  return [
    { caption: 'Turn the mirror (drag its round handle). Light leaves at the angle it arrives.',
      els: [
        { t: 'emitter', x: 160, y: 640, a: 0 },
        { t: 'mirror', x: 760, y: 640, a: 0.2, len: 180, rotatable: true },
        { t: 'sensor', x: 760, y: 150, a: Math.PI / 2, len: 90 },
        { t: 'wall', pts: [[880, 260], [1300, 260], [1300, 300], [880, 300]] },
      ] },
    { caption: 'Get around the wall with two mirrors. Drag a mirror to move it, its handle to turn it.',
      els: [
        { t: 'emitter', x: 140, y: 820, a: 0 },
        { t: 'wall', pts: [[700, 260], [760, 260], [760, 1000], [700, 1000]] },
        { t: 'mirror', x: 560, y: 820, a: -0.5, len: 150, rotatable: true, movable: true },
        { t: 'mirror', x: 560, y: 160, a: 0.4, len: 150, rotatable: true, movable: true },
        { t: 'sensor', x: 1330, y: 760, a: 0, len: 100 },
      ] },
    { caption: 'Slide the lens until the rays meet on the little sensor.',
      els: [
        { t: 'emitter', x: 140, y: 520, a: 0, beams: 9, spread: 220 },
        { t: 'lens', x: 520, y: 520, a: 0, len: 300, f: 300, movable: 'x', min: 340, max: 1100 },
        { t: 'sensor', x: 1260, y: 520, a: 0, len: 34, need: 8 },
        { t: 'wall', pts: [[1240, 300], [1270, 300], [1270, 495], [1240, 495]] },
        { t: 'wall', pts: [[1240, 545], [1270, 545], [1270, 740], [1240, 740]] },
      ] },
    { caption: 'Turn the glass block. Light slows down in glass and bends at every surface.',
      els: [
        { t: 'emitter', x: 140, y: 460, a: 0 },
        { t: 'glass', x: 620, y: 470, a: 0, w: 260, h: 320, rotatable: true },
        { t: 'wall', pts: [[1050, 0], [1080, 0], [1080, 540], [1050, 540]] },
        { t: 'wall', pts: [[1050, 600], [1080, 600], [1080, 1000], [1050, 1000]] },
        { t: 'sensor', x: 1400, y: 570, a: 0, len: 80 },
      ] },
    { caption: 'White light is every colour at once. Turn the prism: red to red, blue to blue.',
      els: [
        { t: 'emitter', x: 140, y: 300, a: 0.42 },
        { t: 'prism', x: 640, y: 560, a: 0.3, r: 170, rotatable: true },
        { t: 'sensor', x: 1380, y: 380, a: 0, len: 60, color: 'red' },
        { t: 'sensor', x: 1380, y: 720, a: 0, len: 60, color: 'blue' },
      ],
      placeColourSensors: true },
  ];
}

// ------------------------------------------------------------- the physics
function segmentsOf(e) {
  if (isBar(e) || e.t === 'sensor') {
    const [dx, dy] = rot(0, e.len / 2, e.a);
    return [[[e.x - dx, e.y - dy], [e.x + dx, e.y + dy]]];
  }
  let pts;
  if (e.t === 'wall') pts = e.pts;
  else if (e.t === 'glass') pts = [[-e.w / 2, -e.h / 2], [e.w / 2, -e.h / 2], [e.w / 2, e.h / 2], [-e.w / 2, e.h / 2]].map(([x, y]) => { const [a, b] = rot(x, y, e.a); return [e.x + a, e.y + b]; });
  else if (e.t === 'prism') pts = [0, 1, 2].map((k) => { const ang = e.a + (k * 2 * Math.PI) / 3 - Math.PI / 2; return [e.x + Math.cos(ang) * e.r, e.y + Math.sin(ang) * e.r]; });
  else return [];
  e.poly = pts;
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
}

/** Trace every beam through the bench. Returns the beam paths, sensor hits and whether light got trapped. */
function traceBench(els) {
  const segs = [];
  for (const e of els) for (const s of segmentsOf(e)) segs.push({ s, e });
  const paths = [], hits = new Map();
  let trapped = false;
  const emit = els.find((e) => e.t === 'emitter');
  const n = emit.beams || 1, queue = [];
  for (let i = 0; i < n; i++) {
    const off = n > 1 ? (i / (n - 1) - 0.5) * emit.spread : 0;
    const [ox, oy] = rot(0, off, emit.a);
    queue.push({ x: emit.x + ox + Math.cos(emit.a) * 40, y: emit.y + oy + Math.sin(emit.a) * 40, dx: Math.cos(emit.a), dy: Math.sin(emit.a), l: null, inside: null });
  }
  while (queue.length) {
    const r = queue.pop();
    const path = { pts: [[r.x, r.y]], l: r.l };
    paths.push(path);
    let { x, y, dx, dy, inside } = r;
    for (let b = 0; b < 40; b++) {
      let best = null;
      for (const sg of segs) {
        const [[ax, ay], [bx, by]] = sg.s;
        const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((ax - x) * ey - (ay - y) * ex) / den, u = ((ax - x) * dy - (ay - y) * dx) / den;
        if (t > 0.01 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, sg, ex, ey };
      }
      if (!best) { path.pts.push([x + dx * 3000, y + dy * 3000]); break; }
      x += dx * best.t; y += dy * best.t; path.pts.push([x, y]);
      const e = best.sg.e;
      let nx = -best.ey, ny = best.ex; const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      if (e.t === 'wall' || e.t === 'emitter') break;
      if (e.t === 'sensor') {
        const ok = !e.color || (r.l && ((e.color === 'red' && r.l >= 600) || (e.color === 'blue' && r.l <= 470)));
        if (ok) hits.set(e, (hits.get(e) || 0) + 1);
        break;
      }
      if (e.t === 'mirror') { const d = dx * nx + dy * ny; dx -= 2 * d * nx; dy -= 2 * d * ny; continue; }
      if (e.t === 'lens') {
        // ideal thin lens: bend by the distance from the centre over the focal length
        if (dx * nx + dy * ny < 0) { nx = -nx; ny = -ny; }
        const tx = -ny, ty = nx;
        const h = (x - e.x) * tx + (y - e.y) * ty, dn = dx * nx + dy * ny, dt = dx * tx + dy * ty;
        const slope = dt / dn - h / e.f, nd = Math.hypot(1, slope);
        dx = (nx + tx * slope) / nd; dy = (ny + ty * slope) / nd;
        continue;
      }
      if (e.t === 'glass' || e.t === 'prism') {
        if (e.t === 'prism' && r.l === null && !inside) {
          // white light splits into its colours on entry
          for (const l of WAVES) queue.push({ x: x - dx * 0.02, y: y - dy * 0.02, dx, dy, l, inside: null });
          break;
        }
        const entering = inside !== e;
        if (dx * nx + dy * ny > 0) { nx = -nx; ny = -ny; }
        const nIn = e.t === 'prism' ? nGlass(r.l) : 1.5;
        const eta = entering ? 1 / nIn : nIn, cosi = -(dx * nx + dy * ny), k = 1 - eta * eta * (1 - cosi * cosi);
        if (k < 0) { const d = dx * nx + dy * ny; dx -= 2 * d * nx; dy -= 2 * d * ny; trapped = true; continue; }
        const c2 = Math.sqrt(k);
        dx = eta * dx + (eta * cosi - c2) * nx; dy = eta * dy + (eta * cosi - c2) * ny;
        const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
        inside = entering ? e : null;
      }
    }
  }
  return { paths, hits, trapped };
}

/** Find a prism angle where the spectrum spreads nicely, and put the colour sensors where red and blue land. */
function placeColourSensors(level) {
  const prism = level.els.find((e) => e.t === 'prism'), start = prism.a;
  const sens = level.els.filter((e) => e.t === 'sensor');
  sens.forEach((q) => (q.y = -5000));
  const X = 1380;
  const crossAt = (paths, lam) => {
    const p = paths.find((q) => q.l === lam); if (!p) return null;
    for (let k = 1; k < p.pts.length; k++) {
      const [ax, ay] = p.pts[k - 1], [bx, by] = p.pts[k];
      if (ax < X && bx >= X) return ay + ((by - ay) * (X - ax)) / (bx - ax);
    }
    return null;
  };
  let best = null;
  for (let k = 0; k < 720; k++) {
    const a = (k / 720) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - start), Math.cos(a - start))) < 0.5) continue;
    prism.a = a;
    const { paths } = traceBench(level.els);
    const yr = crossAt(paths, 660), yb = crossAt(paths, 410);
    if (yr === null || yb === null || yr < 140 || yr > 920 || yb < 140 || yb > 920) continue;
    const score = -Math.abs(Math.abs(yb - yr) - 240);
    if (!best || score > best.score) best = { yr, yb, score };
  }
  if (best) { sens[0].y = best.yr; sens[1].y = best.yb; } else { sens[0].y = 380; sens[1].y = 720; }
  prism.a = start;
}

export default (app) => new OpticsRoom(app, {
  id: 'optics', title: 'The Optics Bench', years: '1621 · 1666', music: 'ambient',
  secrets: [
    { id: 'allOptics', title: 'Optician', hint: 'Solve all five optics puzzles.', desc: 'Reflection, focusing, refraction and dispersion: everything a ray tracer needs.' },
    { id: 'tir', title: 'Trapped light', hint: 'Make light bounce off the inside of glass without escaping.', desc: 'Total internal reflection: the reason optical fibres work.' },
  ],
  notes: [
    { title: 'Rule one: reflection', body: [
      'Light hitting a mirror leaves at the same angle it arrived, measured from the surface’s normal (the arrow standing straight out of it):',
      { eq: 'R = D − 2 (D · N) N' },
      'The ray tracer in the next room uses exactly this line for every mirror and metal surface.',
    ] },
    { title: 'Rule two: refraction', body: [
      'Light travels more slowly in glass than in air, so when it crosses the boundary at an angle it bends. How much depends on the refractive index n of each material (Snell’s law, 1621):',
      { eq: 'n₁ · sin θ₁ = n₂ · sin θ₂       (glass n ≈ 1.5)' },
      'Leaving glass at a steep angle there may be no solution at all: the light reflects back inside instead. That is total internal reflection.',
    ] },
    { title: 'Lenses and prisms', body: [
      'A lens is refraction shaped on purpose: it bends rays more the farther they pass from its centre, so parallel rays meet at one point, the focal point. Glass also bends blue slightly more than red, so a prism fans white light into a spectrum, as Newton showed in 1666. Here the spread is exaggerated so it is easy to see.',
    ] },
  ],
});

class OpticsRoom extends Room {
  constructor(app, meta) { super(app, meta); this.kind = 'scene'; }
  get camera() { return this.cam; }

  async load() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x05060b);
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.1, 200);

    // the lab table: a dark slab whose top is the live bench drawing
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(VW * TEX); this.canvas.height = Math.round(VH * TEX);
    this.ctx = this.canvas.getContext('2d');
    this.tex = canvasTexture(this.canvas, { mipmaps: true, anisotropy: 8 });
    this.top = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W, TABLE_H), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.top.rotation.x = -Math.PI / 2;
    this.top.userData.surface = { uvToCanvas: (uv) => ({ x: uv.x * VW, y: (1 - uv.y) * VH, inside: uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1 }) };
    s.add(this.top);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W + 0.5, 0.5, TABLE_H + 0.5), new THREE.MeshStandardMaterial({ color: 0x15161d, roughness: 0.5, metalness: 0.4 }));
    slab.position.y = -0.26; s.add(slab);
    s.add(new THREE.HemisphereLight(0x8090c0, 0x050508, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-6, 10, 6); s.add(key);

    // light spilling off the table where beams leave it
    this.spill = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe7b8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.spill.scale.setScalar(3); s.add(this.spill);

    // dust in the air
    const rnd = seeded(15), n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(rnd() - 0.5) * 30, rnd() * 10 - 1, (rnd() - 0.5) * 24], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8890b0, size: 0.04, transparent: true, opacity: 0.5 }));
    s.add(this.dust);
    this.corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => new THREE.Vector3((x * TABLE_W) / 2, 0, (z * TABLE_H) / 2));
    this.solved = new Set(this.app.state.stats.opticsSolved || []);
  }

  enter(scope) {
    this.scope = scope;
    this.tilt = 0; this.time = 0;
    const tray = this.app.chrome.tray(scope, 'Bench');
    this.readout = tray.readout();
    tray.button('Reset this puzzle', () => this.loadLevel(this.level));
    tray.note('Scroll over a piece to fine-tune its angle.');
    this.frame();
    scope.listen(window, 'resize', () => this.frame());

    const levels = makeLevels();
    this.tour = this.startTour(scope, levels.map((L, i) => ({
      caption: `${i + 1} of ${levels.length}. ${L.caption}`,
      enter: () => this.loadLevel(i),
    })));
  }

  frame() { this.view = fitCamera(this.cam, this.corners, new THREE.Vector3(0, -1.25, -1), { trayOpen: true, margin: 1.06 }); }

  loadLevel(i) {
    this.level = i;
    this.L = makeLevels()[i];
    if (this.L.placeColourSensors) placeColourSensors(this.L);
    this.won = false; this.wonT = 0; this.drag = null;
    this.paths = []; this.hits = new Map();
  }

  // ------------------------------------------------------------ input
  handleOf(e) {
    const r = (e.len || (e.w ? Math.max(e.w, e.h) : e.r * 1.6)) / 2 + 46;
    const [hx, hy] = rot(r, 0, e.a + (isBar(e) ? Math.PI / 2 : 0));
    return [e.x + hx, e.y + hy];
  }

  pointer(e) {
    if (!this.L) return;
    if (e.type === 'wheel') {
      if (this.hoverEl?.rotatable) { this.hoverEl.a += Math.sign(e.deltaY) * 0.01; this.app.audio.detent(); }
      return;
    }
    if (!e.surface) { if (e.type === 'up') this.drag = null; this.hoverEl = null; return; }
    const x = e.sx, y = e.sy;
    if (e.type === 'down') {
      this.drag = null;
      for (const el of this.L.els) {
        if (!el.rotatable) continue;
        const [hx, hy] = this.handleOf(el);
        if (Math.hypot(x - hx, y - hy) < 40) { this.drag = { e: el, mode: 'rot' }; break; }
      }
      if (!this.drag) for (const el of this.L.els) {
        if (el.movable && Math.hypot(x - el.x, y - el.y) < Math.max(70, (el.len || 0) / 2)) { this.drag = { e: el, mode: 'move', ox: x - el.x, oy: y - el.y }; break; }
      }
      if (this.drag) this.app.audio.button();
    }
    if (e.type === 'move') {
      this.hoverEl = this.L.els.find((el) => (el.rotatable || el.movable) && Math.hypot(x - el.x, y - el.y) < 140);
      const d = this.drag;
      if (d && e.buttons) {
        const el = d.e;
        if (d.mode === 'rot') el.a = Math.atan2(y - el.y, x - el.x) - (isBar(el) ? Math.PI / 2 : 0);
        else {
          if (el.movable !== 'y') el.x = Math.max(el.min ?? 60, Math.min(el.max ?? VW - 60, x - d.ox));
          if (el.movable !== 'x') el.y = Math.max(60, Math.min(VH - 60, y - d.oy));
        }
        if ((this._tick = (this._tick || 0) + 1) % 4 === 0) this.app.audio.tone(900 + el.a * 80, 0.02, { wave: 'sine', vel: 0.02 });
      }
    }
    if (e.type === 'up') this.drag = null;
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    this.time += dt;
    if (!this.L) return;
    const app = this.app, { paths, hits, trapped } = traceBench(this.L.els);
    this.paths = paths; this.hits = hits;
    // only counts when the visitor made it happen
    if (trapped && this.drag) app.secret('tir', 'Trapped light', 'Total internal reflection: light that cannot escape glass. Optical fibres work this way.');
    const sensors = this.L.els.filter((e) => e.t === 'sensor');
    const ok = sensors.every((s) => (hits.get(s) || 0) >= (s.need || 1));
    if (ok && !this.won) this.onSolved();
    if (!ok) this.won = false;
    this.wonT += dt;
    this.readout.textContent = `${sensors.map((s) => `${s.color ? `${s.color} sensor` : 'sensor'}  ${(hits.get(s) || 0) >= (s.need || 1) ? 'lit ✓' : 'dark'}`).join('\n')}\nsolved ${this.solved.size} of 5`;

    // a little life in the camera
    const v = this.view;
    this.cam.position.copy(v.position).add(new THREE.Vector3(Math.sin(this.time * 0.13) * 0.25, Math.sin(this.time * 0.17) * 0.12, 0));
    this.cam.lookAt(v.look);
    this.dust.rotation.y += dt * 0.01;

    // where a beam runs off the table, light the air there
    let spill = null;
    for (const p of paths) {
      const [x, y] = p.pts[p.pts.length - 1];
      if (x < -50 || x > VW + 50 || y < -50 || y > VH + 50) {
        const [ax, ay] = p.pts[p.pts.length - 2];
        const len = Math.hypot(x - ax, y - ay), t = edgeT(ax, ay, (x - ax) / len, (y - ay) / len);
        spill = [ax + ((x - ax) / len) * t, ay + ((y - ay) / len) * t];
      }
    }
    this.spill.material.opacity = damp(this.spill.material.opacity, spill ? 0.5 : 0, 6, dt);
    if (spill) this.spill.position.set((spill[0] / VW - 0.5) * TABLE_W, 0.2, (spill[1] / VH - 0.5) * TABLE_H);
    this.draw();
  }

  onSolved() {
    const app = this.app;
    this.won = true; this.wonT = 0;
    app.audio.chime([69, 73, 76, 81, 85], 'triangle', 0.09);
    this.solved.add(this.level);
    app.state.stats.opticsSolved = [...this.solved];
    app.state.record('optics', this.solved.size);
    if (this.solved.size >= 5) app.secret('allOptics', 'Optician', 'Reflection, focusing, refraction and dispersion: everything a ray tracer needs.');
    // move on to the next puzzle after a moment to enjoy it
    const level = this.level;
    this.scope.wait(2.2).then((ok) => { if (ok && this.level === level && this.won && level < 4) this.tour.go(level + 1); });
  }

  draw() {
    const x = this.ctx, t = this.time;
    x.setTransform(TEX, 0, 0, TEX, 0, 0);
    // the bench surface, a breadboard of threaded holes
    x.fillStyle = '#0d0f16'; x.fillRect(0, 0, VW, VH);
    x.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 25; i < VW; i += 50) for (let j = 25; j < VH; j += 50) { x.beginPath(); x.arc(i, j, 3, 0, 7); x.fill(); }
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 3; x.strokeRect(6, 6, VW - 12, VH - 12);

    // beams
    x.globalCompositeOperation = 'lighter'; x.lineCap = 'round'; x.lineJoin = 'round';
    for (const p of this.paths) {
      const col = p.l ? waveColor(p.l) : [1, 0.97, 0.9];
      const rgb = (a) => `rgba(${Math.round(col[0] * 255)},${Math.round(col[1] * 255)},${Math.round(col[2] * 255)},${a})`;
      for (const [w, a] of [[26, 0.05], [11, 0.12], [4, 0.9]]) {
        x.strokeStyle = rgb(p.l ? a * 0.8 : a); x.lineWidth = w; x.beginPath();
        p.pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
      }
    }
    // photons travelling along each path
    x.fillStyle = 'rgba(255,255,255,0.9)';
    for (const p of this.paths) {
      const seg = []; let total = 0;
      for (let i = 1; i < p.pts.length; i++) { const l = Math.min(2000, Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1])); seg.push(l); total += l; }
      for (let k = 0; k < 3; k++) {
        let d = (t * 420 + k * 260) % Math.max(total, 1), i = 0;
        while (i < seg.length && d > seg[i]) { d -= seg[i]; i++; }
        if (i >= seg.length) continue;
        const [ax, ay] = p.pts[i], [bx, by] = p.pts[i + 1], f = d / Math.max(seg[i], 1e-6);
        x.beginPath(); x.arc(ax + (bx - ax) * f, ay + (by - ay) * f, 5, 0, 7); x.fill();
      }
    }
    x.globalCompositeOperation = 'source-over';

    for (const e of this.L.els) this.drawElement(x, e);
    if (this.won) {
      x.fillStyle = `rgba(255,255,255,${Math.min(1, this.wonT * 2)})`; x.font = '72px "Instrument Serif", Georgia, serif';
      x.fillText(this.level < 4 ? 'Solved.' : 'Every colour in its place.', 50, VH - 50);
    }
    this.tex.needsUpdate = true;
  }

  drawElement(x, e) {
    x.save();
    if (e.t === 'wall') {
      x.fillStyle = '#1b1d27'; x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 2;
      x.beginPath(); e.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); x.stroke();
    } else if (e.t === 'emitter') {
      x.translate(e.x, e.y); x.rotate(e.a);
      const hw = e.beams ? e.spread / 2 + 16 : 22;
      x.fillStyle = '#23263a'; x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2;
      x.beginPath(); x.roundRect(-50, -hw, 90, hw * 2, 10); x.fill(); x.stroke();
      x.fillStyle = '#ffe7b8'; x.fillRect(36, -hw + 8, 6, hw * 2 - 16);
    } else if (e.t === 'mirror') {
      x.translate(e.x, e.y); x.rotate(e.a);
      x.fillStyle = 'rgba(200,215,235,0.9)'; x.fillRect(-4, -e.len / 2, 8, e.len);
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(-4, -e.len / 2); x.lineTo(-4, e.len / 2); x.stroke();
    } else if (e.t === 'lens') {
      x.translate(e.x, e.y); x.rotate(e.a);
      const hh = e.len / 2, bulge = 34;
      x.fillStyle = 'rgba(160,220,255,0.15)'; x.strokeStyle = 'rgba(190,230,255,0.85)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(0, -hh); x.quadraticCurveTo(bulge, 0, 0, hh); x.quadraticCurveTo(-bulge, 0, 0, -hh); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,231,184,0.8)';
      for (const s of [-1, 1]) { x.beginPath(); x.arc(s * e.f, 0, 6, 0, 7); x.fill(); }
      x.rotate(-e.a); x.strokeStyle = 'rgba(255,255,255,0.15)'; x.setLineDash([6, 8]);
      x.beginPath(); x.moveTo((e.min ?? 0) - e.x, hh + 30); x.lineTo((e.max ?? VW) - e.x, hh + 30); x.stroke(); x.setLineDash([]);
    } else if (e.t === 'glass' || e.t === 'prism') {
      x.fillStyle = 'rgba(170,220,255,0.12)'; x.strokeStyle = 'rgba(200,235,255,0.75)'; x.lineWidth = 2;
      x.beginPath(); e.poly.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); x.stroke();
    } else if (e.t === 'sensor') {
      const lit = (this.hits.get(e) || 0) >= (e.need || 1);
      x.translate(e.x, e.y); x.rotate(e.a);
      const col = e.color === 'red' ? '255,90,80' : e.color === 'blue' ? '90,140,255' : '125,255,176';
      x.fillStyle = '#12141c'; x.strokeStyle = `rgba(${col},${lit ? 1 : 0.6})`; x.lineWidth = 3;
      x.beginPath(); x.roundRect(-8, -e.len / 2 - 8, 30, e.len + 16, 6); x.fill(); x.stroke();
      if (lit) { x.shadowColor = `rgb(${col})`; x.shadowBlur = 30; }
      x.fillStyle = `rgba(${col},${lit ? 1 : 0.25})`; x.fillRect(-6, -e.len / 2, 6, e.len);
    }
    x.restore();
    const active = this.drag?.e === e, hover = this.hoverEl === e;
    if (e.rotatable) {
      const [hx, hy] = this.handleOf(e);
      x.strokeStyle = 'rgba(255,255,255,0.3)'; x.setLineDash([3, 5]); x.lineWidth = 2;
      x.beginPath(); x.moveTo(e.x, e.y); x.lineTo(hx, hy); x.stroke(); x.setLineDash([]);
      const pulse = this.solved.size === 0 && !this.drag ? 4 + Math.sin(this.time * 4) * 3 : 0;
      x.fillStyle = active ? '#fff' : 'rgba(255,231,184,0.95)';
      x.beginPath(); x.arc(hx, hy, (hover ? 17 : 15) + pulse * 0.5, 0, 7); x.fill();
      if (pulse) { x.strokeStyle = `rgba(255,231,184,${0.5 - pulse * 0.05})`; x.beginPath(); x.arc(hx, hy, 22 + pulse * 2, 0, 7); x.stroke(); }
    }
    if (e.movable) {
      x.strokeStyle = active || hover ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)'; x.lineWidth = 3;
      const yy = e.y + (e.len || 80) / 2 + 58, xx = e.x;
      x.beginPath(); x.moveTo(xx - 22, yy); x.lineTo(xx + 22, yy);
      x.moveTo(xx - 14, yy - 8); x.lineTo(xx - 22, yy); x.lineTo(xx - 14, yy + 8);
      x.moveTo(xx + 14, yy - 8); x.lineTo(xx + 22, yy); x.lineTo(xx + 14, yy + 8); x.stroke();
    }
  }

  pickables() { return this.top ? [this.top] : []; }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }
}

/** Distance along a ray from inside the bench to its border. */
function edgeT(x, y, dx, dy) {
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (VW - x) / dx); else if (dx < 0) t = Math.min(t, -x / dx);
  if (dy > 0) t = Math.min(t, (VH - y) / dy); else if (dy < 0) t = Math.min(t, -y / dy);
  return t;
}
