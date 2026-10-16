import * as THREE from 'three';
import { Room } from '../app/Room.js';
import { glowTexture } from '../gfx/three-utils.js';
import { fitCamera } from '../gfx/fit.js';
import { seeded, damp } from '../core/math.js';

// ROOM 10 · The magic number.
// A front panel with 32 real switches: the bits of one decimal number.
// Run the famous 1/√x shortcut on it one step at a time and watch the bits
// move, then try to find a better constant than the one from 1999.

const buf = new DataView(new ArrayBuffer(4));
const f2i = (f) => { buf.setFloat32(0, f); return buf.getUint32(0); };
const i2f = (i) => { buf.setUint32(0, i >>> 0); return buf.getFloat32(0); };
const hex = (i) => '0x' + (i >>> 0).toString(16).toUpperCase().padStart(8, '0');
const CLASSIC = 0x5F3759DF;
const GRAPH_X0 = 0.2, GRAPH_DECADES = 2;   // the error graph spans x = 0.2 … 20
const SIGN = 0xff4d4d, EXP = 0xffb547, MAN = 0x3fd8ff;
const groupColor = (bit) => (bit === 31 ? SIGN : bit >= 23 ? EXP : MAN);

function fastInv(x, magic, newton = true) {
  let y = i2f((magic - (f2i(x) >>> 1)) >>> 0);
  if (newton) y *= 1.5 - 0.5 * x * y * y;
  return y;
}

/** Worst relative error of the shortcut over x in [0.01, 100]. */
function maxErr(magic, newton = true) {
  let m = 0;
  for (let k = 0; k <= 600; k++) {
    const x = Math.pow(10, -2 + (k / 600) * 4);
    m = Math.max(m, Math.abs(fastInv(x, magic, newton) * Math.sqrt(x) - 1));
  }
  return m;
}

function canvasPlane(w, h, pxW, pxH) {
  const c = document.createElement('canvas'); c.width = pxW; c.height = pxH;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  return { mesh, c, x: c.getContext('2d'), t, w, h };
}

const bitX = (bit) => {
  const k = 31 - bit;
  return -6.1 + k * 0.355 + (bit <= 30 ? 0.28 : 0) + (bit <= 22 ? 0.28 : 0);
};

const STEPS = [
  { label: 'x', as: 'AS A NUMBER' },
  { label: '1 · read the same bits as a whole number', as: 'AS A WHOLE NUMBER' },
  { label: '2 · shift every bit one place right (halve it)', as: 'HALVED' },
  { label: '3 · subtract it from the magic number', as: 'MAGIC − IT' },
  { label: '4 · read the bits as a decimal number again', as: 'FIRST GUESS ≈ 1/√x' },
  { label: '5 · one correction step', as: '≈ 1/√x' },
];

