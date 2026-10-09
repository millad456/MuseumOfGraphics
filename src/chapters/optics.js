import * as THREE from 'three';
import { makeStars } from '../gfx/lab.js';

// ROOM 15 — The optics bench. Small puzzles with mirrors, a lens, a glass
// block and a prism. The beams obey the same two rules a ray tracer uses:
// reflection (angle in = angle out) and refraction (Snell's law).

const VW = 1600, VH = 1000;
const WAVES = [410, 450, 490, 530, 570, 610, 660];
function waveColor(l) {
  let r = 0, g = 0, b = 0;
  if (l < 440) { r = -(l - 440) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; } else if (l < 510) { g = 1; b = -(l - 510) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; } else if (l < 645) { r = 1; g = -(l - 645) / 65; } else r = 1;
  return [r, g, b];
}
const nGlass = (l) => (l ? 1.5 + 0.022 * (1 / ((l / 1000) ** 2) - 1 / 0.55 ** 2) * 1.4 : 1.5);

const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function LEVELS() {
  return [
    {
      title: 'Angle in, angle out', hint: 'Drag the round handle to turn the mirror. Light leaves a mirror at the same angle it arrived.',
      els: [
        { t: 'emitter', x: 160, y: 640, a: 0 },
        { t: 'mirror', x: 760, y: 640, a: 0.2, len: 180, rotatable: true },
        { t: 'sensor', x: 760, y: 150, a: Math.PI / 2, len: 90 },
        { t: 'wall', pts: [[420, 360], [1000, 360], [1000, 400], [420, 400]], hole: false },
      ],
      fix(L) { L.els[3].pts = [[880, 260], [1300, 260], [1300, 300], [880, 300]]; },
    },
    {
      title: 'Around the wall', hint: 'Two mirrors. Drag a mirror to move it, drag its handle to turn it.',
      els: [
        { t: 'emitter', x: 140, y: 820, a: 0 },
        { t: 'wall', pts: [[700, 260], [760, 260], [760, 1000], [700, 1000]] },
        { t: 'mirror', x: 560, y: 820, a: -0.5, len: 150, rotatable: true, movable: true },
        { t: 'mirror', x: 560, y: 160, a: 0.4, len: 150, rotatable: true, movable: true },
        { t: 'sensor', x: 1330, y: 760, a: 0, len: 100 },
      ],
    },
    {
      title: 'Bring it to a point', hint: 'Slide the lens along its rail until its focal point lands on the small sensor. It needs at least 8 of the 9 rays.',
      els: [
        { t: 'emitter', x: 140, y: 520, a: 0, beams: 9, spread: 220 },
        { t: 'lens', x: 520, y: 520, a: 0, len: 300, f: 300, movable: 'x', min: 340, max: 1100 },
        { t: 'sensor', x: 1260, y: 520, a: 0, len: 34, need: 8 },
        { t: 'wall', pts: [[1240, 300], [1270, 300], [1270, 495], [1240, 495]] },
        { t: 'wall', pts: [[1240, 545], [1270, 545], [1270, 740], [1240, 740]] },
      ],
    },
    {
      title: 'Bend, don\'t break', hint: 'Turn the glass block. Light slows down inside glass and changes direction at each surface.',
      els: [
        { t: 'emitter', x: 140, y: 460, a: 0 },
        { t: 'glass', x: 620, y: 470, a: 0.0, w: 260, h: 320, rotatable: true },
        { t: 'wall', pts: [[1050, 0], [1080, 0], [1080, 540], [1050, 540]] },
        { t: 'wall', pts: [[1050, 600], [1080, 600], [1080, 1000], [1050, 1000]] },
        { t: 'sensor', x: 1400, y: 570, a: 0, len: 80 },
      ],
    },
    {
      title: 'Unweave the rainbow', hint: 'White light is every colour at once. Turn the prism so red reaches the red sensor and blue reaches the blue one.',
      els: [
        { t: 'emitter', x: 140, y: 300, a: 0.42 },
        { t: 'prism', x: 640, y: 560, a: 0.3, r: 170, rotatable: true },
        { t: 'sensor', x: 1380, y: 380, a: 0, len: 60, color: 'red' },
        { t: 'sensor', x: 1380, y: 720, a: 0, len: 60, color: 'blue' },
      ],
      solveA: 1.05,
    },
  ];
}

