import * as THREE from 'three';
import { makeStars } from '../gfx/lab.js';

// ROOM 09 — The magic number. A 3D front panel with 32 real toggle switches:
// the bits of a 32-bit float. Run the famous inverse-square-root shortcut on
// it step by step, then try to find a better constant than the one from 1999.

const buf = new DataView(new ArrayBuffer(4));
const f2i = (f) => { buf.setFloat32(0, f); return buf.getUint32(0); };
const i2f = (i) => { buf.setUint32(0, i >>> 0); return buf.getFloat32(0); };
const hex = (i) => '0x' + (i >>> 0).toString(16).toUpperCase().padStart(8, '0');
const CLASSIC = 0x5F3759DF;

function fastInv(x, magic, newton = true) {
  const i = (magic - (f2i(x) >>> 1)) >>> 0;
  let y = i2f(i);
  if (newton) y = y * (1.5 - 0.5 * x * y * y);
  return y;
}
function maxErr(magic, newton = true) {
  let m = 0;
  for (let k = 0; k <= 600; k++) {
    const x = Math.pow(10, -2 + (k / 600) * 4);
    const e = Math.abs(fastInv(x, magic, newton) * Math.sqrt(x) - 1);
    if (e > m) m = e;
  }
  return m;
}

function canvasPlane(w, h, pxW, pxH) {
  const c = document.createElement('canvas'); c.width = pxW; c.height = pxH;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  return { mesh: m, c, x: c.getContext('2d'), t };
}

