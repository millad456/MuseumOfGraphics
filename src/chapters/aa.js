import * as THREE from 'three';
import { Orbit, makeGrid } from '../gfx/lab.js';

// ROOM 11 — The jaggies. The scene is rendered with deliberately huge pixels
// so the staircase is obvious, then fixed with supersampling or MSAA. A
// sample-pattern lab shows where each method actually looks inside a pixel.

const PATTERNS = {
  '1×': [[0.5, 0.5]],
  '4× grid': [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  '4× rotated': [[0.375, 0.125], [0.875, 0.375], [0.125, 0.625], [0.625, 0.875]],
  '8×': [[1, -3], [-1, 3], [5, 1], [-3, -5], [-5, 5], [-7, -1], [3, 7], [7, -7]].map(([x, y]) => [x / 16 + 0.5, y / 16 + 0.5]),
  '16×': Array.from({ length: 16 }, (_, i) => [((i % 4) + 0.5 + (((i * 7) % 5) - 2) * 0.08) / 4, (Math.floor(i / 4) + 0.5 + (((i * 3) % 5) - 2) * 0.08) / 4]),
};

const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uSrcRes; uniform int uK;
varying vec2 vUv;
void main(){
  vec2 base = floor(vUv * uSrcRes / float(uK)) * float(uK);
  vec3 s = vec3(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    if (x >= uK || y >= uK) continue;
    s += texture2D(tSrc, (base + vec2(x, y) + 0.5) / uSrcRes).rgb;
  }
  gl_FragColor = vec4(s / float(uK * uK), 1.0);
}`;
const BLIT = /* glsl */`
uniform sampler2D tSrc; uniform float uGrid; uniform vec2 uRes;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  vec2 f = fract(vUv * uRes);
  float g = step(f.x, 0.06) + step(f.y, 0.06);
  c *= 1.0 - min(g, 1.0) * uGrid * 0.5;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
const QV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export default {
  id: 'aa', title: 'The Jaggies', year: '1977–2009', tagline: 'A pixel is a square, but the world is not made of squares.',
  mode: 'world', ui: 'gloss07', music: 'lush',
  secrets: [
    { id: 'axis', title: 'No staircase', hint: 'In the sample lab, make the edge perfectly horizontal or vertical.', desc: 'Axis-aligned edges line up with the pixel grid, so they never alias.' },
  ],
  notes: [
    {
      title: 'Where jaggies come from', meta: 'Aliasing',
      body: `<p>The rasterizer tests one point per pixel, the centre. That point is either inside the triangle or not, so every pixel is all-or-nothing. A smooth slanted edge turns into a staircase, and as things move, the stairs crawl and sparkle.</p><p>The pixels here are made deliberately enormous so you can see it. Shrink them with <b>Pixel size</b>: the problem gets smaller but never disappears.</p>`,
    },
    {
      title: 'Supersampling', meta: 'Brute force',
      body: `<p>Render the image at 2× or 4× the resolution, then average each block down to one pixel. Edge pixels get partial colours, so the staircase softens into a gradient. It is the most accurate fix and the most expensive: 4 × 4 supersampling shades sixteen times as many pixels.</p>`,
    },
    {
      title: 'Multisampling', meta: 'MSAA',
      body: `<p>Insight: aliasing only happens at triangle edges. So test coverage at several points inside each pixel, but run the expensive colour calculation only once. Edges get smooth, flat interiors cost almost nothing extra.</p><p>Where the sample points sit matters. A <b>rotated grid</b> handles nearly-horizontal and nearly-vertical edges far better than a square grid of the same count. Compare them in the lab.</p>`,
    },
    {
      title: 'Cheating with time', meta: 'FXAA & TAA',
      body: `<p>From 2009 on, games often used a post-process instead: find edges in the finished image and blur along them (FXAA). Modern renderers jitter the camera by a fraction of a pixel every frame and blend the frames together (temporal AA), which gives many samples per pixel spread across time. Today's upscalers build on the same idea.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x0b0b10);
    this.cam = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.orbit = new Orbit(this.cam, { dist: 9, theta: 0.3, phi: 1.2, target: new THREE.Vector3(0, 1, 0) });
    this.orbit.auto = 0.12;
    s.add(new THREE.AmbientLight(0xffffff, 0.35));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 6, 4); s.add(d);
    const g = makeGrid(0x7ad03a, 0.06, 0.9); g.position.y = -0.4; s.add(g);
    // thin, high-contrast shapes are aliasing's favourite food
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.1 });
    this.star = new THREE.Group(); s.add(this.star); this.star.position.y = 1.3;
    for (let i = 0; i < 24; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.2, 0.05), mat(i % 2 ? 0xffffff : 0x7ad03a));
      bar.rotation.z = (i / 24) * Math.PI; this.star.add(bar);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.06, 8, 120), mat(0xff8a1f)); this.ring.position.y = 1.3; s.add(this.ring);
    this.cube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat(0x3a7bff)); this.cube.position.set(3.2, 0.3, 0.5); s.add(this.cube);
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 4), mat(0xff3b7a)); this.cone.position.set(-3.1, 0.4, 0.2); s.add(this.cone);

    this.k = 1; this.msaa = false; this.pxSize = 7; this.gridOn = true;
    this.rtHi = new THREE.WebGLRenderTarget(4, 4);
    this.rtMs = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
    this.rtLo = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.down = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uSrcRes: { value: new THREE.Vector2() }, uK: { value: 1 } }, vertexShader: QV, fragmentShader: DOWN });
    this.blit = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uGrid: { value: 1 }, uRes: { value: new THREE.Vector2() } }, vertexShader: QV, fragmentShader: BLIT });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.down);
    this.qs = new THREE.Scene(); this.qs.add(this.quad); this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); this.sized = false; },

  sizeTargets(renderer) {
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const px = this.pxSize * Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(8, Math.floor(W / px)), h = Math.max(6, Math.floor(H / px));
    const key = `${w}x${h}x${this.k}`;
    if (this._key === key) return;
    this._key = key;
    this.rtLo.setSize(w, h); this.rtMs.setSize(w, h); this.rtHi.setSize(w * this.k, h * this.k);
    this.lo = [w, h];
  },

  enter(app) {
    this.buildControls();
    this.buildLab();
    app.ui.showChrome(true);
  },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Anti-aliasing');
    this.obj = [ui.objective('Turn on any anti-aliasing'), ui.objective('Compare sample patterns in the lab')];
    ui.segmented('Method', [{ v: 'none', l: 'None' }, { v: 'ss2', l: 'SSAA 2×2' }, { v: 'ss4', l: 'SSAA 4×4' }, { v: 'msaa', l: 'MSAA 4×' }], 'none', (v) => {
      this.k = v === 'ss2' ? 2 : v === 'ss4' ? 4 : 1; this.msaa = v === 'msaa'; this._key = null;
      if (v !== 'none') { this.obj[0].done(); this.app.ready(true); }
    });
    ui.slider('Pixel size', { min: 1, max: 14, step: 1, value: this.pxSize, fmt: (v) => v + ' px' }, (v) => { this.pxSize = v; this._key = null; });
    const r = ui.row();
    ui.toggle('Pixel grid', this.gridOn, (v) => (this.gridOn = v), r);
    ui.toggle('Spin', true, (v) => (this.orbit.auto = v ? 0.12 : 0), r);
    this.read = ui.readout();
  },

  buildLab() {
    const bd = this.app.ui.extraWindow('Inside a pixel', { left: 14, bottom: 70 }, 360);
    this.GW = 12; this.GH = 8; this.cell = 28;
    const cv = (this.labCv = document.createElement('canvas')); cv.width = this.GW * this.cell; cv.height = this.GH * this.cell;
    cv.style.cssText = 'width:100%;height:auto;display:block;touch-action:none;cursor:crosshair;border-radius:6px';
    bd.appendChild(cv);
    this.pattern = '4× rotated';
    this.labSeg = this.app.ui.segmented('', Object.keys(PATTERNS).map((k) => ({ v: k, l: k })), this.pattern, (v) => { this.pattern = v; (this.triedP = this.triedP || new Set()).add(v); if (this.triedP.size >= 2) this.obj[1].done(); }, bd);
    this.labRead = document.createElement('div'); this.labRead.className = 'readout'; bd.appendChild(this.labRead);
    this.E = this.E || [[0.6, 6.7], [11.4, 2.1]];
    const toG = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / b.width * this.GW, (e.clientY - b.top) / b.height * this.GH]; };
    cv.addEventListener('pointerdown', (e) => { const p = toG(e); const d0 = Math.hypot(p[0] - this.E[0][0], p[1] - this.E[0][1]), d1 = Math.hypot(p[0] - this.E[1][0], p[1] - this.E[1][1]); this.dragE = d0 < d1 ? 0 : 1; cv.setPointerCapture(e.pointerId); this.E[this.dragE] = p; });
    cv.addEventListener('pointermove', (e) => { if (this.dragE >= 0 && e.buttons) { const p = toG(e); this.E[this.dragE] = [Math.max(0, Math.min(this.GW, p[0])), Math.max(0, Math.min(this.GH, p[1]))]; } });
    cv.addEventListener('pointerup', () => (this.dragE = -1));
  },

  drawLab() {
    const cv = this.labCv; if (!cv) return;
    const x = cv.getContext('2d'), c = this.cell, [A, B] = this.E;
    // the covered region is everything below the line through A and B
    const side = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    const pts = PATTERNS[this.pattern];
    x.fillStyle = '#0b0b10'; x.fillRect(0, 0, cv.width, cv.height);
    let partial = 0;
    for (let j = 0; j < this.GH; j++) for (let i = 0; i < this.GW; i++) {
      let inside = 0;
      for (const [sx, sy] of pts) if (side([i + sx, j + sy]) > 0) inside++;
      const cov = inside / pts.length;
      if (cov > 0 && cov < 1) partial++;
      const v = Math.round(20 + cov * 200);
      x.fillStyle = `rgb(${Math.round(v * 0.55)},${v},${Math.round(v * 0.3)})`;
      x.fillRect(i * c, j * c, c - 1, c - 1);
      for (const [sx, sy] of pts) {
        const ins = side([i + sx, j + sy]) > 0;
        x.fillStyle = ins ? '#ffffff' : 'rgba(255,255,255,0.28)';
        x.beginPath(); x.arc((i + sx) * c, (j + sy) * c, pts.length > 8 ? 1.6 : 2.4, 0, 7); x.fill();
      }
    }
    // the true edge
    const dx = B[0] - A[0], dy = B[1] - A[1];
    x.strokeStyle = '#ff8a1f'; x.lineWidth = 2; x.beginPath();
    x.moveTo((A[0] - dx * 5) * c, (A[1] - dy * 5) * c); x.lineTo((B[0] + dx * 5) * c, (B[1] + dy * 5) * c); x.stroke();
    for (const p of this.E) { x.fillStyle = '#ff8a1f'; x.beginPath(); x.arc(p[0] * c, p[1] * c, 7, 0, 7); x.fill(); }
    const ang = Math.atan2(-dy, dx) * 57.3;
    this.labRead.textContent = `${pts.length} sample${pts.length > 1 ? 's' : ''} per pixel · ${partial} edge pixels get in-between shades\nedge angle ${ang.toFixed(1)}°`;
    const a = ((ang % 90) + 90) % 90;
    if (a < 0.4 || a > 89.6) this.app.secret('axis', 'No staircase', 'Axis-aligned edges line up with the pixel grid, so they never alias.');
  },

  pointer(type, p, e) { this.orbit.handle(type, p, e); },

  update(dt, t) {
    this.orbit.update(dt);
    this.star.rotation.y += dt * 0.25; this.star.rotation.x = Math.sin(t * 0.2) * 0.3;
    this.ring.rotation.x = t * 0.3; this.ring.rotation.y = t * 0.17;
    this.cube.rotation.set(t * 0.4, t * 0.3, 0); this.cone.rotation.y = t * 0.5;
    this.drawLab();
    if (this.lo) {
      const n = this.lo[0] * this.lo[1];
      const shaded = this.msaa ? n : n * this.k * this.k;
      this.read && (this.read.textContent = `image ${this.lo[0]} × ${this.lo[1]} pixels\nsamples/pixel ${this.msaa ? 4 : this.k * this.k}\ncolour calculations ${shaded.toLocaleString()}\n${this.msaa ? '(MSAA shades once per pixel)' : this.k > 1 ? `(${this.k * this.k}× the work)` : ''}`);
    }
  },

  render(renderer, target) {
    this.sizeTargets(renderer);
    const src = this.msaa ? this.rtMs : this.k > 1 ? this.rtHi : this.rtLo;
    renderer.setRenderTarget(src); renderer.render(this.scene, this.cam);
    if (this.k > 1) {
      this.quad.material = this.down;
      this.down.uniforms.tSrc.value = this.rtHi.texture; this.down.uniforms.uSrcRes.value.set(this.rtHi.width, this.rtHi.height); this.down.uniforms.uK.value = this.k;
      renderer.setRenderTarget(this.rtLo); renderer.render(this.qs, this.qc);
    }
    this.quad.material = this.blit;
    this.blit.uniforms.tSrc.value = (this.msaa ? this.rtMs : this.rtLo).texture;
    (this.msaa ? this.rtMs : this.rtLo).texture.magFilter = THREE.NearestFilter;
    this.blit.uniforms.uGrid.value = this.gridOn && this.pxSize >= 4 ? 1 : 0;
    this.blit.uniforms.uRes.value.set(this.lo[0], this.lo[1]);
    renderer.setRenderTarget(target); renderer.render(this.qs, this.qc);
  },
};
