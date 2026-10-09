import { strokeText, strokeWidth } from '../gfx/strokefont.js';

// ROOM 02 — The Beam. No pixels: the electron beam is steered along each line
// in a display list, over and over. The longer the list, the longer each lap
// takes, and the more the phosphor fades before the beam returns.

const W = 1024, H = 768;

function poly(pts, closed = false) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  if (closed && pts.length > 2) segs.push([pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]]);
  return segs;
}

export default {
  id: 'vector', title: 'The Beam', year: '1962–1985', tagline: 'No pixels. A single beam of electrons, steered along every line, many times a second.',
  mode: 'screen', ui: 'scope', music: 'vector',
  monitorProfile: { tint: '#d6ecff', mono: 1, scan: 0.0, mask: 0.0, glow: 1.0, curv: 0.16, noise: 0.015, flicker: 0, bright: 1.35, res: [1024, 768] },
  secrets: [
    { id: 'drawnShip', title: 'Your drawing flies', hint: 'Vector games were made of lines. Draw a closed shape.', desc: 'Any closed shape you draw becomes a ship.' },
    { id: 'circle', title: 'Two sines make a circle', hint: 'In SCOPE mode, set the waves equal and a quarter turn apart.', desc: 'x = sin(t), y = sin(t + 90°).' },
    { id: 'overload', title: 'Beam overload', hint: 'Ask the beam to draw more than it can.', desc: 'Below about 30 laps per second, our eyes see the flicker.' },
  ],
  notes: [
    {
      title: 'A screen with no pixels', meta: '1962 – 1985',
      body: `<p>A vector display has no grid. The computer sends the beam a list of line endpoints, and deflection coils drag the glowing spot from one point to the next. Between lines the beam is switched off and moved, which is called <i>blanking</i>.</p><p>Early interactive drawing programs in the 1960s, flight simulators and late-70s arcade machines used this. The lines were razor sharp because there was no grid to snap them to.</p>`,
    },
    {
      title: 'The flicker budget', meta: 'Refresh rate',
      body: `<p>Phosphor fades within milliseconds, so the beam must keep re-tracing the whole list. It can only move so fast, so the length of the list sets the refresh rate:</p>
      <div class="eq">refresh rate (Hz)  =  beam speed  ÷  total path length</div>
      <p>Below roughly 30 Hz you start to see the image shimmer. Draw a lot on the screen and watch the readout drop. That is the reason vector games kept their worlds sparse.</p>`,
    },
    {
      title: 'The sound is the picture', meta: 'Oscilloscope XY',
      body: `<p>An oscilloscope in XY mode steers the beam with two voltages: one for left-right, one for up-down. Feed it a stereo sound and the left channel becomes x, the right channel becomes y.</p>
      <div class="eq">x(t) = sin(a · t)
y(t) = sin(b · t + φ)</div><p>In <b>SCOPE</b> mode you are hearing exactly the two signals that draw the shape. Whole ratios make closed figures called Lissajous curves.</p>`,
    },
    {
      title: 'Why the beam lost', meta: 'Vector vs raster',
      body: `<p>A beam can draw lines but it cannot fill an area without scribbling over it, and every extra line costs refresh time. When memory became cheap enough to store a whole grid of dots, it became easier to sweep the beam in the same fixed pattern every time and switch it on and off. That is the <b>raster</b>, and it is where we go next.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    this.persist = document.createElement('canvas'); this.persist.width = W; this.persist.height = H;
    this.px = this.persist.getContext('2d');
    this.px.fillStyle = '#000'; this.px.fillRect(0, 0, W, H);
    this.strokes = [];
    this.cur = null;
    this.vmode = 'draw';
    this.speed = 300000; // px per second
    this.persistence = 0.06;
    this.beamS = 0;
    this.showBlank = false;
    this.t = 0;
    this.game = null;
    this.keys = {};
    this.fx = 2; this.fy = 3; this.phase = 0.6; this.drift = 0;
  },

  enter(app) {
    const m = app.monitor;
    m.resizeCanvas(W, H); m.setProfile(this.monitorProfile);
    m.uniforms.uPowerX.value = 1; m.uniforms.uPowerY.value = 1; m.setPowered(true);
    app.ui.showChrome(true);
    this.buildControls();
  },
  exit() { this.stopScope(); this.game = null; this.vmode = 'draw'; },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Beam control');
    this.obj = [ui.objective('Draw something on the screen'), ui.objective('Push the refresh rate below 30 Hz')];
    this.modeSeg = ui.segmented('Mode', [{ v: 'draw', l: 'Draw' }, { v: 'scope', l: 'Scope' }], 'draw', (v) => this.setMode(v));
    this.panel = document.createElement('div'); this.panel.className = 'ctl'; this.panel.style.gap = '10px';
    ui.controlsBody.appendChild(this.panel);
    this.readout = ui.readout();
    this.drawPanel();
  },

  drawPanel() {
    const ui = this.app.ui, p = this.panel; p.innerHTML = '';
    if (this.vmode === 'draw') {
      ui.slider('Beam speed', { min: 20000, max: 800000, step: 5000, value: this.speed, fmt: (v) => (v / 1000).toFixed(0) + 'k px/s' }, (v) => (this.speed = v), p);
      ui.slider('Phosphor persistence', { min: 0.01, max: 0.4, step: 0.01, value: this.persistence, fmt: (v) => (v * 1000).toFixed(0) + ' ms' }, (v) => (this.persistence = v), p);
      const r = ui.row(p);
      ui.toggle('Show blanked moves', this.showBlank, (v) => (this.showBlank = v), r);
      ui.button('Add 40 lines', () => this.addStars(), r);
      ui.button('Clear', () => { this.strokes = []; }, r);
      ui.hint('Drag on the screen to draw. Every line you add makes the beam\'s lap longer.', p);
    } else if (this.vmode === 'scope') {
      this.fx = this.fx || 2; this.fy = this.fy || 3; this.phase = this.phase ?? 0.6;
      ui.slider('x frequency (a)', { min: 1, max: 6, step: 1, value: this.fx, fmt: (v) => v + '' }, (v) => { this.fx = v; this.updScope(); }, p);
      ui.slider('y frequency (b)', { min: 1, max: 6, step: 1, value: this.fy, fmt: (v) => v + '' }, (v) => { this.fy = v; this.updScope(); }, p);
      ui.slider('Phase φ', { min: 0, max: Math.PI, step: 0.01, value: this.phase, fmt: (v) => Math.round((v * 180) / Math.PI) + '°' }, (v) => { this.phase = v; this.updScope(); }, p);
      ui.slider('Drift', { min: 0, max: 0.6, step: 0.01, value: this.drift || 0, fmt: (v) => v.toFixed(2) + ' Hz' }, (v) => { this.drift = v; this.updScope(); }, p);
      ui.hint('Left channel steers x, right channel steers y. Use headphones to hear the shape.', p);
    } else if (this.vmode === 'play') {
      ui.hint('Arrows or WASD: turn and thrust. Space: fire. Esc: back to drawing.', p);
      const r = ui.row(p);
      const hold = (label, k) => { const b = ui.button(label, () => {}, r); b.addEventListener('pointerdown', () => (this.keys[k] = true)); b.addEventListener('pointerup', () => (this.keys[k] = false)); b.addEventListener('pointerleave', () => (this.keys[k] = false)); };
      hold('◀', 'ArrowLeft'); hold('▲', 'ArrowUp'); hold('▶', 'ArrowRight'); hold('Fire', ' ');
      ui.button('Stop game', () => this.setMode('draw'), p);
    }
  },

  setMode(m) {
    if (m === this.vmode) return;
    if (this.vmode === 'scope') this.stopScope();
    this.vmode = m;
    this.modeSeg?.set(m === 'play' ? 'draw' : m);
    if (m === 'scope') { this.app.audio.init(); this.scope = this.app.audio.scope(); this.updScope(); this.app.audio.setStyle('silent'); }
    if (m !== 'scope') this.app.audio.setStyle('vector');
    if (m !== 'play') this.game = null;
    this.drawPanel();
  },

  stopScope() { if (this.scope) { this.scope.stop(); this.scope = null; } },
  updScope() {
    if (!this.scope) return;
    const base = 110;
    this.scope.set(base * this.fx, base * this.fy + (this.drift || 0), this.phase);
    const isCircle = this.fx === this.fy && Math.abs(this.phase - Math.PI / 2) < 0.06 && !(this.drift > 0.02);
    if (isCircle) this.app.secret('circle', 'Two sines make a circle', 'x = sin(t), y = sin(t + 90°): the beam traces a perfect circle.');
  },

  addStars() {
    for (let i = 0; i < 40; i++) {
      const x = 80 + Math.random() * (W - 160), y = 120 + Math.random() * (H - 240), r = 30 + Math.random() * 90, a = Math.random() * Math.PI;
      this.strokes.push([[x - Math.cos(a) * r, y - Math.sin(a) * r], [x + Math.cos(a) * r, y + Math.sin(a) * r]]);
    }
  },

  // ------------------------------------------------------------ input
  pointer(type, p, e, app) {
    if (this.vmode !== 'draw') return;
    if (type === 'down' && p.inside) { this.cur = [[p.x, p.y]]; this.strokes.push(this.cur); }
    else if (type === 'move' && this.cur && p.inside) {
      const l = this.cur[this.cur.length - 1];
      if (Math.hypot(p.x - l[0], p.y - l[1]) > 10) this.cur.push([p.x, p.y]);
    } else if (type === 'up' && this.cur) {
      const s = this.cur; this.cur = null;
      if (s.length < 2) { this.strokes.pop(); return; }
      this.obj[0].done(); this.app.ready(true);
      const d = Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]);
      const xs = s.map((q) => q[0]), ys = s.map((q) => q[1]);
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (s.length >= 6 && d < 40 && size > 50) { s.push(s[0]); this.startGame(s); }
    }
  },

  key(e, down) {
    if (this.vmode !== 'play') return false;
    this.keys[e.key] = down;
    if (down && e.key === 'Escape') { this.setMode('draw'); return true; }
    return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w'].includes(e.key);
  },

  // ------------------------------------------------------------ the game
  startGame(shape) {
    const app = this.app;
    app.secret('drawnShip', 'Your drawing flies', 'Any closed shape you draw becomes a ship. Vector games were made exactly like this.');
    const cx = shape.reduce((a, q) => a + q[0], 0) / shape.length, cy = shape.reduce((a, q) => a + q[1], 0) / shape.length;
    const r = Math.max(...shape.map((q) => Math.hypot(q[0] - cx, q[1] - cy)));
    // simplify to at most 24 points and normalise; the nose points up (-y)
    const step = Math.max(1, Math.floor(shape.length / 24));
    const pts = shape.filter((_, i) => i % step === 0).map((q) => [(q[0] - cx) / r * 26, (q[1] - cy) / r * 26]);
    this.game = { ship: { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, shape: pts, inv: 2 }, rocks: [], shots: [], parts: [], score: 0, cool: 0, wave: 0 };
    this.strokes = [];
    this.vmode = 'play'; this.drawPanel();
    app.audio.chime([62, 69, 74, 81], 'triangle');
    this.spawnWave();
  },
  spawnWave() {
    const g = this.game; g.wave++;
    for (let i = 0; i < 2 + g.wave; i++) {
      const a = Math.random() * Math.PI * 2;
      g.rocks.push(this.rock(W / 2 + Math.cos(a) * 420, H / 2 + Math.sin(a) * 330, 52));
    }
  },
  rock(x, y, r) {
    const n = 7 + Math.floor(Math.random() * 4), shape = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const rr = r * (0.7 + Math.random() * 0.35); shape.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    const v = 40 + Math.random() * 60, d = Math.random() * Math.PI * 2;
    return { x, y, r, vx: Math.cos(d) * v, vy: Math.sin(d) * v, a: 0, va: (Math.random() - 0.5) * 1.5, shape };
  },
  updateGame(dt) {
    const g = this.game, s = g.ship, k = this.keys, A = this.app.audio;
    const left = k.ArrowLeft || k.a, right = k.ArrowRight || k.d, up = k.ArrowUp || k.w;
    if (left) s.a -= 4 * dt; if (right) s.a += 4 * dt;
    if (up) { s.vx += Math.cos(s.a) * 320 * dt; s.vy += Math.sin(s.a) * 320 * dt; }
    s.vx *= Math.pow(0.6, dt); s.vy *= Math.pow(0.6, dt);
    s.x = (s.x + s.vx * dt + W) % W; s.y = (s.y + s.vy * dt + H) % H;
    s.inv = Math.max(0, s.inv - dt);
    g.cool -= dt;
    if (k[' '] && g.cool <= 0) { g.cool = 0.22; g.shots.push({ x: s.x, y: s.y, vx: Math.cos(s.a) * 620 + s.vx, vy: Math.sin(s.a) * 620 + s.vy, life: 1.0 }); A.laser(); }
    for (const sh of g.shots) { sh.x = (sh.x + sh.vx * dt + W) % W; sh.y = (sh.y + sh.vy * dt + H) % H; sh.life -= dt; }
    g.shots = g.shots.filter((q) => q.life > 0);
    for (const r of g.rocks) { r.x = (r.x + r.vx * dt + W) % W; r.y = (r.y + r.vy * dt + H) % H; r.a += r.va * dt; }
    for (const p of g.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    g.parts = g.parts.filter((p) => p.life > 0);
    const next = [];
    for (const r of g.rocks) {
      let hit = false;
      for (const sh of g.shots) if (Math.hypot(sh.x - r.x, sh.y - r.y) < r.r) { hit = true; sh.life = 0; break; }
      if (hit) {
        g.score += Math.round(100 / r.r * 10); A.boom(r.r / 52);
        for (let i = 0; i < 8; i++) { const a = Math.random() * 7; g.parts.push({ x: r.x, y: r.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.6 }); }
        if (r.r > 20) { next.push(this.rock(r.x, r.y, r.r * 0.55)); next.push(this.rock(r.x, r.y, r.r * 0.55)); }
      } else next.push(r);
      if (!s.inv && Math.hypot(s.x - r.x, s.y - r.y) < r.r + 14) { s.inv = 2; A.hurt(); s.vx = -s.vx; s.vy = -s.vy; g.score = Math.max(0, g.score - 50); }
    }
    g.rocks = next;
    if (!g.rocks.length) this.spawnWave();
  },

  // ------------------------------------------------------------ display list
  buildList(t) {
    const segs = [];
    const add = (pls) => { for (const pl of pls) segs.push(...poly(pl)); };
    // title text, drawn by the beam
    add(strokeText('THE BEAM', 80, 76, 22));
    // spinning wireframe cube: vector displays did 3D long before pixels did
    if (this.vmode === 'draw') {
      const a = t * 0.6, b = t * 0.37, sz = 62, cx = W - 190, cy = 190;
      const V = [];
      for (let i = 0; i < 8; i++) {
        let x = i & 1 ? 1 : -1, y = i & 2 ? 1 : -1, z = i & 4 ? 1 : -1;
        let x1 = x * Math.cos(a) - z * Math.sin(a), z1 = x * Math.sin(a) + z * Math.cos(a);
        let y1 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b);
        const d = 4 / (4 - z2); V.push([cx + x1 * sz * d, cy + y1 * sz * d]);
      }
      [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([i, j]) => segs.push([...V[i], ...V[j]]));
      for (const s of this.strokes) segs.push(...poly(s));
    }
    if (this.vmode === 'play' && this.game) {
      const g = this.game, s = g.ship;
      if (!(s.inv > 0 && Math.floor(s.inv * 10) % 2)) {
        const ca = Math.cos(s.a + Math.PI / 2), sa = Math.sin(s.a + Math.PI / 2);
        segs.push(...poly(s.shape.map(([x, y]) => [s.x + x * ca - y * sa, s.y + x * sa + y * ca]), true));
      }
      for (const r of g.rocks) {
        const ca = Math.cos(r.a), sa = Math.sin(r.a);
        segs.push(...poly(r.shape.map(([x, y]) => [r.x + x * ca - y * sa, r.y + x * sa + y * ca]), true));
      }
      for (const sh of g.shots) segs.push([sh.x, sh.y, sh.x - sh.vx * 0.012, sh.y - sh.vy * 0.012]);
      for (const p of g.parts) segs.push([p.x, p.y, p.x + p.vx * 0.03, p.y + p.vy * 0.03]);
      add(strokeText('SCORE ' + g.score, 80, 112, 14));
    }
    return segs;
  },

  update(dt, t, app) {
    this.t = t;
    if (this.vmode === 'play' && this.game) this.updateGame(dt);
  },

  draw(ctx, dt, t) {
    const px = this.px;
    // phosphor decay
    px.globalCompositeOperation = 'source-over';
    px.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt / this.persistence)})`;
    px.fillRect(0, 0, W, H);

    if (this.vmode === 'scope' && this.scope) {
      const [bx, by] = this.scope.read();
      px.globalCompositeOperation = 'lighter';
      px.strokeStyle = 'rgba(200,230,255,0.5)'; px.lineWidth = 2.2;
      px.beginPath();
      const cx = W / 2, cy = H / 2 + 20, s = 300;
      for (let i = 0; i < bx.length; i++) { const x = cx + bx[i] / 0.9 * s, y = cy - by[i] / 0.9 * s; i ? px.lineTo(x, y) : px.moveTo(x, y); }
      px.stroke();
      // labels via the beam
      px.strokeStyle = 'rgba(200,230,255,0.35)'; px.lineWidth = 1.6;
      const labels = [...strokeText('X = SIN(' + this.fx + 'T)', 80, 76, 16), ...strokeText('Y = SIN(' + this.fy + 'T + ' + Math.round(this.phase * 57.3) + ')', 80, 106, 16)];
      for (const pl of labels) { px.beginPath(); pl.forEach(([x, y], i) => (i ? px.lineTo(x, y) : px.moveTo(x, y))); px.stroke(); }
      this.readout.textContent = `ratio a:b = ${this.fx}:${this.fy}\nphase φ = ${Math.round(this.phase * 57.3)}°\nleft ear = x, right ear = y`;
      ctx.drawImage(this.persist, 0, 0);
      return;
    }

    const segs = this.buildList(t);
    // HUD readout, also drawn by the beam (it costs beam time too)
    let total = 0, blank = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]; s.len = Math.hypot(s[2] - s[0], s[3] - s[1]);
      total += s.len;
      const n = segs[(i + 1) % segs.length];
      const j = Math.hypot(n[0] - s[2], n[1] - s[3]) * 0.25; s.jump = j; blank += j;
    }
    const lap = total + blank;
    const hz = this.speed / Math.max(lap, 1);
    const hud = strokeText(`${segs.length} LINES   ${hz.toFixed(0)} HZ`, 80, H - 100, 14);
    for (const pl of hud) for (const s of poly(pl)) { s.len = Math.hypot(s[2] - s[0], s[3] - s[1]); s.jump = 1; segs.push(s); }

    // advance the beam along the list for this frame's time budget
    let budget = this.speed * dt;
    const lapAll = segs.reduce((a, s) => a + s.len + s.jump, 0);
    if (budget > lapAll * 3) budget = lapAll * 3; // cap redundant laps
    px.globalCompositeOperation = 'lighter';
    px.lineCap = 'round';
    let i = this._segI || 0, off = this._segOff || 0, guard = 0;
    let beamX = W / 2, beamY = H / 2;
    if (i >= segs.length) { i = 0; off = 0; }
    while (budget > 0 && segs.length && guard++ < 20000) {
      const s = segs[i];
      const remain = s.len - off;
      const take = Math.min(remain, budget);
      const t0 = s.len ? off / s.len : 0, t1 = s.len ? (off + take) / s.len : 1;
      const x0 = s[0] + (s[2] - s[0]) * t0, y0 = s[1] + (s[3] - s[1]) * t0, x1 = s[0] + (s[2] - s[0]) * t1, y1 = s[1] + (s[3] - s[1]) * t1;
      px.strokeStyle = 'rgba(160,210,255,0.22)'; px.lineWidth = 7;
      px.beginPath(); px.moveTo(x0, y0); px.lineTo(x1, y1); px.stroke();
      px.strokeStyle = 'rgba(235,245,255,0.95)'; px.lineWidth = 1.8;
      px.beginPath(); px.moveTo(x0, y0); px.lineTo(x1, y1); px.stroke();
      beamX = x1; beamY = y1;
      budget -= take; off += take;
      if (off >= s.len - 1e-6) {
        budget -= s.jump; off = 0;
        const n = segs[(i + 1) % segs.length];
        if (this.showBlank) { px.strokeStyle = 'rgba(255,170,90,0.25)'; px.lineWidth = 1; px.setLineDash([4, 6]); px.beginPath(); px.moveTo(s[2], s[3]); px.lineTo(n[0], n[1]); px.stroke(); px.setLineDash([]); }
        i = (i + 1) % segs.length;
      }
    }
    this._segI = i; this._segOff = off;
    px.globalCompositeOperation = 'source-over';

    ctx.drawImage(this.persist, 0, 0);
    // the beam spot itself
    const grd = ctx.createRadialGradient(beamX, beamY, 0, beamX, beamY, 18);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.fillRect(beamX - 18, beamY - 18, 36, 36);

    this.readout.textContent = `display list   ${segs.length} lines\npath length    ${Math.round(total)} px\nblanked moves  ${Math.round(blank)} px\nbeam speed     ${(this.speed / 1000).toFixed(0)}k px/s\nrefresh        ${hz.toFixed(1)} Hz ${hz < 30 ? '← flicker!' : ''}`;
    if (hz < 30 && this.vmode === 'draw') {
      this.obj[1].done();
      this._lowT = (this._lowT || 0) + dt;
      if (this._lowT > 1.2) this.app.secret('overload', 'Beam overload', 'Below about 30 laps per second, our eyes see the flicker.');
    } else this._lowT = 0;
  },
};