export default (app) => new MagicRoom(app, {
  id: 'magic', title: 'The Magic Number', years: '1999', music: 'fm',
  secrets: [
    { id: 'beatconst', title: 'Better than 1999', hint: 'Find a magic constant with a smaller worst-case error than 0x5F3759DF.', desc: 'Mathematicians later found slightly better constants. So did you.' },
    { id: 'negzero', title: 'Negative zero', hint: 'Flip only the sign bit of zero.', desc: 'Floating point has two zeros: +0 and −0.' },
  ],
  notes: [
    { title: 'How a computer stores 3.14', body: [
      'A 32-bit floating point number is scientific notation in binary: 1 bit for the sign, 8 bits for the exponent (how big), 23 bits for the digits (the mantissa).',
      { eq: 'value = (−1)^sign × 1.mantissa × 2^(exponent − 127)' },
      'The switches on the panel are those 32 bits. Red is the sign, amber the exponent, blue the mantissa.',
    ] },
    { title: 'The trick', body: [
      'Because the exponent sits in the high bits, reading a float’s bits as a plain whole number gives, roughly, a scaled logarithm of it. 1/√x is x to the power −½, so its logarithm is −½ × log(x): halve and negate.',
      { eq: 'i = bits_of(x)              read the float as an integer\ni = MAGIC − (i >> 1)        halve and negate the logarithm\ny = float_from_bits(i)      a first guess at 1/√x\ny = y × (1.5 − 0.5·x·y·y)   one Newton step to refine it' },
      'The shift halves the logarithm; subtracting from the constant negates it and fixes the offset. One step of Newton’s method brings the guess within about 0.2%.',
    ] },
    { title: 'Where it came from', body: [
      'The routine became famous when the source code of a 1999 first-person shooter was released in 2005 and programmers puzzled over the unexplained constant. It traces back to late-1980s graphics workstation programmers. A 2003 analysis showed slightly better constants exist, such as 0x5F375A86.',
    ] },
    { title: 'Why it mattered, and why it does not now', body: [
      'Lighting needs arrows of length one (normals), and shrinking an arrow to length one needs 1/√(x² + y² + z²). In the late 1990s a square root and a division cost dozens of cycles; this trick used a shift, a subtraction and a few multiplies.',
      'Processors soon gained a dedicated instruction for it, and every shader language has inversesqrt() built in. The hack is history, but a beautiful piece of it.',
    ] },
  ],
});

class MagicRoom extends Room {
  constructor(app, meta) { super(app, meta); this.kind = 'scene'; }
  get camera() { return this.cam; }