export default {
  id: 'optics', title: 'The Optics Bench', year: '1621 · 1666 · today', tagline: 'Before simulating light, we should play with it. Mirrors, a lens and a prism, obeying two simple rules.',
  mode: 'world', ui: 'glass20', music: 'ambient',
  secrets: [
    { id: 'allOptics', title: 'Optician', hint: 'Solve all five optics puzzles.', desc: 'Reflection, focusing, refraction and dispersion: everything a ray tracer needs.' },
    { id: 'tir', title: 'Trapped light', hint: 'Make light bounce off the inside of glass without escaping.', desc: 'Total internal reflection: the reason optical fibres work.' },
  ],
  notes: [
    {
      title: 'Rule one: reflection', meta: 'Mirrors',
      body: `<p>Light hitting a mirror leaves at the same angle it arrived, measured from the surface normal. In vector form, with the normal <b>N</b> from the lighting room:</p><div class="eq">R = D − 2 (D · N) N</div><p>The ray tracer in the next room uses exactly this line for every metal and mirror surface.</p>`,
    },
    {
      title: 'Rule two: refraction', meta: "Snell's law, 1621",
      body: `<p>Light travels more slowly in glass than in air, so when it crosses the boundary at an angle it bends. The amount depends on the <b>refractive index</b> n of each material:</p><div class="eq">n₁ · sin θ₁ = n₂ · sin θ₂       (glass n ≈ 1.5)</div><p>Going from glass back out into air at a steep angle, there may be no solution at all: the light reflects back inside instead. That is total internal reflection.</p>`,
    },
    {
      title: 'Lenses', meta: 'Focus',
      body: `<p>A lens is refraction shaped on purpose. A convex lens bends rays more the farther they pass from its centre, so parallel rays meet at one point, the <b>focal point</b>. Cameras, eyes and projectors all depend on it. Ray tracers simulate the same thing to produce depth of field.</p>`,
    },
    {
      title: 'Dispersion', meta: '1666',
      body: `<p>The refractive index of glass is slightly different for each colour: blue bends more than red. So a prism fans white light into a spectrum, as Newton showed in 1666. In the simulation, white light splits into seven wavelengths the moment it enters the prism; the dispersion is exaggerated so it is easy to see.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x05060b);
    this.scene.add(makeStars(1500, 60, 0x8890b0));
    this.cam3 = new THREE.PerspectiveCamera(60, 1, 0.1, 200); this.cam3.position.set(0, 8, 30); this.cam3.lookAt(0, 6, 0);
    this.cv = document.createElement('canvas'); this.cv.className = 'overlay-canvas';
    this.cv.style.opacity = 0; this.cv.style.transition = 'opacity .9s';
    document.getElementById('ui').insertBefore(this.cv, document.getElementById('ui').firstChild);
    this.level = 0; this.solved = new Set(this.app.state.stats.opticsSolved || []);
    this.load(0);
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  setAspect(a) {
    this.cam3.aspect = a; this.cam3.updateProjectionMatrix();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.cv.width = Math.floor(window.innerWidth * dpr); this.cv.height = Math.floor(window.innerHeight * dpr);
    // fit the virtual bench between the windows
    const narrow = window.innerWidth < 760;
    const L = narrow ? 8 : 280, R = narrow ? 8 : 300, T = 60, B = narrow ? window.innerHeight * 0.42 : 70;
    const s = Math.min((window.innerWidth - L - R) / VW, (window.innerHeight - T - B) / VH);
    this.view = { s: s * dpr, ox: (L + (window.innerWidth - L - R - VW * s) / 2) * dpr, oy: (T + (window.innerHeight - T - B - VH * s) / 2) * dpr, dpr };
  },

  load(i) {
    this.level = i;
    const L = LEVELS()[i]; L.fix?.(L);
    this.L = L; this.won = false; this.wonT = 0;
    if (L.solveA !== undefined) {
      // find an angle where the spectrum leaves to the right and spreads well,
      // then place the colour sensors exactly where red and blue land
      const prism = L.els.find((e) => e.t === 'prism'), start = prism.a;
      const sens = L.els.filter((e) => e.t === 'sensor');
      sens.forEach((q) => (q.y = -5000));
      const X = 1380;
      const at = (paths, lam) => { const p = paths.find((q) => q.l === lam); if (!p) return null; for (let k = 1; k < p.pts.length; k++) { const [ax, ay] = p.pts[k - 1], [bx, by] = p.pts[k]; if (ax < X && bx >= X) return ay + (by - ay) * (X - ax) / (bx - ax); } return null; };
      let best = null;
      for (let k = 0; k < 720; k++) {
        const a = (k / 720) * Math.PI * 2;
        if (Math.abs(Math.atan2(Math.sin(a - start), Math.cos(a - start))) < 0.5) continue;
        prism.a = a;
        const { paths } = this.trace();
        const yr = at(paths, 660), yb = at(paths, 410);
        if (yr === null || yb === null || yr < 140 || yr > 920 || yb < 140 || yb > 920) continue;
        const spread = Math.abs(yb - yr);
        const score = -Math.abs(spread - 240);
        if (!best || score > best.score) best = { a, yr, yb, spread, score };
      }
      if (best) { sens[0].y = best.yr; sens[1].y = best.yb; L.solveA = best.a; }
      else { sens[0].y = 380; sens[1].y = 720; }
      prism.a = start;
    }
  },

  enter(app) {
    this.cv.style.opacity = 1;
    this.buildControls();
    app.ui.showChrome(true);
    if (this.solved.size) app.ready(true);
  },
  exit() { this.cv.style.opacity = 0; },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Bench');
    this.lvlSeg = ui.segmented('Puzzle', LEVELS().map((l, i) => ({ v: i, l: (this.solved.has(i) ? '✓ ' : '') + (i + 1) })), this.level, (v) => this.load(v));
    this.read = ui.readout();
    const r = ui.row();
    this.nextBtn = ui.button('Next puzzle →', () => { if (this.level < 4) { this.load(this.level + 1); this.lvlSeg.set(this.level); } }, r);
    ui.button('Reset', () => this.load(this.level), r);
    ui.hint('Scroll over a rotatable piece to fine-tune its angle.');
  },

  // ---------------------------------------------------------- geometry
  segmentsOf(e) {
    if (e.t === 'mirror' || e.t === 'lens' || e.t === 'sensor') {
      const [dx, dy] = rot(0, e.len / 2, e.a);
      return [[[e.x - dx, e.y - dy], [e.x + dx, e.y + dy]]];
    }
    let pts;
    if (e.t === 'wall') pts = e.pts;
    else if (e.t === 'glass') pts = [[-e.w / 2, -e.h / 2], [e.w / 2, -e.h / 2], [e.w / 2, e.h / 2], [-e.w / 2, e.h / 2]].map(([x, y]) => { const [a, b] = rot(x, y, e.a); return [e.x + a, e.y + b]; });
    else if (e.t === 'prism') pts = [0, 1, 2].map((k) => { const ang = e.a + (k * 2 * Math.PI) / 3 - Math.PI / 2; return [e.x + Math.cos(ang) * e.r, e.y + Math.sin(ang) * e.r]; });
    else return [];
    e._poly = pts;
    return pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
  },

  trace() {
    const els = this.L.els, segs = [];
    els.forEach((e) => this.segmentsOf(e).forEach((s) => segs.push({ s, e })));
    const paths = [];
    const hits = new Map();
    this.sawTIR = false;
    const emit = els.find((e) => e.t === 'emitter');
    const n = emit.beams || 1;
    const queue = [];
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * emit.spread : 0;
      const [ox, oy] = rot(0, off, emit.a);
      queue.push({ x: emit.x + ox + Math.cos(emit.a) * 40, y: emit.y + oy + Math.sin(emit.a) * 40, dx: Math.cos(emit.a), dy: Math.sin(emit.a), l: null, inside: null, depth: 0 });
    }
    while (queue.length) {
      const r = queue.pop();
      const path = { pts: [[r.x, r.y]], l: r.l };
      paths.push(path);
      let { x, y, dx, dy } = r; let inside = r.inside;
      for (let b = 0; b < 40; b++) {
        let best = null;
        for (const sg of segs) {
          const [[ax, ay], [bx, by]] = sg.s;
          const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((ax - x) * ey - (ay - y) * ex) / den, u = ((ax - x) * dy - (ay - y) * dx) / den;
          if (t > 0.01 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, u, sg, ex, ey };
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
          // ideal thin lens: deflect by the offset from the centre over the focal length
          if (dx * nx + dy * ny < 0) { nx = -nx; ny = -ny; }
          const tx = -ny, ty = nx;
          const h = (x - e.x) * tx + (y - e.y) * ty;
          const dn = dx * nx + dy * ny, dt = dx * tx + dy * ty;
          const slope = dt / dn - h / e.f;
          const nd = Math.hypot(1, slope); dx = (nx + tx * slope) / nd; dy = (ny + ty * slope) / nd;
          continue;
        }
        if (e.t === 'glass' || e.t === 'prism') {
          if (e.t === 'prism' && r.l === null && !inside) {
            // white light splits into wavelengths on entry
            for (const l of WAVES) queue.push({ x: x - dx * 0.02, y: y - dy * 0.02, dx, dy, l, inside: null, depth: r.depth + 1 });
            path.pts.pop(); path.pts.push([x, y]);
            break;
          }
          const entering = inside !== e;
          if (dx * nx + dy * ny > 0) { nx = -nx; ny = -ny; } // normal against the ray
          const n1 = entering ? 1 : (e.t === 'prism' ? nGlass(r.l) : 1.5), n2 = entering ? (e.t === 'prism' ? nGlass(r.l) : 1.5) : 1;
          const eta = n1 / n2, cosi = -(dx * nx + dy * ny), k = 1 - eta * eta * (1 - cosi * cosi);
          if (k < 0) { const d = dx * nx + dy * ny; dx -= 2 * d * nx; dy -= 2 * d * ny; this.sawTIR = true; continue; }
          const c2 = Math.sqrt(k);
          dx = eta * dx + (eta * cosi - c2) * nx; dy = eta * dy + (eta * cosi - c2) * ny;
          const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
          inside = entering ? e : null;
          continue;
        }
      }
    }
    return { paths, hits };
  },

  // ---------------------------------------------------------- input
  toV(p) { const v = this.view; return [(p.x * v.dpr - v.ox) / v.s, (p.y * v.dpr - v.oy) / v.s]; },
  handleOf(e) { const r = (e.len || (e.w ? Math.max(e.w, e.h) : e.r * 1.6)) / 2 + 46; const [hx, hy] = rot(r, 0, e.a + (e.t === 'mirror' || e.t === 'lens' ? Math.PI / 2 : 0)); return [e.x + hx, e.y + hy]; },

  pointer(type, p, ev) {
    const [x, y] = this.toV(p);
    if (type === 'down') {
      this.drag = null;
      for (const e of this.L.els) {
        if (e.rotatable) { const [hx, hy] = this.handleOf(e); if (Math.hypot(x - hx, y - hy) < 34) { this.drag = { e, mode: 'rot' }; return; } }
      }
      for (const e of this.L.els) {
        if (e.movable && Math.hypot(x - e.x, y - e.y) < Math.max(70, (e.len || 0) / 2)) { this.drag = { e, mode: 'move', ox: x - e.x, oy: y - e.y }; return; }
      }
    }
    if (type === 'move') {
      this.hoverEl = this.L.els.find((e) => (e.rotatable || e.movable) && Math.hypot(x - e.x, y - e.y) < 120);
      if (this.drag && ev.buttons) {
        const { e } = this.drag;
        if (this.drag.mode === 'rot') { e.a = Math.atan2(y - e.y, x - e.x) - (e.t === 'mirror' || e.t === 'lens' ? Math.PI / 2 : 0); }
        else {
          if (e.movable !== 'y') e.x = Math.max(e.min ?? 60, Math.min(e.max ?? VW - 60, x - this.drag.ox));
          if (e.movable !== 'x') e.y = Math.max(60, Math.min(VH - 60, y - this.drag.oy));
        }
        if ((this._tick = (this._tick || 0) + 1) % 4 === 0) this.app.audio.tone(900 + e.a * 80, 0.02, { wave: 'sine', vel: 0.02 });
      }
    }
    if (type === 'up') this.drag = null;
    if (type === 'wheel' && this.hoverEl?.rotatable) this.hoverEl.a += Math.sign(ev.deltaY) * 0.01;
  },

  update(dt, t, app) {
    const { paths, hits } = this.trace();
    this.paths = paths; this.hits = hits;
    if (this.sawTIR) app.secret('tir', 'Trapped light', 'Total internal reflection: light that cannot escape glass. Optical fibres work this way.');
    const sensors = this.L.els.filter((e) => e.t === 'sensor');
    const ok = sensors.every((s) => (hits.get(s) || 0) >= (s.need || 1));
    if (ok && !this.won) {
      this.won = true; this.wonT = 0;
      app.audio.chime([69, 73, 76, 81, 85], 'fm', 0.09);
      this.solved.add(this.level);
      app.state.stats.opticsSolved = [...this.solved]; app.state.stat('optics', this.solved.size);
      this.lvlSeg?.set(this.level);
      app.ready(true);
      if (this.solved.size >= 5) app.secret('allOptics', 'Optician', 'Reflection, focusing, refraction and dispersion: everything a ray tracer needs.');
      this.buildControls(); this.lvlSeg.set(this.level);
    }
    if (!ok && this.won) this.won = false;
    this.wonT += dt;
    this.t = t;
    if (this.read) this.read.textContent = sensors.map((s, i) => `sensor ${i + 1}${s.color ? ' (' + s.color + ')' : ''}: ${hits.get(s) || 0}/${s.need || 1} ${(hits.get(s) || 0) >= (s.need || 1) ? '✓' : ''}`).join('\n') + `\nsolved ${this.solved.size} of 5`;
    this.draw();
  },

  draw() {
    const c = this.cv, x = c.getContext('2d'), v = this.view, t = this.t;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
    x.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);
    // bench surface
    x.fillStyle = 'rgba(255,255,255,0.025)'; x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 1 / v.s;
    x.beginPath(); x.roundRect(0, 0, VW, VH, 28); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let i = 50; i < VW; i += 50) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, VH); x.stroke(); }
    for (let j = 50; j < VH; j += 50) { x.beginPath(); x.moveTo(0, j); x.lineTo(VW, j); x.stroke(); }
    // title
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = '44px "Instrument Serif", Georgia, serif';
    x.fillText(`${this.level + 1}. ${this.L.title}`, 40, 70);
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '20px Geist, sans-serif';
    x.fillText(this.L.hint, 40, 104);

    // beams
    x.globalCompositeOperation = 'lighter'; x.lineCap = 'round'; x.lineJoin = 'round';
    for (const p of this.paths) {
      const col = p.l ? waveColor(p.l) : [1, 0.97, 0.9];
      const rgb = (a) => `rgba(${Math.round(col[0] * 255)},${Math.round(col[1] * 255)},${Math.round(col[2] * 255)},${a})`;
      for (const [w, a] of [[16, 0.05], [7, 0.12], [2.2, 0.85]]) {
        x.strokeStyle = rgb(p.l ? a * 0.8 : a); x.lineWidth = w; x.beginPath();
        p.pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
      }
    }
    // travelling photons along each path
    for (const p of this.paths) {
      let total = 0; const seg = [];
      for (let i = 1; i < p.pts.length; i++) { const l = Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]); seg.push(l); total += Math.min(l, 2000); }
      for (let k = 0; k < 3; k++) {
        let d = ((t * 420 + k * 260) % Math.max(total, 1)); let i = 0;
        while (i < seg.length && d > Math.min(seg[i], 2000)) { d -= Math.min(seg[i], 2000); i++; }
        if (i >= seg.length) continue;
        const [ax, ay] = p.pts[i], [bx, by] = p.pts[i + 1], f = d / seg[i];
        x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(ax + (bx - ax) * f, ay + (by - ay) * f, 3.5, 0, 7); x.fill();
      }
    }
    x.globalCompositeOperation = 'source-over';

    // elements
    for (const e of this.L.els) {
      x.save();
      if (e.t === 'wall') {
        x.fillStyle = '#16171f'; x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 2;
        x.beginPath(); e.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); x.stroke();
      } else if (e.t === 'emitter') {
        x.translate(e.x, e.y); x.rotate(e.a);
        const hw = e.beams ? e.spread / 2 + 16 : 22;
        x.fillStyle = '#1d2030'; x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2;
        x.beginPath(); x.roundRect(-50, -hw, 90, hw * 2, 10); x.fill(); x.stroke();
        x.fillStyle = '#ffe7b8'; x.fillRect(36, -hw + 8, 6, hw * 2 - 16);
      } else if (e.t === 'mirror') {
        x.translate(e.x, e.y); x.rotate(e.a);
        x.fillStyle = 'rgba(200,215,235,0.9)'; x.fillRect(-4, -e.len / 2, 8, e.len);
        x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-4, -e.len / 2); x.lineTo(-4, e.len / 2); x.stroke();
      } else if (e.t === 'lens') {
        x.translate(e.x, e.y); x.rotate(e.a);
        const h = e.len / 2, bulge = 34;
        x.fillStyle = 'rgba(160,220,255,0.15)'; x.strokeStyle = 'rgba(190,230,255,0.85)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(0, -h); x.quadraticCurveTo(bulge, 0, 0, h); x.quadraticCurveTo(-bulge, 0, 0, -h); x.fill(); x.stroke();
        // focal points
        x.fillStyle = 'rgba(255,231,184,0.8)';
        for (const s of [-1, 1]) { x.beginPath(); x.arc(s * e.f, 0, 5, 0, 7); x.fill(); }
        x.font = '18px Geist'; x.fillText('F', e.f - 5, -14); x.fillText('F', -e.f - 5, -14);
        // rail
        x.rotate(-e.a); x.strokeStyle = 'rgba(255,255,255,0.12)'; x.setLineDash([6, 8]); x.beginPath(); x.moveTo((e.min ?? 0) - e.x, h + 30); x.lineTo((e.max ?? VW) - e.x, h + 30); x.stroke(); x.setLineDash([]);
      } else if (e.t === 'glass' || e.t === 'prism') {
        x.fillStyle = 'rgba(170,220,255,0.12)'; x.strokeStyle = 'rgba(200,235,255,0.75)'; x.lineWidth = 2;
        x.beginPath(); e._poly.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); x.stroke();
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
      if (e.rotatable) {
        const [hx, hy] = this.handleOf(e);
        x.strokeStyle = 'rgba(255,255,255,0.25)'; x.setLineDash([3, 5]); x.beginPath(); x.moveTo(e.x, e.y); x.lineTo(hx, hy); x.stroke(); x.setLineDash([]);
        x.fillStyle = this.drag?.e === e ? '#fff' : 'rgba(255,231,184,0.9)'; x.beginPath(); x.arc(hx, hy, 13, 0, 7); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2; x.beginPath(); x.arc(hx, hy, 6, -1, 2); x.stroke();
      }
      if (e.movable) { x.fillStyle = 'rgba(255,255,255,0.7)'; x.font = '16px Geist'; x.fillText('⇔', e.x - 8, e.y + (e.len || 80) / 2 + 58); }
    }
    if (this.won) {
      x.fillStyle = `rgba(255,255,255,${Math.min(1, this.wonT * 2)})`; x.font = '64px "Instrument Serif", Georgia, serif';
      x.fillText(this.level < 4 ? 'Solved.' : 'Every colour, in its place.', 40, VH - 50);
    }
  },

  render(renderer, target) { renderer.setRenderTarget(target); renderer.render(this.scene, this.cam3); },
};
