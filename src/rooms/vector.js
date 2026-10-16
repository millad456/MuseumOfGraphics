import { HallRoom } from '../hall/HallRoom.js';
import { strokeText } from '../gfx/strokefont.js';
import { makeCanvas } from '../gfx/three-utils.js';
import { lerp } from '../core/math.js';

// ROOM 02 · The beam.
// No pixels at all: the electron beam is steered along every line in a
// "display list", lap after lap. The phosphor fades quickly, so the longer
// the list, the longer each lap, and below ~30 laps a second the picture
// visibly flickers. Everything on this screen, including its text, is drawn
// as beam strokes.

const W = 1024, H = 768;

const segsOf = (pts, closed = false) => {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) out.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  if (closed && pts.length > 2) out.push([pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]]);
  return out;
};

export default (app) => new VectorRoom(app, {
  id: 'vector', title: 'The Beam', years: '1962 – 1985', music: 'vector',
  secrets: [
    { id: 'ship', title: 'Your drawing flies', hint: 'Vector games were made of lines. Draw a closed shape.', desc: 'Any closed shape you draw becomes a ship.' },
    { id: 'circle', title: 'Two waves, one circle', hint: 'In SOUND mode, make the two waves match exactly.', desc: 'x = sin t, y = cos t: the beam traces a circle.' },
  ],
  notes: [
    { title: 'A screen without pixels', body: [
      'A vector display has no grid. The computer sends a list of line end points, and magnetic coils drag the glowing spot from one to the next. Between lines the beam is switched off and moved.',
      'Early drawing systems, flight simulators and late-1970s arcade games worked this way. Lines were razor sharp, because there was no grid to snap them to.',
    ] },
    { title: 'The flicker budget', body: [
      'Phosphor glows for only a few thousandths of a second, so the whole list must be redrawn many times a second. The beam can only move so fast:',
      { eq: 'redraws per second = beam speed ÷ total length of all lines' },
      'Below about 30 redraws a second the eye notices the flicker. That is why vector games kept their worlds sparse.',
    ] },
    { title: 'The sound is the picture', body: [
      'In SOUND mode the beam is steered by a stereo signal: the left channel moves it sideways, the right channel up and down. You are hearing the exact two waves that draw the shape.',
      { eq: 'x(t) = sin(a·t)\ny(t) = sin(b·t + φ)' },
    ] },
  ],
}, { stations: ['vector'] });

class VectorRoom extends HallRoom {
  async load() {
    super.load();
    this.device = this.hall.device('vector');
    this.screen = this.device.screen;
    this.screen.resize(W, H);
    this.screen.setProfile({ tint: '#d6ecff', mono: 1, scan: 0, mask: 0, glow: 1, curv: 0.16, noise: 0.012, bright: 1.35, res: [W, H] });
    this.persist = makeCanvas(W, H);
    this.px = this.persist.getContext('2d');
    this.strokes = [];
    this.game = null;
    this.keys = {};
    this.segI = 0; this.segOff = 0;
  }

  get speed() { return 20000 * Math.pow(30, this.device.controls.speed.value); }          // px per second
  get glowTime() { return lerp(0.008, 0.35, Math.pow(this.device.controls.persistence.value, 1.6)); }

  enter(scope, ctx) {
    this.arrive(ctx, 'vector');
    const c = this.device.controls;
    this.mode = 'draw';
    this.px.fillStyle = '#000'; this.px.fillRect(0, 0, W, H);
    if (!this.screen.powered) this.screen.power(1);
    scope.on(c.clear, 'press', () => { this.strokes = []; this.game = null; });
    scope.on(c.more, 'press', () => this.addLines());
    scope.on(c.mode, 'change', (on) => this.setMode(on ? 'scope' : 'draw'));
    scope.add(() => { this.stopScope(); this.game = null; this.keys = {}; c.mode.set(false); });

    this.tour = this.startTour(scope, [
      { caption: 'No grid here. A beam of electrons is steered along each line, like a pen.', duration: 8,
        enter: () => { this.setMode('draw'); c.speed.set(0.05); c.persistence.set(0.85); this.strokes = []; this.demoShape = true; } },
      { caption: 'The glow fades in a blink, so the beam has to redraw everything again and again.', duration: 8,
        enter: () => { this.setMode('draw'); this.demoShape = true; this.strokes = []; c.persistence.set(0.85); c.speed.set(0.65); },
        update: (t) => c.persistence.set(Math.max(0.2, 0.85 - t * 0.2)) },
      { caption: 'More lines make each lap longer. Below 30 laps a second, the picture flickers.', duration: 9,
        enter: () => { this.setMode('draw'); this.demoShape = true; this.strokes = []; c.speed.set(0.45); c.persistence.set(0.2); },
        update: (t, dt) => { if (Math.floor(t / 1.6) !== Math.floor((t - dt) / 1.6) && t < 7) { c.more.flash(); this.addLines(); } } },
      { caption: 'Your turn: draw a closed shape on the screen.',
        enter: () => { this.setMode('draw'); this.strokes = []; this.demoShape = false; c.speed.set(0.65); c.persistence.set(0.25); } },
      { caption: 'It flies. Arrow keys steer, Space fires.' },
      { caption: 'Flip the switch to SOUND: the sound you hear is the picture.',
        enter: () => { this.game = null; } },
    ]);
  }

