import * as THREE from 'three';
import { PathTracer, TONEMAP_GLSL } from '../gfx/pathtracer.js';

// Cold open: a single dot bursts into the final path-traced image, which then
// rewinds through sixty years of graphics back to one dot.

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tPT, tAscii;
uniform vec2 uRes;
uniform float uTime, uStage, uReveal, uDot, uZoom, uGlitch, uExposure;
uniform vec2 uSquash;
${TONEMAP_GLSL}
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec3 img(vec2 uv){ return aces(texture2D(tPT, uv).rgb * uExposure); }
float lum(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
float bayer4(vec2 p){
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  for (int k = 0; k < 16; k++) if (k == idx) return (m[k] + 0.5) / 16.0;
  return 0.5;
}
vec3 stageColor(vec2 uv, float st){
  vec2 px = uv * uRes;
  if (st < 0.5) return img(uv);
  if (st < 1.5) { // 2000s: direct light only feel, harsher, slight posterize
    vec3 c = img(uv); c = pow(c, vec3(1.5)) * 1.35; return floor(c * 24.0) / 24.0;
  }
  if (st < 2.5) { // 1990s polygons: 320 wide, 6 levels
    vec2 g = vec2(320.0, 320.0 * uRes.y / uRes.x); vec2 q = (floor(uv * g) + 0.5) / g;
    vec3 c = img(q); return floor(c * 6.0 + 0.5) / 6.0;
  }
  if (st < 3.5) { // early 90s: 160 columns, 16 colour dither
    vec2 g = vec2(160.0, 160.0 * uRes.y / uRes.x); vec2 q = (floor(uv * g) + 0.5) / g;
    vec3 c = img(q) + (bayer4(floor(uv * g)) - 0.5) * 0.25; return floor(c * 3.0 + 0.5) / 3.0;
  }
  if (st < 4.5) { // 1980s: 1-bit
    vec2 g = vec2(256.0, 256.0 * uRes.y / uRes.x); vec2 q = (floor(uv * g) + 0.5) / g;
    float l = lum(img(q)) * 1.25; return vec3(step(bayer4(floor(uv * g)), l)) * vec3(0.92, 0.95, 1.0);
  }
  if (st < 5.5) { // 1960s vectors: edges only
    vec2 e = 1.5 / uRes; float c = lum(img(uv));
    float gx = lum(img(uv + vec2(e.x, 0))) - lum(img(uv - vec2(e.x, 0)));
    float gy = lum(img(uv + vec2(0, e.y))) - lum(img(uv - vec2(0, e.y)));
    float ed = smoothstep(0.05, 0.2, length(vec2(gx, gy)));
    return vec3(0.6, 0.85, 1.0) * ed * 1.4;
  }
  // terminal: characters chosen by brightness
  vec2 cell = vec2(10.0, 18.0) * max(1.0, uRes.y / 900.0);
  vec2 ci = floor(px / cell); vec2 cuv = fract(px / cell);
  float l = lum(img((ci + 0.5) * cell / uRes));
  float idx = floor(clamp(l * 1.4, 0.0, 0.999) * 10.0);
  float g = texture2D(tAscii, vec2((idx + cuv.x) / 10.0, cuv.y)).r;
  return vec3(0.25, 1.0, 0.55) * g * 1.2;
}
void main(){
  vec2 uv = (vUv - 0.5) / uZoom + 0.5;
  // glitch tearing between stages
  float row = floor(vUv.y * 60.0);
  uv.x += (h(vec2(row, floor(uTime * 30.0))) - 0.5) * 0.08 * uGlitch * step(0.6, h(vec2(row, 3.0)));
  // CRT collapse
  vec2 c = uv - 0.5; vec2 sq = max(uSquash, vec2(0.002));
  vec2 suv = c / sq + 0.5;
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  vec3 col = stageColor(suv, uStage) * inside / mix(1.0, sq.x * sq.y, 0.9);
  col = min(col, vec3(4.0));
  if (uGlitch > 0.0) col.r = mix(col.r, stageColor(suv + vec2(0.006, 0.0), uStage).r, uGlitch);

  // reveal mask: an expanding disc of light
  vec2 a = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float d = length(a);
  float m = smoothstep(uReveal, uReveal - 0.02, d);
  float ring = exp(-abs(d - uReveal) * 60.0) * step(0.001, uReveal) * step(uReveal, 1.2);
  col = col * m + vec3(1.0, 0.85, 0.6) * ring * 0.8;

  // the dot
  float pulse = 0.8 + 0.2 * sin(uTime * 2.2);
  col += vec3(0.75, 1.0, 0.85) * (exp(-d * 220.0) * 2.5 + exp(-d * 40.0) * 0.25) * uDot * pulse;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'boot', title: 'Museum of Graphics', year: '', mode: 'world', ui: 'museum', music: 'silent', titleCard: false,

  init(app) {
    this.app = app;
    this.pt = new PathTracer(app.renderer);
    this.pt.scale = app.lowQuality ? 0.12 : Math.min(0.75, 1 / Math.max(1, window.devicePixelRatio * 0.75));
    if (app.lowQuality) this.pt.uniforms.uBounces.value = 3;
    const ac = document.createElement('canvas'); ac.width = 160; ac.height = 24;
    const x = ac.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 160, 24);
    x.fillStyle = '#fff'; x.font = '22px VT323, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    ' .:-=+*#%@'.split('').forEach((ch, i) => x.fillText(ch, i * 16 + 8, 13));
    this.asciiTex = new THREE.CanvasTexture(ac);
    this.asciiTex.minFilter = this.asciiTex.magFilter = THREE.LinearFilter;
    this.u = {
      tPT: { value: null }, tAscii: { value: this.asciiTex }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uStage: { value: 0 }, uReveal: { value: 0 }, uDot: { value: 1 }, uZoom: { value: 1 }, uGlitch: { value: 0 }, uExposure: { value: 1.0 },
      uSquash: { value: new THREE.Vector2(1, 1) },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FRAG });
    this.scene = new THREE.Scene(); this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.phase = 'wait'; this.t = 0;
    this.setAspect(window.innerWidth / window.innerHeight);
    // the ticker that labels each era as we rewind
    this.ticker = document.createElement('div');
    Object.assign(this.ticker.style, { position: 'absolute', left: '50%', bottom: '12%', transform: 'translateX(-50%)', fontFamily: 'var(--font-mono)', fontSize: '13px', letterSpacing: '.4em', color: '#ffb547', opacity: 0, transition: 'opacity .3s', pointerEvents: 'none', whiteSpace: 'nowrap' });
    document.getElementById('ui').appendChild(this.ticker);
  },

  setAspect(a) {
    const w = this.app.renderer.domElement.width, h = this.app.renderer.domElement.height;
    this.pt.setSize(w, h);
    this.u.uRes.value.set(w, h);
  },

  enter(app) { app.ui.hideControls(true); app.ui.setNotes([]); },
  waiting() { this.phase = 'wait'; },

  begin(app) {
    this.phase = 'burst'; this.t = 0;
    app.audio.thunk();
    setTimeout(() => app.audio.swell(), 150);
  },

  update(dt, time, app) {
    this.u.uTime.value = time;
    this.t += dt;
    const t = this.t, u = this.u;
    if (this.phase === 'wait') { u.uReveal.value = 0; u.uDot.value = 1; return; }
    if (this.phase === 'burst') {
      const k = Math.min(1, t / 1.1);
      u.uReveal.value = Math.pow(k, 2.2) * 1.3; u.uDot.value = 1 - k;
      if (t > 1.1) {
        this.phase = 'hold'; this.t = 0;
        app.ui.titleCard('', 'Museum of Graphics', 'Sixty years of teaching machines to paint with light.', 4200);
      }
      return;
    }
    if (this.phase === 'hold') {
      u.uZoom.value = 1 + t * 0.006;
      if (t > 5.2) {
        this.phase = 'rewind'; this.t = 0; this._stage = 0;
        app.audio.rewind(5.2);
        app.ui.titleCard('', '', 'To understand a frame like this, we have to take it apart.', 2400);
        this.ticker.style.opacity = 1;
      }
      return;
    }
    if (this.phase === 'rewind') {
      const labels = ['2020s · path tracing', '2000s · programmable shaders', '1990s · polygons', '1990s · pixels & palettes', '1980s · one bit per pixel', '1960s · the electron beam', '1960s · characters'];
      const stDur = 0.72;
      const st = Math.min(6, Math.floor(t / stDur));
      if (st !== this._stage) { this._stage = st; app.audio.glitch(); }
      u.uStage.value = st;
      const local = (t % stDur) / stDur;
      u.uGlitch.value = st > 0 && local < 0.18 ? 1 : 0;
      u.uZoom.value = 1.031 + t * 0.004;
      this.ticker.textContent = labels[st].toUpperCase();
      if (t > stDur * 7 + 0.3) { this.phase = 'collapse'; this.t = 0; app.audio.powerOff(); this.ticker.style.opacity = 0; }
      return;
    }
    if (this.phase === 'collapse') {
      const ky = Math.min(1, t / 0.28), kx = Math.max(0, Math.min(1, (t - 0.28) / 0.3));
      u.uSquash.value.set(1 - kx * 0.998, 1 - ky * 0.995);
      if (t > 0.6) { u.uDot.value = Math.min(1, (t - 0.6) * 3); u.uSquash.value.set(0, 0); }
      if (t > 0.9 && !this._said) { this._said = true; app.ui.titleCard('', '', 'So let us build it again, from one dot.', 2600); }
      if (t > 3.4) { this.phase = 'done'; app.go(1, { kind: 'boot' }); }
    }
  },

  render(renderer, target) {
    if (this.phase === 'wait') { const ns = this.app.adapt(this, this.pt.scale, 0.25); if (ns !== this.pt.scale) { this.pt.scale = ns; const r = renderer.domElement; this.pt.setSize(r.width, r.height); } }
    if (this.pt.frame < 900 && this.phase !== 'collapse' && this.phase !== 'done') this.pt.step(this.phase === 'wait' ? 2 : 1);
    this.u.tPT.value = this.pt.texture;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  },

  exit() { this.ticker.style.opacity = 0; },
};
