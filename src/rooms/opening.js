import * as THREE from 'three';
import { Room } from '../app/Room.js';
import { getWorld } from '../world/World.js';
import { STAGES, STAGE_YEARS as YEARS } from '../world/stages.js';
import { shaderPass } from '../gfx/three-utils.js';
import { h } from '../core/dom.js';
import { clamp, ease } from '../core/math.js';

// ROOM 00 · The opening.
// One dot. Draw with it if you like; click and it becomes the finished,
// path-traced gallery, built up from a single pixel. Then the whole history
// plays in reverse, wave by wave, while the year counts down, until only
// the dot is left, and it becomes the cursor of the first terminal.

const PIXELATE = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uBlocks; varying vec2 vUv;
void main(){ vec2 uv = (floor(vUv * uBlocks) + 0.5) / uBlocks; gl_FragColor = vec4(texture2D(tSrc, uv).rgb, 1.0);
  #include <colorspace_fragment>
}`;

// the classic tube switch-off: collapse to a line, then to a dot
const SQUASH = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uSquash; uniform float uDot, uAspect; varying vec2 vUv;
void main(){
  vec2 c = vUv - 0.5, sq = max(uSquash, vec2(0.002));
  vec2 uv = c / sq + 0.5;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec3 col = texture2D(tSrc, uv).rgb * inside * min(1.0 / (sq.x * sq.y), 30.0) * 0.6;
  float d = length(c * vec2(uAspect, 1.0));
  col += vec3(0.45, 1.0, 0.6) * (exp(-d * 260.0) * 2.4 + exp(-d * 40.0) * 0.2) * uDot;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export default (app) => new OpeningRoom(app, { id: 'opening', title: 'Museum of Graphics', music: 'silent' });

class OpeningRoom extends Room {
  constructor(app, meta) { super(app, meta); this.kind = 'scene'; }
  get world() { return getWorld(this.app); }
  get camera() { return this.world.camera; }

  async load() {
    this.world;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.pixelate = shaderPass(PIXELATE, { tSrc: { value: null }, uBlocks: { value: new THREE.Vector2(1, 1) } });
    this.squash = shaderPass(SQUASH, { tSrc: { value: null }, uSquash: { value: new THREE.Vector2(1, 1) }, uDot: { value: 0 }, uAspect: { value: 1 } });
  }

  enter(scope) {
    const app = this.app, w = this.world;
    app.chrome.setChromeVisible(false);
    scope.add(() => app.chrome.setChromeVisible(true));
    w.setStage('path', { sweep: false });
    w.shot('final', 0);
    w.orbit.yawT = w.orbit.pitchT = 0;
    this.phase = 'gate';
    this.blocks = 1;
    this.squashK = 0;

    // the gate: a phosphor dot you can draw with
    this.doodle = h('canvas', { class: 'doodle' });
    this.gate = h('div', { class: 'gate' },
      h('div', { class: 'gate-title' }, 'Museum of Graphics'),
      h('p', { class: 'gate-hint' }, 'Every picture on a screen starts as one glowing dot.', h('br'), h('b', {}, 'Drag to draw with it. Click to switch on.')));
    this.odometer = h('div', { class: 'odometer', 'aria-hidden': 'true' });
    scope.mount(this.doodle, app.chrome.overlay);
    scope.mount(this.gate, app.chrome.overlay);
    scope.mount(this.odometer, app.chrome.overlay);
    this.dot = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.trail = [];
    this.sizeDoodle();
    scope.listen(window, 'resize', () => this.sizeDoodle());
    scope.listen(window, 'keydown', (e) => { if (this.phase === 'gate' && (e.key === 'Enter' || e.key === ' ')) this.begin(scope); });
    this.scope = scope;
  }

  sizeDoodle() {
    const pr = Math.min(2, window.devicePixelRatio || 1);
    this.doodle.width = window.innerWidth * pr; this.doodle.height = window.innerHeight * pr;
    this.doodle.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0);
  }

  pointer(e) {
    if (this.phase !== 'gate') return;
    if (e.type === 'down') { this.press = { x: e.x, y: e.y, moved: false }; this.app.audio.init(); }
    if (e.type === 'move' && this.press && e.buttons) {
      if (Math.hypot(e.x - this.press.x, e.y - this.press.y) > 6) this.press.moved = true;
      this.trail.push({ x: e.x, y: e.y });
      const sp = this.trail.length > 1 ? Math.hypot(e.x - this.trail[this.trail.length - 2].x, e.y - this.trail[this.trail.length - 2].y) : 0;
      if (sp > 2 && Math.random() < 0.3) this.app.audio.tone(200 + sp * 30, 0.05, { wave: 'sine', vel: 0.02 });
    }
    if (e.type === 'move') this.dot = { x: e.x, y: e.y };
    if (e.type === 'up') {
      if (this.press && !this.press.moved) this.begin(this.scope);
      this.press = null;
    }
  }

  async begin(scope) {
    if (this.phase !== 'gate') return;
    const app = this.app, w = this.world;
    app.audio.init();
    this.gate.classList.add('gone');
    if (app.deepLink) { const to = app.deepLink; app.deepLink = null; app.go(to, { transition: 'dissolve' }); return; }
    this.phase = 'build';
    app.audio.thunk();
    // build up: one pixel, then four, then sixteen ... then the full picture
    for (let k = 0; k <= 10; k++) {
      this.blocks = Math.pow(2, k);
      app.audio.tick(k, 0.05);
      if (!(await scope.wait(k < 9 ? 0.16 : 0.22))) return;
    }
    this.phase = 'hold';
    app.audio.swell();
    this.odometer.textContent = String(new Date().getFullYear());
    this.odometer.classList.add('show');
    if (!(await scope.wait(1.4))) return;
    // rewind the history, wave by wave
    this.phase = 'rewind';
    app.audio.rewind(4.4);
    const order = STAGES.slice(0, STAGES.length - 1).reverse();
    for (const s of order) {
      this.odometer.textContent = String(YEARS[s.key]);
      await w.setStage(s, { duration: 0.34, origin: new THREE.Vector3(0, 1.6, 0) });
      if (scope.disposed) return;
    }
    if (!(await scope.wait(0.5))) return;
    // switch off: the picture collapses into a single dot
    this.phase = 'collapse';
    app.audio.powerOff();
    await scope.tween(0.7, (k) => {
      const ky = clamp(k / 0.45), kx = clamp((k - 0.45) / 0.55);
      this.squash.material.uniforms.uSquash.value.set(1 - ease.inCubic(kx) * 0.998, 1 - ease.outCubic(ky) * 0.996);
      this.squash.material.uniforms.uDot.value = kx;
    }, { ease: 'linear' }).promise;
    this.odometer.classList.remove('show');
    if (!(await scope.wait(0.5))) return;
    app.go(1);
  }

  update(dt, t) {
    this.world.update(dt, t);
    if (this.phase === 'gate') this.drawDoodle(dt, t);
    else if (this.doodle.style.opacity !== '0') this.doodle.style.opacity = '0';
  }

  drawDoodle(dt, t) {
    const x = this.doodle.getContext('2d'), W = window.innerWidth, H = window.innerHeight;
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt / 0.6)})`; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    if (this.trail.length > 1) {
      x.strokeStyle = 'rgba(120,255,170,0.55)'; x.lineWidth = 2.5; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); this.trail.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.stroke();
      this.trail = this.trail.slice(-1);
    }
    const target = this.press ? this.dot : { x: W / 2, y: H / 2 };
    this.cur = this.cur || { ...target };
    this.cur.x += (target.x - this.cur.x) * Math.min(1, dt * (this.press ? 30 : 3));
    this.cur.y += (target.y - this.cur.y) * Math.min(1, dt * (this.press ? 30 : 3));
    const r = 3 + Math.sin(t * 2.2) * 0.6;
    const g = x.createRadialGradient(this.cur.x, this.cur.y, 0, this.cur.x, this.cur.y, 26);
    g.addColorStop(0, 'rgba(200,255,220,1)'); g.addColorStop(r / 26, 'rgba(120,255,170,0.8)'); g.addColorStop(1, 'rgba(60,255,120,0)');
    x.fillStyle = g; x.beginPath(); x.arc(this.cur.x, this.cur.y, 26, 0, Math.PI * 2); x.fill();
  }

  render(renderer, target) {
    const w = this.world;
    const W = renderer.domElement.width, H = renderer.domElement.height;
    if (this.rt.width !== W || this.rt.height !== H) this.rt.setSize(W, H);
    if (this.phase === 'gate') {
      // let the path tracer warm up out of sight
      w.render(this.rt);
      renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 1); renderer.clear();
      return;
    }
    if (this.phase === 'build') {
      w.render(this.rt);
      const b = this.blocks, a = W / H;
      this.pixelate.material.uniforms.tSrc.value = this.rt.texture;
      this.pixelate.material.uniforms.uBlocks.value.set(Math.min(W, Math.max(1, Math.round(b * a))), Math.min(H, b));
      this.pixelate.render(renderer, target);
      return;
    }
    if (this.phase === 'collapse') {
      w.render(this.rt);
      this.squash.material.uniforms.tSrc.value = this.rt.texture;
      this.squash.material.uniforms.uAspect.value = W / H;
      this.squash.render(renderer, target);
      return;
    }
    w.render(target);
  }
}