  async load() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x050508);
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    s.add(this.makeStars());
    s.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xfff0e0, 2.6); key.position.set(-4, 6, 8); s.add(key);
    const rim = new THREE.DirectionalLight(0x7090ff, 0.8); rim.position.set(6, 3, -4); s.add(rim);

    const panel = (this.panel = new THREE.Group()); s.add(panel);
    const metal = new THREE.MeshStandardMaterial({ color: 0x34363e, roughness: 0.42, metalness: 0.6 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(14.2, 8.4, 0.6), metal);
    chassis.position.set(0, 0.4, -0.35); panel.add(chassis);
    const screwMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.9, roughness: 0.3 });
    const screwGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const scr = new THREE.Mesh(screwGeo, screwMat);
      scr.rotation.x = Math.PI / 2; scr.position.set(sx * 6.75, 0.4 + sy * 3.85, 0); panel.add(scr);
    }

    this.face = canvasPlane(14, 1.5, 1792, 192);
    this.face.mesh.material.transparent = true;
    this.face.mesh.position.set(0, -2.75, 0.005); panel.add(this.face.mesh);
    this.drawFace();

    // switches and their lamps
    this.switches = []; this.leds = []; this.hits = [];
    const swBase = new THREE.BoxGeometry(0.22, 0.34, 0.12), lever = new THREE.CylinderGeometry(0.035, 0.05, 0.42, 10);
    const tipGeo = new THREE.SphereGeometry(0.06, 10, 8), ledGeo = new THREE.SphereGeometry(0.075, 14, 10);
    const hitGeo = new THREE.BoxGeometry(0.32, 1.5, 0.5), hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.18 });
    const black = (this.black = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 }));
    for (let bit = 31; bit >= 0; bit--) {
      const x = bitX(bit);
      const g = new THREE.Group(); g.position.set(x, -1.75, 0.05); panel.add(g);
      g.add(new THREE.Mesh(swBase, black));
      const lv = new THREE.Group(); lv.position.z = 0.06; g.add(lv);
      const lm = new THREE.Mesh(lever, chrome); lm.position.y = 0.2; lv.add(lm);
      const tip = new THREE.Mesh(tipGeo, chrome); tip.position.y = 0.42; lv.add(tip);
      const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.y = 0.35; hit.userData.bit = bit; g.add(hit);
      this.hits.push(hit);
      this.switches.push({ bit, lever: lv, cur: 0.5 });
      const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0x220000 }));
      led.position.set(x, -0.95, 0.06); panel.add(led);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: groupColor(bit), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      glow.scale.setScalar(0.55); led.add(glow);
      this.leds.push({ bit, mesh: led, glow, base: x });
    }

    // the step list, the big number, and the error graph
    this.disp = canvasPlane(9.2, 1.9, 1472, 304); this.disp.mesh.position.set(-2.2, 0.75, 0.01); panel.add(this.disp.mesh);
    this.disp2 = canvasPlane(9.2, 1.2, 1472, 192); this.disp2.mesh.position.set(-2.2, 2.6, 0.01); panel.add(this.disp2.mesh);
    this.graph = canvasPlane(4.2, 3.2, 640, 488); this.graph.mesh.position.set(4.6, 2.0, 0.01); panel.add(this.graph.mesh);
    for (const d of [this.disp, this.graph, this.disp2]) {
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.2, d.h + 0.2, 0.08), black);
      bezel.position.copy(d.mesh.position); bezel.position.z -= 0.05; panel.add(bezel);
    }

    this.classicErr = maxErr(CLASSIC);
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(); this.smooth = new THREE.Vector2();
  }

  makeStars() {
    const rnd = seeded(9), n = 600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), r = 40 + rnd() * 20;
      pos.set([Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r, -Math.abs(Math.sin(ph) * Math.sin(th) * r)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0x506080, size: 0.18, sizeAttenuation: true }));
  }

  drawFace() {
    const { x, c, t } = this.face;
    x.clearRect(0, 0, c.width, c.height);
    const sx = c.width / 14, toPx = (wx) => (wx + 7) * sx;
    x.font = '600 26px "JetBrains Mono", monospace'; x.textAlign = 'center';
    const lab = (txt, a, b, col) => {
      const xa = toPx(bitX(a)) - 14, xb = toPx(bitX(b)) + 14;
      x.strokeStyle = col; x.lineWidth = 3;
      x.beginPath(); x.moveTo(xa, 66); x.lineTo(xa, 80); x.lineTo(xb, 80); x.lineTo(xb, 66); x.stroke();
      x.fillStyle = col; x.fillText(txt, (xa + xb) / 2, 124);
    };
    lab('±', 31, 31, '#ff5b5b'); lab('HOW BIG', 30, 23, '#ffb547'); lab('THE DIGITS', 22, 0, '#3fd8ff');
    x.font = '500 17px "JetBrains Mono", monospace'; x.fillStyle = 'rgba(255,255,255,0.45)';
    for (let b = 31; b >= 0; b--) x.fillText(String(b), toPx(bitX(b)), 34);
    t.needsUpdate = true;
  }

  enter(scope) {
    this.view = null;   // re-frame once the tray is in place
    this.x = 2; this.bits = f2i(2); this.xBits = this.bits; this.magic = CLASSIC; this.step = 0;
    this.shiftAnim = 0;
    this.scope = scope;
    const tray = this.app.chrome.tray(scope, 'Fast 1/√x');
    tray.segmented('x =', [0.25, 1, 2, 10, 100].map((v) => ({ value: v, label: String(v) })), 2, (v) => { this.pause(); this.setX(v); });
    this.stepBtn = tray.button('Next step ▶', () => { this.pause(); this.advance(); });
    tray.button('Start over', () => { this.pause(); this.setX(i2f(this.xBits)); });
    this.magicSlider = tray.slider('Magic number', { min: 0x5F370000, max: 0x5F380000, step: 1, value: CLASSIC, format: hex }, (v) => { this.pause(); this.setMagic(v); });
    tray.button('Back to 0x5F3759DF', () => { this.magicSlider.set(CLASSIC); this.setMagic(CLASSIC); });
    this.readout = tray.readout();

    this.tour = this.startTour(scope, [
      { caption: 'These 32 switches are one number: 2.0, stored the way a computer stores it.', duration: 7,
        enter: () => this.setX(2) },
      { caption: 'Red is the sign, amber how big, blue the digits. Flip any switch.', duration: 7,
        enter: () => this.setX(2) },
      { caption: 'The trick: read the bits as a whole number, slide them one place right…', duration: 7,
        enter: () => this.runTo(2) },
      { caption: '…subtract from a magic number, and read it back. Almost 1 ÷ √2.', duration: 7,
        enter: () => this.runTo(4) },
      { caption: 'One correction later it is off by less than 0.2%. No square root needed.', duration: 7,
        enter: () => this.runTo(5) },
      { caption: 'Your turn: flip switches, step through it, or find a better magic number.',
        enter: () => {} },
    ]);
    this.refresh();
  }

  pause() { this.tour?.pause(); }

  setX(v) {
    this.run = (this.run || 0) + 1;   // cancel any replay in progress
    this.x = v; this.bits = f2i(v); this.xBits = this.bits; this.step = 0;
    this.refresh();
  }

  setMagic(v) {
    this.magic = Math.round(v) >>> 0;
    const e = maxErr(this.magic);
    if (e < this.classicErr - 1e-7) this.app.secret('beatconst', 'Better than 1999', `${hex(this.magic)}: worst error ${(e * 100).toFixed(4)}% vs ${(this.classicErr * 100).toFixed(4)}%.`);
    this.app.state.record('magicErr', e, true);
    if (this.step >= 3) this.runTo(this.step, true);
    else this.refresh();
  }

  /** Replay the trick from x up to step `n`, animating only the last step. */
  async runTo(n, instant = false) {
    const run = (this.run = (this.run || 0) + 1);
    this.bits = this.xBits; this.step = 0;
    while (this.step < n && this.run === run) {
      this.advance(instant || this.step < n - 1);
      if (!instant && this.step < n && !(await this.scope.wait(0.9))) return;
    }
    if (instant) this.refresh();
  }

  advance(quiet = false) {
    if (this.step >= 5) return;
    this.step++;
    const a = this.app.audio;
    if (this.step === 2) { this.bits >>>= 1; this.shiftAnim = quiet ? 0 : 1; if (!quiet) a.tone(300, 0.25, { wave: 'square', vel: 0.05, endFreq: 150 }); }
    if (this.step === 3) { this.bits = (this.magic - this.bits) >>> 0; if (!quiet) a.tone(500, 0.15, { wave: 'square', vel: 0.05 }); }
    if (this.step === 5) {
      const x = i2f(this.xBits); let y = i2f(this.bits);
      y *= 1.5 - 0.5 * x * y * y; this.bits = f2i(y);
      if (!quiet) a.chime([72, 79, 84], 'triangle', 0.05);
    }
    if (!quiet) a.button();
    this.refresh();
  }

  refresh() {
    const S = this.step, xb = this.xBits, x = i2f(xb);
    if (this.stepBtn) this.stepBtn.el.textContent = S >= 5 ? 'Done ✓' : 'Next step ▶';
    const i1 = xb >>> 1, i2 = (this.magic - i1) >>> 0, y0 = i2f(i2), y1 = y0 * (1.5 - 0.5 * x * y0 * y0), ex = 1 / Math.sqrt(x);
    const values = [fmt(x, xb), (xb >>> 0).toLocaleString('en-US'), (i1 >>> 0).toLocaleString('en-US'), (i2 >>> 0).toLocaleString('en-US'), y0.toPrecision(6), y1.toPrecision(6)];

    // the step list
    const d = this.disp, X = d.x;
    X.fillStyle = '#020806'; X.fillRect(0, 0, d.c.width, d.c.height);
    X.font = '600 30px "JetBrains Mono", monospace';
    const first = Math.max(0, Math.min(S - 1, STEPS.length - 3));
    for (let row = 0; row < 3; row++) {
      const k = first + row; if (k >= STEPS.length) break;
      const active = k === S, past = k < S;
      X.fillStyle = active ? '#7dffb0' : past ? 'rgba(125,255,176,0.45)' : 'rgba(125,255,176,0.16)';
      X.fillText(k === 0 ? 'start with x' : STEPS[k].label, 30, 70 + row * 84);
      X.fillStyle = active ? '#ffffff' : past ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)';
      X.textAlign = 'right'; X.fillText(k <= S ? values[k] : '', d.c.width - 30, 70 + row * 84); X.textAlign = 'left';
    }
    for (let y = 0; y < d.c.height; y += 4) { X.fillStyle = 'rgba(0,0,0,0.25)'; X.fillRect(0, y, d.c.width, 2); }
    d.t.needsUpdate = true;

    // the big number
    const d2 = this.disp2, Y = d2.x;
    Y.fillStyle = '#0a0300'; Y.fillRect(0, 0, d2.c.width, d2.c.height);
    Y.font = '700 92px "JetBrains Mono", monospace'; Y.fillStyle = '#ff8a2a'; Y.shadowColor = '#ff6a00'; Y.shadowBlur = 24;
    Y.fillText(S === 0 ? fmt(i2f(this.bits), this.bits) : values[S], 30, 128); Y.shadowBlur = 0;
    Y.font = '600 26px "JetBrains Mono", monospace'; Y.fillStyle = 'rgba(255,138,42,0.6)'; Y.textAlign = 'right';
    Y.fillText(STEPS[S].as, d2.c.width - 30, 128); Y.textAlign = 'left';
    if (S === 5) { Y.fillStyle = 'rgba(255,255,255,0.5)'; Y.fillText(`exact ${ex.toPrecision(6)} · off by ${(Math.abs(y1 / ex - 1) * 100).toFixed(3)}%`, 30, 172); }
    d2.t.needsUpdate = true;

    if (this.bits === 0x80000000) this.app.secret('negzero', 'Negative zero', 'Floating point has two zeros, +0 and −0. They compare equal, but do not always behave the same.');
    this.drawGraph(x);
    if (this.readout) {
      const e = maxErr(this.magic), best = this.app.state.stats.magicErr;
      this.readout.textContent = `worst error  ${(e * 100).toFixed(4)}%\n1999 number  ${(this.classicErr * 100).toFixed(4)}%\nyour best    ${best !== undefined ? (best * 100).toFixed(4) + '%' : '—'}`;
    }
  }

  drawGraph(xv) {
    const g = this.graph, X = g.x, W = g.c.width, H = g.c.height;
    X.fillStyle = '#020610'; X.fillRect(0, 0, W, H);
    X.strokeStyle = 'rgba(80,140,255,0.15)'; X.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      X.beginPath(); X.moveTo((i * W) / 8, 0); X.lineTo((i * W) / 8, H); X.stroke();
      X.beginPath(); X.moveTo(0, (i * H) / 8); X.lineTo(W, (i * H) / 8); X.stroke();
    }
    const plot = (fn, col, lw) => {
      X.strokeStyle = col; X.lineWidth = lw; X.beginPath();
      for (let k = 0; k <= 400; k++) {
        const x = GRAPH_X0 * Math.pow(10, (k / 400) * GRAPH_DECADES), px = (k / 400) * W, py = H / 2 - fn(x) * H * 4.5;
        k ? X.lineTo(px, py) : X.moveTo(px, py);
      }
      X.stroke();
    };
    plot((x) => fastInv(x, CLASSIC, false) * Math.sqrt(x) - 1, 'rgba(255,255,255,0.3)', 2);
    plot((x) => fastInv(x, this.magic, false) * Math.sqrt(x) - 1, '#3fd8ff', 3);
    plot((x) => (fastInv(x, this.magic, true) * Math.sqrt(x) - 1) * 10, '#7dffb0', 3);
    X.strokeStyle = 'rgba(255,255,255,0.4)'; X.beginPath(); X.moveTo(0, H / 2); X.lineTo(W, H / 2); X.stroke();
    if (xv > GRAPH_X0 && xv < GRAPH_X0 * 10 ** GRAPH_DECADES) {
      const px = (Math.log10(xv / GRAPH_X0) / GRAPH_DECADES) * W;
      X.strokeStyle = '#ff8a2a'; X.setLineDash([6, 6]); X.beginPath(); X.moveTo(px, 0); X.lineTo(px, H); X.stroke(); X.setLineDash([]);
    }
    X.font = '600 22px "JetBrains Mono", monospace';
    X.fillStyle = '#3fd8ff'; X.fillText('first guess', 14, 30);
    X.fillStyle = '#7dffb0'; X.fillText('after correction ×10', 14, 58);
    X.fillStyle = 'rgba(255,255,255,0.5)'; X.fillText(`how wrong, for x from ${GRAPH_X0} to ${GRAPH_X0 * 10 ** GRAPH_DECADES}`, 14, H - 14);
    g.t.needsUpdate = true;
  }

  pointer(e) {
    this.mouse.set(e.nx, e.ny);
    if (e.type !== 'down') return;
    this.ray.setFromCamera(this.mouse, this.cam);
    const hit = this.ray.intersectObjects(this.hits, false)[0];
    if (!hit) return;
    this.pause();
    this.bits = (this.bits ^ (1 << hit.object.userData.bit)) >>> 0;
    this.run = (this.run || 0) + 1;
    this.xBits = this.bits; this.x = i2f(this.bits); this.step = 0;
    this.app.audio.noiseBurst(0.03, { freq: 2500, q: 3, vel: 0.35 });
    this.app.audio.tone(90, 0.05, { wave: 'sine', vel: 0.25 });
    this.refresh();
  }

  pickables() { return this.hits || []; }

  /** Frame the panel in the space the HUD, tray and caption leave free. */
  frame() {
    const corners = [[-7.1, -3.8], [7.1, -3.8], [7.1, 4.6], [-7.1, 4.6]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    this.view = fitCamera(this.cam, corners, new THREE.Vector3(0, 0, -1), { margin: 1.03 });
  }

  update(dt) {
    if (!this.view || this._w !== window.innerWidth || this._h !== window.innerHeight) {
      this._w = window.innerWidth; this._h = window.innerHeight; this.frame();
    }
    // a little parallax from the pointer, so the switches read as real objects
    this.smooth.lerp(this.mouse, 1 - Math.exp(-dt * 2.5));
    const { position, look } = this.view;
    this.cam.position.set(position.x + this.smooth.x * 0.8, position.y + this.smooth.y * 0.4, position.z);
    this.cam.lookAt(look);

    // the shift: the lamps slide one place to the right while the bits change
    this.shiftAnim = damp(this.shiftAnim, 0, 4, dt);
    for (const s of this.switches) {
      const on = (this.bits >>> s.bit) & 1;
      s.cur = damp(s.cur, on ? -0.5 : 0.5, 18, dt);
      s.lever.rotation.x = s.cur;
    }
    for (const l of this.leds) {
      const on = (this.bits >>> l.bit) & 1;
      const next = l.bit < 31 ? bitX(l.bit) : l.base, prev = l.bit < 31 ? bitX(l.bit + 1) : l.base;
      l.mesh.position.x = l.base + (prev - next) * this.shiftAnim;
      l.mesh.material.color.set(on ? groupColor(l.bit) : 0x140808);
      l.glow.material.opacity = damp(l.glow.material.opacity, on ? 1 : 0, 14, dt);
    }
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }

}

function fmt(v, bits) {
  if (v === 0 && bits >>> 31) return '-0';
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'not a number' : v > 0 ? 'infinity' : '-infinity';
  return Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(4) : String(+v.toPrecision(7));
}