  setMode(m) {
    if (m === this.mode) return;
    if (this.mode === 'scope') this.stopScope();
    this.mode = m;
    this.device.controls.mode.set(m === 'scope');
    if (m === 'scope') {
      this.app.audio.init();
      this.scope = this.app.audio.scope();
      this.app.audio.setStyle('silent');
    } else this.app.audio.setStyle(this.music);
  }

  stopScope() { if (this.scope) { this.scope.stop(); this.scope = null; } }

  addLines() {
    for (let i = 0; i < 40; i++) {
      const x = 120 + Math.random() * (W - 240), y = 160 + Math.random() * (H - 320), r = 30 + Math.random() * 90, a = Math.random() * Math.PI;
      this.strokes.push([[x - Math.cos(a) * r, y - Math.sin(a) * r], [x + Math.cos(a) * r, y + Math.sin(a) * r]]);
    }
  }

  // ----------------------------------------------------------------- input
  pointer(e) {
    if (this.mode !== 'draw' || this.game) return;
    if (e.type === 'down' && e.surface === this.screen && e.inside) {
      this.tour?.pause();
      this.cur = [[e.sx, e.sy]]; this.strokes.push(this.cur); this.demoShape = false;
    } else if (e.type === 'move' && this.cur && e.inside) {
      const l = this.cur[this.cur.length - 1];
      if (Math.hypot(e.sx - l[0], e.sy - l[1]) > 10) this.cur.push([e.sx, e.sy]);
    } else if (e.type === 'up' && this.cur) {
      const s = this.cur; this.cur = null;
      if (s.length < 2) { this.strokes.pop(); return; }
      const gap = Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]);
      const xs = s.map((q) => q[0]), ys = s.map((q) => q[1]);
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (s.length >= 6 && gap < 50 && size > 60) { s.push(s[0]); this.startGame(s); }
    }
  }

  key(e, down) {
    if (!this.game) return false;
    this.keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = down;
    return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key) || 'wasd'.includes(e.key.toLowerCase());
  }

  // ----------------------------------------------------------------- the game
  startGame(shape) {
    this.app.secret('ship', 'Your drawing flies', 'Any closed shape you draw becomes a ship. Vector games were built just like this.');
    const cx = shape.reduce((a, q) => a + q[0], 0) / shape.length, cy = shape.reduce((a, q) => a + q[1], 0) / shape.length;
    const r = Math.max(...shape.map((q) => Math.hypot(q[0] - cx, q[1] - cy)));
    const step = Math.max(1, Math.floor(shape.length / 24));
    const pts = shape.filter((_, i) => i % step === 0).map((q) => [(q[0] - cx) / r * 28, (q[1] - cy) / r * 28]);
    this.game = { ship: { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, shape: pts, inv: 2 }, rocks: [], shots: [], parts: [], score: 0, cool: 0, wave: 0 };
    this.strokes = [];
    this.app.audio.chime([62, 69, 74, 81], 'triangle');
    this.spawnWave();
    if (this.tour?.index === 3) this.tour.next();
  }

  spawnWave() {
    const g = this.game; g.wave++;
    for (let i = 0; i < 2 + g.wave; i++) { const a = Math.random() * Math.PI * 2; g.rocks.push(this.rock(W / 2 + Math.cos(a) * 420, H / 2 + Math.sin(a) * 330, 52)); }
  }

  rock(x, y, r) {
    const n = 7 + Math.floor(Math.random() * 4), shape = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, rr = r * (0.7 + Math.random() * 0.35); shape.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    const v = 40 + Math.random() * 60, d = Math.random() * Math.PI * 2;
    return { x, y, r, vx: Math.cos(d) * v, vy: Math.sin(d) * v, a: 0, va: (Math.random() - 0.5) * 1.5, shape };
  }

  updateGame(dt) {
    const g = this.game, s = g.ship, k = this.keys, A = this.app.audio;
    if (k.ArrowLeft || k.a) s.a -= 4 * dt;
    if (k.ArrowRight || k.d) s.a += 4 * dt;
    if (k.ArrowUp || k.w) { s.vx += Math.cos(s.a) * 320 * dt; s.vy += Math.sin(s.a) * 320 * dt; }
    s.vx *= Math.pow(0.6, dt); s.vy *= Math.pow(0.6, dt);
    s.x = (s.x + s.vx * dt + W) % W; s.y = (s.y + s.vy * dt + H) % H;
    s.inv = Math.max(0, s.inv - dt);
    g.cool -= dt;
    if (k[' '] && g.cool <= 0) { g.cool = 0.22; g.shots.push({ x: s.x, y: s.y, vx: Math.cos(s.a) * 620 + s.vx, vy: Math.sin(s.a) * 620 + s.vy, life: 1 }); A.laser(); }
    for (const q of g.shots) { q.x = (q.x + q.vx * dt + W) % W; q.y = (q.y + q.vy * dt + H) % H; q.life -= dt; }
    g.shots = g.shots.filter((q) => q.life > 0);
    for (const r of g.rocks) { r.x = (r.x + r.vx * dt + W) % W; r.y = (r.y + r.vy * dt + H) % H; r.a += r.va * dt; }
    for (const p of g.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    g.parts = g.parts.filter((p) => p.life > 0);
    const next = [];
    for (const r of g.rocks) {
      const hit = g.shots.find((q) => Math.hypot(q.x - r.x, q.y - r.y) < r.r);
      if (hit) {
        hit.life = 0; g.score += Math.round(1000 / r.r); A.boom(r.r / 52);
        for (let i = 0; i < 8; i++) { const a = Math.random() * 7; g.parts.push({ x: r.x, y: r.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.6 }); }
        if (r.r > 20) next.push(this.rock(r.x, r.y, r.r * 0.55), this.rock(r.x, r.y, r.r * 0.55));
      } else next.push(r);
      if (!s.inv && Math.hypot(s.x - r.x, s.y - r.y) < r.r + 14) { s.inv = 2; A.hurt(); s.vx = -s.vx; s.vy = -s.vy; }
    }
    g.rocks = next;
    if (!g.rocks.length) this.spawnWave();
  }

  // ----------------------------------------------------------------- display list
  displayList(t) {
    const segs = [];
    const add = (pls) => { for (const pl of pls) segs.push(...segsOf(pl)); };
    if (this.game) {
      const g = this.game, s = g.ship;
      if (!(s.inv > 0 && Math.floor(s.inv * 10) % 2)) {
        const ca = Math.cos(s.a + Math.PI / 2), sa = Math.sin(s.a + Math.PI / 2);
        segs.push(...segsOf(s.shape.map(([x, y]) => [s.x + x * ca - y * sa, s.y + x * sa + y * ca]), true));
      }
      for (const r of g.rocks) {
        const ca = Math.cos(r.a), sa = Math.sin(r.a);
        segs.push(...segsOf(r.shape.map(([x, y]) => [r.x + x * ca - y * sa, r.y + x * sa + y * ca]), true));
      }
      for (const q of g.shots) segs.push([q.x, q.y, q.x - q.vx * 0.012, q.y - q.vy * 0.012]);
      for (const p of g.parts) segs.push([p.x, p.y, p.x + p.vx * 0.03, p.y + p.vy * 0.03]);
      add(strokeText(`SCORE ${g.score}`, 90, 90, 16));
      return segs;
    }
    if (this.demoShape) {
      // a spinning wireframe cube and a title, drawn by the beam
      const a = t * 0.6, b = t * 0.37, sz = 110, cx = W / 2, cy = H / 2 + 20;
      const V = [];
      for (let i = 0; i < 8; i++) {
        const x = i & 1 ? 1 : -1, y = i & 2 ? 1 : -1, z = i & 4 ? 1 : -1;
        const x1 = x * Math.cos(a) - z * Math.sin(a), z1 = x * Math.sin(a) + z * Math.cos(a);
        const y1 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b);
        const d = 4 / (4 - z2); V.push([cx + x1 * sz * d, cy + y1 * sz * d]);
      }
      [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([i, j]) => segs.push([...V[i], ...V[j]]));
      add(strokeText('VECTOR', 90, 90, 26));
    }
    for (const s of this.strokes) segs.push(...segsOf(s));
    return segs;
  }

  update(dt, t) {
    if (this.game) this.updateGame(dt);
    if (this.mode === 'scope') this.drawScope(dt); else this.drawBeam(dt, t);
    this.screen.commit(t);
  }

  fadePhosphor(dt) {
    const px = this.px;
    px.globalCompositeOperation = 'source-over';
    px.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt / this.glowTime)})`;
    px.fillRect(0, 0, W, H);
    // 8-bit blending never quite reaches black; subtract a little so old lines really vanish
    px.globalCompositeOperation = 'difference';
    px.fillStyle = 'rgb(3,3,3)';
    px.fillRect(0, 0, W, H);
    px.globalCompositeOperation = 'source-over';
  }

  drawScope(dt) {
    const c = this.device.controls;
    const ratios = [1, 1.5, 2, 3, 4];
    const fx = ratios[Math.round(c.speed.value * 4)], fy = 1, phase = c.persistence.value * Math.PI;
    if (this.scope) {
      this.scope.set(110 * fx, 110 * fy, phase);
      if (fx === 1 && Math.abs(phase - Math.PI / 2) < 0.07) this.app.secret('circle', 'Two waves, one circle', 'x = sin t, y = cos t: the beam traces a perfect circle.');
    }
    this.fadePhosphor(dt);
    const px = this.px;
    px.globalCompositeOperation = 'lighter';
    px.strokeStyle = 'rgba(200,230,255,0.55)'; px.lineWidth = 2.5;
    px.beginPath();
    const cx = W / 2, cy = H / 2 + 20, s = 280;
    if (this.scope) {
      const [bx, by] = this.scope.read();
      for (let i = 0; i < bx.length; i++) { const x = cx + bx[i] / 0.9 * s, y = cy - by[i] / 0.9 * s; if (i) px.lineTo(x, y); else px.moveTo(x, y); }
    }
    px.stroke();
    px.strokeStyle = 'rgba(200,230,255,0.4)'; px.lineWidth = 1.6;
    for (const pl of [...strokeText('LEFT EAR STEERS X', 90, 70, 14), ...strokeText('RIGHT EAR STEERS Y', 90, 100, 14), ...strokeText('TURN THE KNOBS', 90, H - 90, 14)]) {
      px.beginPath(); pl.forEach(([x, y], i) => (i ? px.lineTo(x, y) : px.moveTo(x, y))); px.stroke();
    }
    this.screen.ctx.drawImage(this.persist, 0, 0);
    this.device.gauge.set(0);
  }

  drawBeam(dt, t) {
    this.fadePhosphor(dt);
    const segs = this.displayList(t);
    let lap = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], n = segs[(i + 1) % segs.length];
      s.len = Math.hypot(s[2] - s[0], s[3] - s[1]);
      s.jump = Math.hypot(n[0] - s[2], n[1] - s[3]) * 0.25;
      lap += s.len + s.jump;
    }
    const hz = segs.length ? this.speed / Math.max(lap, 1) : 0;
    this.device.gauge.set(Math.min(120, hz));
    // advance the beam along the list for this frame's time budget
    let budget = Math.min(this.speed * dt, lap * 3);
    const px = this.px;
    px.globalCompositeOperation = 'lighter'; px.lineCap = 'round';
    let i = this.segI >= segs.length ? 0 : this.segI, off = this.segOff, guard = 0;
    let bx = W / 2, by = H / 2;
    while (budget > 0 && segs.length && guard++ < 20000) {
      const s = segs[i];
      const take = Math.min(s.len - off, budget);
      const t0 = s.len ? off / s.len : 0, t1 = s.len ? (off + take) / s.len : 1;
      const x0 = s[0] + (s[2] - s[0]) * t0, y0 = s[1] + (s[3] - s[1]) * t0, x1 = s[0] + (s[2] - s[0]) * t1, y1 = s[1] + (s[3] - s[1]) * t1;
      px.strokeStyle = 'rgba(160,210,255,0.22)'; px.lineWidth = 8;
      px.beginPath(); px.moveTo(x0, y0); px.lineTo(x1, y1); px.stroke();
      px.strokeStyle = 'rgba(235,245,255,0.95)'; px.lineWidth = 2;
      px.beginPath(); px.moveTo(x0, y0); px.lineTo(x1, y1); px.stroke();
      bx = x1; by = y1;
      budget -= take; off += take;
      if (off >= s.len - 1e-6) { budget -= s.jump; off = 0; i = (i + 1) % segs.length; }
    }
    this.segI = i; this.segOff = off;
    px.globalCompositeOperation = 'source-over';
    const ctx = this.screen.ctx;
    ctx.drawImage(this.persist, 0, 0);
    const grd = ctx.createRadialGradient(bx, by, 0, bx, by, 22);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.fillRect(bx - 22, by - 22, 44, 44);
  }
}