export default {
  id: 'magic', title: 'The Magic Number', year: '1999', tagline: '0x5F3759DF. A constant that let a game engine compute 1/√x by treating a decimal number as an integer.',
  mode: 'world', ui: 'gel01', music: 'fm',
  secrets: [
    { id: 'beatconst', title: 'Better than 1999', hint: 'Find a magic constant with a smaller worst-case error than 0x5F3759DF.', desc: 'Mathematicians later found slightly better constants. So did you.' },
    { id: 'negzero', title: 'Negative zero', hint: 'Flip only the sign bit of zero.', desc: 'Floating point has two zeros: +0 and −0.' },
  ],
  notes: [
    {
      title: 'How a computer stores 3.14', meta: 'IEEE 754 float',
      body: `<p>A 32-bit floating point number is scientific notation in binary. 1 bit for the sign, 8 bits for the exponent, 23 bits for the digits (the mantissa):</p>
      <div class="eq">value = (−1)^sign × 1.mantissa × 2^(exponent − 127)</div><p>The switches on the panel are those 32 bits. Red is the sign, amber is the exponent, cyan is the mantissa. Flip any of them.</p>`,
    },
    {
      title: 'The trick', meta: 'Bits as a logarithm',
      body: `<p>Because the exponent sits in the high bits, reading a float's bits as if they were a plain integer gives you, roughly, a scaled <b>logarithm</b> of the number. Logarithms turn powers into multiplication: 1/√x is x to the power −½, so its log is −½ × log(x).</p>
      <div class="eq">i = bits_of(x)              read the float as an integer
i = MAGIC − (i >> 1)        halve and negate the logarithm
y = float_from_bits(i)      a first guess at 1/√x
y = y × (1.5 − 0.5·x·y·y)   one Newton step to refine it</div><p>The shift halves the log, subtracting from the constant negates it and corrects the offset. One step of Newton's method brings the guess within about 0.2%.</p>`,
    },
    {
      title: 'Where it came from', meta: '1999 / 2005',
      body: `<p>The routine became famous when the source code of a 1999 first-person shooter was released in 2005, and programmers puzzled over the unexplained constant. Its origins trace back to late-1980s graphics workstation programmers. A 2003 analysis showed slightly better constants exist, such as 0x5F375A86.</p>`,
    },
    {
      title: 'Why it mattered, and why it does not now', meta: 'Hardware caught up',
      body: `<p>Lighting needs unit-length normals, and making a vector unit length needs 1/√(x² + y² + z²). In the late 1990s a square root and a division took dozens of cycles; this trick used a shift, a subtraction and a few multiplies.</p><p>Soon after, processors gained a dedicated reciprocal square-root instruction, and every GPU shader today has <code>inversesqrt()</code> built in. The hack is history, but it is a beautiful piece of it.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x050508);
    s.fog = new THREE.Fog(0x050508, 18, 40);
    this.cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    s.add(makeStars(600, 60, 0x506080));
    s.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xfff0e0, 2.6); key.position.set(-4, 6, 8); s.add(key);
    const rim = new THREE.DirectionalLight(0x7090ff, 0.8); rim.position.set(6, 3, -4); s.add(rim);

    const panel = (this.panel = new THREE.Group()); s.add(panel);
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3c44, roughness: 0.38, metalness: 0.6 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(14.2, 8.4, 0.6), metal); chassis.position.set(0, 0.4, -0.35); panel.add(chassis);
    // rack ears and screws
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const scr = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.9, roughness: 0.3 }));
      scr.rotation.x = Math.PI / 2; scr.position.set(sx * 6.75, 0.4 + sy * 3.85, 0); panel.add(scr);
    }

    // silkscreen labels on the panel face
    const face = canvasPlane(14, 2.2, 1792, 282); face.mesh.position.set(0, -2.45, 0.0); panel.add(face.mesh);
    this.face = face;

    // switches and LEDs
    this.switches = []; this.leds = [];
    const swBase = new THREE.BoxGeometry(0.22, 0.34, 0.12), lever = new THREE.CylinderGeometry(0.035, 0.05, 0.42, 10);
    const ledGeo = new THREE.SphereGeometry(0.075, 14, 10);
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.18 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 });
    this.groupColor = (b) => (b === 31 ? 0xff3b3b : b >= 23 ? 0xffb547 : 0x3fd8ff);
    for (let k = 0; k < 32; k++) {
      const bit = 31 - k;
      const x = this.bitX(bit);
      const g = new THREE.Group(); g.position.set(x, -1.75, 0.05); panel.add(g);
      const base = new THREE.Mesh(swBase, black); g.add(base);
      const lv = new THREE.Group(); lv.position.z = 0.06; g.add(lv);
      const lm = new THREE.Mesh(lever, chrome); lm.position.y = 0.2; lv.add(lm);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), chrome); tip.position.y = 0.42; lv.add(tip);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.5), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.1; g.add(hit);
      hit.userData.bit = bit; base.userData.bit = bit; lm.userData.bit = bit;
      g.userData = { bit, lever: lv, target: 0, cur: 0 };
      this.switches.push(g);
      const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0x220000 }));
      led.position.set(x, -0.95, 0.06); panel.add(led);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), color: this.groupColor(bit), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      glow.scale.setScalar(0.55); led.add(glow);
      led.userData = { bit, glow };
      this.leds.push(led);
    }
    // displays: a text readout and a graph screen
    this.disp = canvasPlane(9.2, 1.9, 1472, 304); this.disp.mesh.position.set(-2.2, 0.75, 0.0); panel.add(this.disp.mesh);
    this.graph = canvasPlane(4.2, 3.2, 640, 488); this.graph.mesh.position.set(4.6, 2.0, 0.0); panel.add(this.graph.mesh);
    this.disp2 = canvasPlane(9.2, 1.2, 1472, 192); this.disp2.mesh.position.set(-2.2, 2.6, 0.0); panel.add(this.disp2.mesh);
    for (const d of [this.disp, this.graph, this.disp2]) {
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(d.mesh.geometry.parameters.width + 0.2, d.mesh.geometry.parameters.height + 0.2, 0.08), black);
      bezel.position.copy(d.mesh.position); bezel.position.z -= 0.05; panel.add(bezel);
    }

    this.x = 2.0;
    this.bits = f2i(this.x);
    this.magic = CLASSIC;
    this.step = 0;
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(0, 0); this.smooth = new THREE.Vector2();
    this.classicErr = maxErr(CLASSIC);
    this.drawFace();
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  bitX(bit) {
    const k = 31 - bit;
    let x = -6.1 + k * 0.355;
    if (bit <= 30) x += 0.28; if (bit <= 22) x += 0.28;
    return x;
  },

  glowTex() {
    if (this._glow) return this._glow;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (this._glow = new THREE.CanvasTexture(c));
  },

  drawFace() {
    const { x, c, t } = this.face;
    x.clearRect(0, 0, c.width, c.height);
    const sx = c.width / 14, toPx = (wx) => (wx + 7) * sx;
    x.font = '600 26px "JetBrains Mono", monospace'; x.textAlign = 'center';
    const lab = (txt, a, b, col) => {
      const xa = toPx(this.bitX(a)) - 14, xb = toPx(this.bitX(b)) + 14;
      x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.moveTo(xa, 196); x.lineTo(xa, 210); x.lineTo(xb, 210); x.lineTo(xb, 196); x.stroke();
      x.fillStyle = col; x.fillText(txt, (xa + xb) / 2, 250);
    };
    lab('SIGN', 31, 31, '#ff5b5b'); lab('EXPONENT · 8 BITS', 30, 23, '#ffb547'); lab('MANTISSA · 23 BITS', 22, 0, '#3fd8ff');
    x.font = '500 17px "JetBrains Mono", monospace'; x.fillStyle = 'rgba(255,255,255,0.5)';
    for (let b = 31; b >= 0; b--) x.fillText(String(b), toPx(this.bitX(b)), 30);
    x.textAlign = 'left'; x.font = '600 20px "JetBrains Mono", monospace'; x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillText('MoG FLOATING POINT UNIT · MODEL 754', 30, 278);
    t.needsUpdate = true;
  },

  setAspect(a) {
    this.cam.aspect = a;
    // keep the 15-unit-wide panel in view on narrow screens
    const vFov = 38, needW = window.innerWidth < 760 ? 15 : 21.5, needH = 11.5;
    const dist = Math.max(needH / 2 / Math.tan(THREE.MathUtils.degToRad(vFov / 2)), needW / 2 / Math.tan(THREE.MathUtils.degToRad(vFov / 2)) / a);
    this.dist = dist + 0.5;
    this.cam.updateProjectionMatrix();
  },

  enter(app) {
    this.buildControls();
    app.ui.showChrome(true);
    this.refresh();
  },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Fast inverse √');
    this.obj = [ui.objective('Flip a switch on the panel'), ui.objective('Run the trick to the end'), ui.objective('Try to beat the constant')];
    const r = ui.row();
    [0.25, 1, 2, 10, 100].forEach((v) => ui.button('x = ' + v, () => { this.x = v; this.bits = f2i(v); this.step = 0; this.refresh(); }, r));
    const r2 = ui.row();
    this.stepBtn = ui.button('Step ▶', () => this.advance(), r2, 'on');
    ui.button('Reset', () => { this.step = 0; this.bits = f2i(this.x); this.refresh(); }, r2);
    ui.hint('Beat the constant: slide to choose your own magic number. Lower worst-case error wins.');
    this.magicSlider = ui.slider('Magic constant', { min: 0x5F370000, max: 0x5F380000, step: 1, value: CLASSIC, fmt: (v) => hex(v) }, (v) => {
      this.magic = Math.round(v) >>> 0; this.obj[2].done();
      const e = maxErr(this.magic);
      if (e < this.classicErr - 1e-7) { this.app.secret('beatconst', 'Better than 1999', `${hex(this.magic)}: worst error ${(e * 100).toFixed(4)}% vs ${(this.classicErr * 100).toFixed(4)}%.`); }
      this.app.state.stat('magicErr', e, (a, b) => b < a);
      this.refresh();
    });
    const r3 = ui.row();
    ui.button('Use 0x5F3759DF', () => { this.magicSlider.set(CLASSIC, true); }, r3);
    this.read = ui.readout();
  },

  // the trick, one stage at a time
  advance() {
    const app = this.app;
    if (this.step >= 6) return;
    this.step = this.step + 1;
    const x = i2f(this.xBits ?? this.bits);
    if (this.step === 1) { this.xBits = this.bits; }
    if (this.step === 3) { this.bits = (this.bits >>> 1); app.audio.tone(300, 0.2, { wave: 'square', vel: 0.05, endFreq: 150 }); }
    if (this.step === 4) { this.bits = (this.magic - this.bits) >>> 0; app.audio.tone(500, 0.15, { wave: 'square', vel: 0.05 }); }
    if (this.step === 6) { const xx = i2f(this.xBits); let y = i2f(this.bits); y = y * (1.5 - 0.5 * xx * y * y); this.bits = f2i(y); }
    if (this.step >= 6) { this.obj[1].done(); app.ready(true); this.stepBtn.textContent = 'Done ✓'; }
    else this.stepBtn.textContent = 'Step ▶';
    app.audio.click('modern');
    this.refresh();
  },

  refresh() {
    const xb = this.step === 0 ? this.bits : this.xBits;
    const x = i2f(xb);
    const i1 = xb >>> 1, i2 = (this.magic - i1) >>> 0, y0 = i2f(i2), y1 = y0 * (1.5 - 0.5 * x * y0 * y0), ex = 1 / Math.sqrt(x);
    const S = this.step;
    const lines = [
      [`x = ${x.toPrecision(8)}`, `bits ${hex(xb)}`],
      [`1  read as integer`, `i = ${(xb >>> 0).toLocaleString()}`],
      [`2  the same 32 bits`, `log₂(x) ≈ ${(xb / 8388608 - 127).toFixed(4)}`],
      [`3  shift right by 1`, `i >> 1 = ${hex(i1)}`],
      [`4  subtract from magic`, `${hex(this.magic)} − i = ${hex(i2)}`],
      [`5  read as float again`, `guess y₀ = ${y0.toPrecision(7)}`],
      [`6  one Newton step`, `y₁ = ${y1.toPrecision(7)}   exact ${ex.toPrecision(7)}   error ${(Math.abs(y1 / ex - 1) * 100).toFixed(4)}%`],
    ];
    const d = this.disp, X = d.x;
    X.fillStyle = '#020806'; X.fillRect(0, 0, d.c.width, d.c.height);
    X.font = '600 30px "JetBrains Mono", monospace';
    const show = S === 0 ? [0] : [0, Math.max(1, S - 1), S].filter((v, i, a) => a.indexOf(v) === i);
    show.forEach((k, row) => {
      const active = k === S;
      X.fillStyle = active ? '#7dffb0' : 'rgba(125,255,176,0.45)';
      X.fillText(lines[k][0], 30, 70 + row * 84);
      X.fillStyle = active ? '#ffffff' : 'rgba(255,255,255,0.45)';
      X.fillText(lines[k][1], 560, 70 + row * 84);
    });
    for (let y = 0; y < d.c.height; y += 4) { X.fillStyle = 'rgba(0,0,0,0.25)'; X.fillRect(0, y, d.c.width, 2); }
    d.t.needsUpdate = true;
    // big value display
    const d2 = this.disp2, Y = d2.x;
    Y.fillStyle = '#0a0300'; Y.fillRect(0, 0, d2.c.width, d2.c.height);
    Y.font = '700 92px "JetBrains Mono", monospace'; Y.fillStyle = '#ff8a2a'; Y.shadowColor = '#ff6a00'; Y.shadowBlur = 24;
    const cur = i2f(this.bits);
    const label = S === 0 ? `${cur === 0 && (this.bits >>> 31) ? '-0' : cur.toPrecision(7)}` : S <= 4 ? hex(this.bits) : S === 5 ? y0.toPrecision(7) : y1.toPrecision(7);
    Y.fillText(label, 30, 128); Y.shadowBlur = 0;
    Y.font = '600 26px "JetBrains Mono", monospace'; Y.fillStyle = 'rgba(255,138,42,0.6)';
    Y.fillText(S === 0 ? 'AS A FLOAT' : S <= 4 ? 'AS AN INTEGER' : '≈ 1 / √x', 1150, 128);
    d2.t.needsUpdate = true;
    if (this.bits === 0x80000000) this.app.secret('negzero', 'Negative zero', 'Floating point has two zeros, +0 and −0. They compare equal, but not always behave the same.');
    this.drawGraph(x);
    const e = maxErr(this.magic), e0 = maxErr(this.magic, false);
    this.read && (this.read.textContent = `your constant  ${hex(this.magic)}\nworst error    ${(e * 100).toFixed(4)}%  (with Newton)\n               ${(e0 * 100).toFixed(2)}%  (guess only)\n1999 constant  ${(this.classicErr * 100).toFixed(4)}%\nyour best      ${this.app.state.stats.magicErr !== undefined ? (this.app.state.stats.magicErr * 100).toFixed(4) + '%' : '—'}`);
  },

  drawGraph(xv) {
    const g = this.graph, X = g.x, W = g.c.width, H = g.c.height;
    X.fillStyle = '#020610'; X.fillRect(0, 0, W, H);
    X.strokeStyle = 'rgba(80,140,255,0.15)'; X.lineWidth = 1;
    for (let i = 0; i <= 8; i++) { X.beginPath(); X.moveTo(i * W / 8, 0); X.lineTo(i * W / 8, H); X.stroke(); X.beginPath(); X.moveTo(0, i * H / 8); X.lineTo(W, i * H / 8); X.stroke(); }
    // relative error of the guess (no Newton) across x in [0.01, 100], log scale
    const plot = (fn, col, w) => {
      X.strokeStyle = col; X.lineWidth = w; X.beginPath();
      for (let k = 0; k <= 400; k++) { const x = Math.pow(10, -2 + k / 100); const v = fn(x); const px = k / 400 * W, py = H / 2 - v * H * 4.5; k ? X.lineTo(px, py) : X.moveTo(px, py); }
      X.stroke();
    };
    plot((x) => fastInv(x, CLASSIC, false) * Math.sqrt(x) - 1, 'rgba(255,255,255,0.35)', 2);
    plot((x) => fastInv(x, this.magic, false) * Math.sqrt(x) - 1, '#3fd8ff', 3);
    plot((x) => (fastInv(x, this.magic, true) * Math.sqrt(x) - 1) * 10, '#7dffb0', 3);
    X.strokeStyle = 'rgba(255,255,255,0.4)'; X.beginPath(); X.moveTo(0, H / 2); X.lineTo(W, H / 2); X.stroke();
    if (xv > 0.01 && xv < 100) { const px = (Math.log10(xv) + 2) / 4 * W; X.strokeStyle = '#ff8a2a'; X.setLineDash([6, 6]); X.beginPath(); X.moveTo(px, 0); X.lineTo(px, H); X.stroke(); X.setLineDash([]); }
    X.font = '600 20px "JetBrains Mono", monospace';
    X.fillStyle = '#3fd8ff'; X.fillText('guess error', 14, 28);
    X.fillStyle = '#7dffb0'; X.fillText('after Newton ×10', 14, 54);
    X.fillStyle = 'rgba(255,255,255,0.5)'; X.fillText('x: 0.01 → 100 (log)', 14, H - 14);
    X.fillText('±5.5%', W - 90, 28);
    g.t.needsUpdate = true;
  },

  pointer(type, p, e, app) {
    this.mouse.set(p.nx, p.ny);
    if (type !== 'down') return;
    this.ray.setFromCamera(this.mouse, this.cam);
    const hit = this.ray.intersectObjects(this.switches, true).find((h) => h.object.userData.bit !== undefined);
    if (hit) {
      const bit = hit.object.userData.bit;
      if (this.step !== 0) { this.step = 0; this.stepBtn && (this.stepBtn.textContent = 'Step ▶'); }
      this.bits = (this.bits ^ (1 << bit)) >>> 0;
      this.x = i2f(this.bits);
      app.audio.noiseBurst(0.03, { freq: 2500, q: 3, vel: 0.35 }); app.audio.tone(90, 0.05, { wave: 'sine', vel: 0.25 });
      this.obj[0].done();
      this.refresh();
    }
  },

  update(dt, t) {
    this.smooth.lerp(this.mouse, 1 - Math.exp(-dt * 2.5));
    this.cam.position.set(this.smooth.x * 1.2, 0.6 + this.smooth.y * 0.6, this.dist);
    this.cam.lookAt(0, 0.4, 0);
    for (const s of this.switches) {
      const on = (this.bits >>> s.userData.bit) & 1;
      s.userData.cur += ((on ? -0.5 : 0.5) - s.userData.cur) * (1 - Math.exp(-dt * 18));
      s.userData.lever.rotation.x = s.userData.cur;
    }
    for (const l of this.leds) {
      const on = (this.bits >>> l.userData.bit) & 1;
      const col = this.groupColor(l.userData.bit);
      l.material.color.set(on ? col : 0x140808);
      l.userData.glow.material.opacity += ((on ? 1 : 0) - l.userData.glow.material.opacity) * (1 - Math.exp(-dt * 14));
    }
  },

  render(renderer, target) { renderer.setRenderTarget(target); renderer.render(this.scene, this.cam); },
};
