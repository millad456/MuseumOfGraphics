import * as THREE from 'three';
import { Orbit, makeStars } from '../gfx/lab.js';

// ROOM 12 — Shaders & post-processing. The frame is rendered in HDR, then
// pushed through a chain of tiny programs: bright pass, blur pyramid, bloom
// composite, tone mapping, and a 3x3 convolution kernel you can edit.

const QV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
export const BRIGHT = /* glsl */`
uniform sampler2D tSrc; uniform float uThresh, uKnee; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThresh + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThresh) / max(br, 1e-4); gl_FragColor = vec4(c * w, 1.0); }`;
export const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){ vec2 o = uTexel * 0.5;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + o).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0); }`;
export const UP = /* glsl */`
uniform sampler2D tSrc, tPrev; uniform vec2 uTexel; varying vec2 vUv;
void main(){ vec2 o = uTexel * 0.5; vec3 s = vec3(0.0);
  s += texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  s += (texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb) * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(tPrev, vUv).rgb, 1.0); }`;
const COMPOSITE = /* glsl */`
uniform sampler2D tScene, tBloom; uniform float uBloom, uExposure, uCA, uTemp; uniform int uTone, uStage; varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec2 d = (vUv - 0.5) * uCA;
  vec3 c = vec3(texture2D(tScene, vUv - d).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + d).b);
  vec3 b = texture2D(tBloom, vUv).rgb;
  if (uStage == 1) c = vec3(0.0);
  c = (c + b * uBloom * (uStage == 0 ? 0.0 : 1.0)) * uExposure;
  c *= mix(vec3(1.0), vec3(1.08, 1.0, 0.86), uTemp) * mix(vec3(1.0), vec3(0.86, 0.98, 1.12), -uTemp);
  if (uTone == 1) c = aces(c); else if (uTone == 2) c = c / (1.0 + c); else c = clamp(c, 0.0, 1.0);
  gl_FragColor = vec4(c, 1.0); }`;
const FINAL = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uK[9]; uniform float uKMix, uVig, uGrain, uScan, uTime; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb, k = vec3(0.0);
  for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) k += texture2D(tSrc, vUv + vec2(float(i - 1), float(1 - j)) * uTexel).rgb * uK[j * 3 + i];
  c = mix(c, k, uKMix);
  vec2 v = vUv * (1.0 - vUv.yx); c *= mix(1.0, pow(clamp(v.x * v.y * 15.0, 0.0, 1.0), 0.3), uVig);
  c += (h(vUv * 900.0 + uTime) - 0.5) * uGrain;
  c *= 1.0 - uScan * 0.35 * (0.5 + 0.5 * sin(vUv.y / uTexel.y * 1.5708));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const PRESETS = {
  Identity: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  Blur: [1, 1, 1, 1, 1, 1, 1, 1, 1].map((v) => v / 9),
  Sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  Edges: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  Emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
};

export default {
  id: 'post', title: 'The Glow', year: '2001–2013', tagline: 'Graphics chips became programmable. A frame is no longer the end of the line; it is raw material.',
  mode: 'world', ui: 'flat13', music: 'pulse', journey: 'gpu',
  secrets: [
    { id: 'edge', title: 'You invented edge detection', hint: 'Make a kernel whose numbers add up to exactly zero.', desc: 'A zero-sum kernel cancels flat areas and keeps only change: edges.' },
    { id: 'painter2', title: 'Light painter', hint: 'Paint with light.', desc: 'Values above 1.0 are what make bloom possible.' },
  ],
  notes: [
    {
      title: 'Programs for every pixel', meta: '2001',
      body: `<p>Until about 2001, graphics chips had their lighting and texturing wired in. Then they became programmable: you could write a small program called a <b>shader</b> that runs for every vertex, and another that runs for every pixel, thousands at a time in parallel.</p><p>Everything in this room is a shader: the bright pass, each blur step, the composite and the kernel are each about ten lines of code that run on every pixel, every frame.</p>`,
    },
    {
      title: 'Brighter than white', meta: 'HDR & tone mapping',
      body: `<p>Screens top out at 1.0 (full white), but real light does not. Rendering into a buffer that can store 5.0 or 50.0 keeps the difference between a white wall and the sun. Afterwards, a <b>tone mapping</b> curve squeezes it back into what a screen can show, the way film does.</p><p>Switch tone mapping to <b>Clip</b> and raise exposure: highlights burn flat. Use <b>Filmic</b> and they roll off gently.</p>`,
    },
    {
      title: 'Bloom', meta: 'Mid-2000s',
      body: `<p>Bright lights bleed in real lenses and eyes. Bloom fakes it in three steps: keep only the pixels brighter than a threshold, blur them heavily by shrinking and re-enlarging the image several times, then add the result back on top.</p><div class="eq">final = tonemap( scene + blur( brightpass(scene) ) × strength )</div><p>Turn on <b>Show pipeline</b> to see each intermediate image.</p>`,
    },
    {
      title: 'Convolution kernels', meta: 'Image filters',
      body: `<p>Many filters are a 3 × 3 grid of weights. For every pixel, multiply it and its eight neighbours by the weights and add them up. All ones (divided by 9) blurs. A big centre with negative neighbours sharpens. Weights that add up to zero erase flat areas and keep only edges.</p><p>The same operation, stacked thousands of times with learned weights, is what convolutional neural networks are made of.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x020208);
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.orbit = new Orbit(this.cam, { dist: 13, theta: 0.4, phi: 1.32, target: new THREE.Vector3(0, 2.2, 0), maxPhi: 1.55 });
    this.orbit.auto = 0.05;
    s.add(makeStars(1500, 100, 0xaab0ff));
    s.add(new THREE.AmbientLight(0x404060, 0.3));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x07070c, roughness: 0.18, metalness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; s.add(floor);
    const emit = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
    this.neon = new THREE.Group(); s.add(this.neon);
    const rings = [[0, 2.6, 0, 2.8, 0.05, [6, 0.6, 2.4]], [0, 2.6, 0, 2.2, 0.04, [0.4, 2.4, 7]], [0, 2.6, 0, 1.6, 0.035, [6, 3.5, 0.6]]];
    this.rings = rings.map(([x, y, z, R, t, c], i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(R, t, 12, 160), emit(...c)); m.position.set(x, y, z); this.neon.add(m); return m; });
    // a lattice tower of glowing edges
    const tower = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.8, 1.6, 9, 6, 6)), new THREE.LineBasicMaterial({ color: new THREE.Color(0.3, 1.2, 2.0) }));
    tower.position.set(-7, 4.5, -6); s.add(tower); this.tower = tower;
    const tower2 = tower.clone(); tower2.position.set(7.5, 3.5, -8); tower2.scale.setScalar(0.8); s.add(tower2);
    // drifting lit cubes
    this.cubes = [];
    for (let i = 0; i < 40; i++) {
      const c = new THREE.Color().setHSL(Math.random(), 0.9, 0.5).multiplyScalar(1 + Math.random() * 3);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: c }));
      m.position.set((Math.random() - 0.5) * 16, 0.5 + Math.random() * 6, (Math.random() - 0.5) * 12);
      m.userData.v = 0.2 + Math.random() * 0.5; s.add(m); this.cubes.push(m);
    }
    // core sphere: very bright
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 24), emit(12, 8, 5)); this.core.position.set(0, 2.6, 0); s.add(this.core);
    this.paint = new THREE.Group(); s.add(this.paint);

    const half = { type: THREE.HalfFloatType, depthBuffer: true };
    this.rtScene = new THREE.WebGLRenderTarget(4, 4, { ...half, samples: 4 });
    this.rtBright = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.mips = Array.from({ length: 6 }, () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
    this.ups = Array.from({ length: 6 }, () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
    this.rtComp = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;
    const M = (frag, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: QV, fragmentShader: frag, depthTest: false });
    this.mBright = M(BRIGHT, { tSrc: { value: null }, uThresh: { value: 1.0 }, uKnee: { value: 0.4 } });
    this.mDown = M(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = M(UP, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mComp = M(COMPOSITE, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 1.0 }, uExposure: { value: 1.0 }, uCA: { value: 0.0 }, uTemp: { value: 0 }, uTone: { value: 1 }, uStage: { value: 2 } });
    this.mFinal = M(FINAL, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uK: { value: PRESETS.Identity.slice() }, uKMix: { value: 0 }, uVig: { value: 0.6 }, uGrain: { value: 0.03 }, uScan: { value: 0 }, uTime: { value: 0 } });
    this.mView = M('uniform sampler2D tSrc; uniform float uGain; varying vec2 vUv; vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); } void main(){ gl_FragColor = vec4(aces(texture2D(tSrc, vUv).rgb * uGain), 1.0); \n#include <colorspace_fragment>\n }', { tSrc: { value: null }, uGain: { value: 1 } });
    this.mShow = M('uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); \n#include <colorspace_fragment>\n }', { tSrc: { value: null } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mBright);
    this.qs = new THREE.Scene(); this.qs.add(this.quad); this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.rtThumb = new THREE.WebGLRenderTarget(4, 4);
    this.stage = 4; this.showPipe = false; this.painting = false;
    this.ray = new THREE.Raycaster();
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); this._size = null; },

  size(renderer) {
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const key = W + 'x' + H; if (this._size === key) return; this._size = key;
    this.rtScene.setSize(W, H); this.rtComp.setSize(W, H);
    let w = W >> 1, h = H >> 1; this.rtBright.setSize(w, h);
    this.mips.forEach((m, i) => { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); m.setSize(w, h); this.ups[i].setSize(w, h); });
    this.rtThumb.setSize(Math.floor(W / 6), Math.floor(H / 6));
    this.W = W; this.H = H;
  },

  enter(app) {
    this.buildControls(); this.buildKernel(); this.buildPipeRow();
    app.ui.showChrome(true);
  },
  exit() { this.pipeRow?.remove(); this.pipeRow = null; this.painting = false; },

  buildControls() {
    const ui = this.app.ui, u = this.mComp.uniforms, f = this.mFinal.uniforms;
    ui.clearControls('Post-processing');
    this.obj = [ui.objective('Open the pipeline and inspect a stage'), ui.objective('Paint with light (drag with the toggle on)')];
    const r = ui.row();
    ui.toggle('Show pipeline', this.showPipe, (v) => { this.showPipe = v; this.pipeRow.style.display = v ? 'flex' : 'none'; }, r);
    ui.toggle('Paint light', this.painting, (v) => { this.painting = v; this.orbit.auto = v ? 0 : 0.05; }, r);
    ui.slider('Bloom strength', { min: 0, max: 3, step: 0.01, value: 1 }, (v) => (u.uBloom.value = v));
    ui.slider('Bloom threshold', { min: 0, max: 4, step: 0.01, value: 1 }, (v) => (this.mBright.uniforms.uThresh.value = v));
    ui.slider('Exposure', { min: 0.1, max: 6, step: 0.01, value: 1 }, (v) => (u.uExposure.value = v));
    ui.segmented('Tone mapping', [{ v: 0, l: 'Clip' }, { v: 2, l: 'Reinhard' }, { v: 1, l: 'Filmic' }], 1, (v) => (u.uTone.value = v));
    ui.slider('Chromatic aberration', { min: 0, max: 0.03, step: 0.0005, value: 0, fmt: (v) => (v * 1000).toFixed(1) }, (v) => (u.uCA.value = v));
    ui.slider('Colour temperature', { min: -1, max: 1, step: 0.01, value: 0 }, (v) => (u.uTemp.value = v));
    const r2 = ui.row();
    ui.toggle('Vignette', true, (v) => (f.uVig.value = v ? 0.6 : 0), r2);
    ui.toggle('Grain', true, (v) => (f.uGrain.value = v ? 0.03 : 0), r2);
    ui.toggle('Scanlines', false, (v) => (f.uScan.value = v ? 1 : 0), r2);
  },

  buildKernel() {
    const bd = this.app.ui.extraWindow('3 × 3 kernel', { left: 14, bottom: 70 }, 250);
    const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px';
    this.kIn = [];
    for (let i = 0; i < 9; i++) {
      const inp = document.createElement('input'); inp.type = 'number'; inp.step = '0.1'; inp.id = 'kernel-' + i; inp.value = PRESETS.Identity[i];
      inp.style.cssText = 'width:100%;min-width:0;padding:8px 4px;text-align:center;font:600 14px var(--font-mono);background:rgba(255,255,255,.06);color:var(--ui-fg);border:0';
      inp.addEventListener('input', () => this.readKernel());
      grid.appendChild(inp); this.kIn.push(inp);
    }
    bd.appendChild(grid);
    const r = document.createElement('div'); r.className = 'seg'; bd.appendChild(r);
    Object.keys(PRESETS).forEach((k) => this.app.ui.button(k, () => { PRESETS[k].forEach((v, i) => (this.kIn[i].value = +v.toFixed(3))); this.readKernel(); }, r));
    this.kRead = document.createElement('div'); this.kRead.className = 'readout'; bd.appendChild(this.kRead);
    this.readKernel();
  },

  readKernel() {
    const k = this.kIn.map((i) => parseFloat(i.value) || 0);
    this.mFinal.uniforms.uK.value = k;
    const isId = k.every((v, i) => v === PRESETS.Identity[i]);
    this.mFinal.uniforms.uKMix.value = isId ? 0 : 1;
    const sum = k.reduce((a, b) => a + b, 0);
    this.kRead.textContent = `sum of weights = ${sum.toFixed(2)}\n${Math.abs(sum - 1) < 0.01 ? 'keeps brightness' : Math.abs(sum) < 0.01 ? 'flat areas → black' : sum > 1 ? 'brightens' : 'darkens'}`;
    if (Math.abs(sum) < 1e-6 && k.some((v) => v !== 0)) this.app.secret('edge', 'You invented edge detection', 'A zero-sum kernel cancels flat areas and keeps only change: edges.');
  },

  buildPipeRow() {
    const row = (this.pipeRow = document.createElement('div'));
    row.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:70px;display:none;gap:8px;pointer-events:auto';
    this.stageNames = ['1 · Scene (HDR)', '2 · Bright pass', '3 · Blur pyramid', '4 · Composite + tone map', '5 · Final'];
    this.thumbBtns = this.stageNames.map((n, i) => {
      const b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'flex-direction:column;align-items:stretch;padding:4px;gap:4px;width:clamp(92px,13vw,170px)';
      b.innerHTML = `<canvas width="160" height="90" style="width:100%;height:auto;display:block;background:#000"></canvas><span style="font-size:11px;white-space:normal;text-align:left">${n}</span>`;
      b.addEventListener('click', () => { this.stage = i; this.thumbBtns.forEach((x, j) => x.classList.toggle('on', j === i)); this.obj[0].done(); this.app.ready(true); this.app.audio.click('modern'); });
      row.appendChild(b); return b;
    });
    this.thumbBtns[4].classList.add('on');
    document.getElementById('ui').appendChild(row);
  },

  pointer(type, p, e, app) {
    if (this.painting) {
      const nd = new THREE.Vector2(p.nx, p.ny); this.ray.setFromCamera(nd, this.cam);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.cam.getWorldDirection(new THREE.Vector3()).negate(), this.orbit.target);
      const hit = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(plane, hit)) return;
      if (type === 'down') { this.stroke = { pts: [hit.clone()], color: new THREE.Color().setHSL((this.paint.children.length * 0.13) % 1, 1, 0.5).multiplyScalar(5), line: null }; }
      else if (type === 'move' && this.stroke && e.buttons) {
        const last = this.stroke.pts[this.stroke.pts.length - 1];
        if (hit.distanceTo(last) > 0.08) {
          this.stroke.pts.push(hit.clone());
          if (this.stroke.line) this.paint.remove(this.stroke.line);
          if (this.stroke.pts.length > 1) {
            const curve = new THREE.CatmullRomCurve3(this.stroke.pts);
            this.stroke.line = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(4, this.stroke.pts.length * 3), 0.05, 6), new THREE.MeshBasicMaterial({ color: this.stroke.color }));
            this.paint.add(this.stroke.line);
          }
          if (this.stroke.pts.length % 3 === 0) app.audio.tone(400 + (hit.y * 120), 0.05, { wave: 'sine', vel: 0.03 });
        }
      } else if (type === 'up' && this.stroke) {
        if (this.stroke.pts.length > 4) { this.obj[1].done(); app.secret('painter2', 'Light painter', 'Your strokes are 5× brighter than white. Only HDR rendering can store that.'); }
        this.stroke = null;
        while (this.paint.children.length > 40) this.paint.remove(this.paint.children[0]);
      }
      return;
    }
    this.orbit.handle(type, p, e);
  },

  update(dt, t) {
    this.orbit.update(dt);
    this.rings.forEach((r, i) => { r.rotation.x = t * (0.3 + i * 0.17); r.rotation.y = t * (0.21 + i * 0.11); });
    this.cubes.forEach((c) => { c.position.y += c.userData.v * dt; if (c.position.y > 8) c.position.y = 0.3; c.rotation.x += dt; c.rotation.y += dt * 0.7; });
    this.tower.rotation.y += dt * 0.1;
    this.core.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    this.mFinal.uniforms.uTime.value = t;
  },

  pass(mat, target) { this.quad.material = mat; this.app.renderer.setRenderTarget(target); this.app.renderer.render(this.qs, this.qc); },

  render(renderer, target) {
    this.size(renderer);
    renderer.setRenderTarget(this.rtScene); renderer.render(this.scene, this.cam);
    this.mBright.uniforms.tSrc.value = this.rtScene.texture; this.pass(this.mBright, this.rtBright);
    let src = this.rtBright;
    for (const m of this.mips) { this.mDown.uniforms.tSrc.value = src.texture; this.mDown.uniforms.uTexel.value.set(1 / src.width, 1 / src.height); this.pass(this.mDown, m); src = m; }
    let up = this.mips[this.mips.length - 1];
    for (let i = this.mips.length - 2; i >= 0; i--) {
      this.mUp.uniforms.tSrc.value = up.texture; this.mUp.uniforms.tPrev.value = this.mips[i].texture; this.mUp.uniforms.uTexel.value.set(1 / up.width, 1 / up.height);
      this.pass(this.mUp, this.ups[i]); up = this.ups[i];
    }
    this.bloomTex = up.texture;
    const cu = this.mComp.uniforms;
    cu.tScene.value = this.rtScene.texture; cu.tBloom.value = this.bloomTex;
    const stage = this.stage;
    cu.uStage.value = stage === 0 ? 0 : 2;
    this.pass(this.mComp, this.rtComp);
    this.mFinal.uniforms.tSrc.value = this.rtComp.texture; this.mFinal.uniforms.uTexel.value.set(1 / this.W, 1 / this.H);
    // which image goes to the screen
    if (stage === 4) this.pass(this.mFinal, target);
    else if (stage === 3) { this.mShow.uniforms.tSrc.value = this.rtComp.texture; this.pass(this.mShow, target); }
    else { this.mView.uniforms.tSrc.value = [this.rtScene, this.rtBright, up][stage].texture ?? up; if (stage === 2) this.mView.uniforms.tSrc.value = this.bloomTex; this.mView.uniforms.uGain.value = 1; this.pass(this.mView, target); }
    if (this.showPipe && target === null) this.drawThumbs(renderer);
  },

  drawThumbs(renderer) {
    // copy each stage into its little canvas, every few frames
    if ((this._tf = (this._tf || 0) + 1) % 6) return;
    const srcs = [this.rtScene.texture, this.rtBright.texture, this.bloomTex, this.rtComp.texture, null];
    const w = this.rtThumb.width, h = this.rtThumb.height;
    const px = new Uint8Array(w * h * 4);
    srcs.forEach((tex, i) => {
      if (i === 4) { this.mFinal.uniforms.tSrc.value = this.rtComp.texture; this.pass(this.mFinal, this.rtThumb); }
      else if (i === 3) { this.mShow.uniforms.tSrc.value = tex; this.pass(this.mShow, this.rtThumb); }
      else { this.mView.uniforms.tSrc.value = tex; this.mView.uniforms.uGain.value = i === 0 ? 1 : 1.5; this.pass(this.mView, this.rtThumb); }
      renderer.readRenderTargetPixels(this.rtThumb, 0, 0, w, h, px);
      const cv = this.thumbBtns[i].querySelector('canvas'), x = cv.getContext('2d');
      const img = x.createImageData(w, h);
      const L = this._lut || (this._lut = Uint8Array.from({ length: 256 }, (_, v) => Math.round(255 * Math.pow(v / 255, 1 / 2.2))));
      for (let y = 0; y < h; y++) { const row = px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4); for (let k = 0; k < row.length; k++) img.data[y * w * 4 + k] = (k & 3) === 3 ? 255 : L[row[k]]; }
      if (cv.width !== w) { cv.width = w; cv.height = h; }
      x.putImageData(img, 0, 0);
    });
    renderer.setRenderTarget(null);
  },
};
