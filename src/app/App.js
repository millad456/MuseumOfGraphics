import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine.js';
import { State } from '../core/State.js';
import { Tweens } from '../core/Tweens.js';
import { Scope } from '../core/Scope.js';
import { h } from '../core/dom.js';
import { Chrome } from './Chrome.js';
import { Input } from './Input.js';
import { shaderPass } from '../gfx/three-utils.js';
import { ROOMS } from '../rooms/index.js';

const DISSOLVE = /* glsl */`
uniform sampler2D tA, tB; uniform float uT; uniform vec2 uRes;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 cell = floor(vUv * uRes / 12.0);
  float n = hash(cell) * 0.55 + (1.0 - vUv.y) * 0.45;
  float t = uT * 1.12 - 0.06;
  float showB = smoothstep(n - 0.03, n + 0.03, t);
  float edge = smoothstep(0.07, 0.0, abs(n - t)) * step(0.001, uT) * step(uT, 0.999);
  vec3 c = mix(texture2D(tA, vUv).rgb, texture2D(tB, vUv).rgb, showB) + vec3(1.0, 0.72, 0.32) * edge * 1.2;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * The application: owns the renderer, the frame loop, shared services and
 * the room lifecycle. Exactly one room is active at a time; switching
 * rooms disposes the old room's scope before the new one enters, and a
 * generation counter makes any in-flight async work from an older visit
 * harmless.
 */
export class App {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    canvas.tabIndex = 0;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.lowQuality = this._detectLowQuality() || /[?&]q=low\b/.test(location.search);
    // ?fast lets slow automated test browsers advance time in big steps
    this.maxStep = /[?&]fast\b/.test(location.search) ? 0.5 : this.lowQuality ? 0.12 : 0.1;
    r.setPixelRatio(this.lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(window.innerWidth, window.innerHeight, false);

    this.state = new State();
    this.audio = new AudioEngine();
    this.audio.muted = this.state.muted;
    this.tweens = new Tweens();
    this.chrome = new Chrome(uiRoot);
    this.input = new Input(this, canvas);
    this.rooms = ROOMS.map((make) => make(this));
    this.index = -1;
    this.room = null;
    this.scope = null;
    this.tour = null;
    this.gen = 0;
    this.time = 0;
    this.perf = 1 / 60;
    this.busy = false;
    this.unlockedAll = this.state.seen.has('finale');
    this.services = new Map();

    const dissolveUniforms = { tA: { value: null }, tB: { value: null }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } };
    this.dissolve = shaderPass(DISSOLVE, dissolveUniforms);
    const rt = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.rtFrozen = rt();
    this.rtLive = rt();
    this.fade = null;

    this._bindChrome();
    this._bindKeys();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.clock.getDelta(); });
    this.clock = new THREE.Clock();
    this.resize();
    this.updateSecretCount();
    this.chrome.setSound(!this.state.muted);
    r.setAnimationLoop(() => this.frame());
  }

  _detectLowQuality() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      return /swiftshader|llvmpipe|software/i.test(name);
    } catch { return false; }
  }

  /** Lazily created shared objects (the hall, the evolving world...). */
  service(key, create) {
    if (!this.services.has(key)) this.services.set(key, create(this));
    return this.services.get(key);
  }

  // ------------------------------------------------------------------ rooms
  roomIndex(id) { return this.rooms.findIndex((r) => r.id === id); }

  reachable(i) {
    if (this.unlockedAll || i <= 1) return true;
    return this.state.seen.has(this.rooms[i].id) || this.state.seen.has(this.rooms[i - 1].id);
  }

  async go(index, opts = {}) {
    if (index < 0 || index >= this.rooms.length) return;
    if (index === this.index && !opts.force) return;
    const gen = ++this.gen;
    const to = this.rooms[index];
    if (!to.loaded) {
      try { await to.load(); } catch (err) { console.error(err); }
      to.loaded = true;
      if (gen !== this.gen) return;
    }
    const from = this.room;
    const mode = opts.transition || (from ? to.transitionFrom(from) : 'none');
    if (mode === 'dissolve' && from) this._freeze(from);

    this.scope?.dispose();
    this.input.reset();
    this.tour = null;
    this.chrome.setTour(null);
    this.chrome.closeModal();

    this.room = to;
    this.index = index;
    this.scope = new Scope(this.tweens);
    this.state.seen.add(to.id);
    if (to.id === 'finale') this.unlockedAll = true;
    this.state.save();
    this.chrome.setRoom(index, this.rooms, this.state.seen, (i) => this.reachable(i));
    this.audio.setStyle(to.music);
    try { history.replaceState(null, '', `${location.pathname}${location.search}#${to.id}`); } catch { /* sandboxed */ }
    try { to.enter(this.scope, { from, fromId: from?.id || null }); } catch (err) { console.error(err); }
  }

  next() {
    if (this.tour && !this.tour.last) { this.tour.next(); return; }
    if (this.index >= this.rooms.length - 1) this.go(1); else this.go(this.index + 1);
  }

  prev() { if (this.index > 1) this.go(this.index - 1); }

  setTour(tour, scope) {
    this.tour = tour;
    this.chrome.setTour(tour);
    scope.add(() => { if (this.tour === tour) { tour.stop(); this.tour = null; this.chrome.setTour(null); } });
  }

  /** The visitor touched an exhibit: let them play instead of the guide. */
  onVisitorAction() { this.tour?.pause(); }

  markReady() { this.chrome.setNextLabel(this.index === this.rooms.length - 1 ? 'Begin again' : 'Next room', true); }

  // ------------------------------------------------------------------ secrets
  allSecrets() { return this.rooms.flatMap((r) => r.secrets.map((s) => ({ ...s, room: r.title }))); }

  secret(id, title, desc = '') {
    if (this.state.secrets.has(id)) return false;
    this.state.secrets.add(id);
    this.state.save();
    this.audio.secret();
    this.chrome.toast(`Found: ${title}`, desc, 5200);
    this.updateSecretCount();
    return true;
  }

  updateSecretCount() {
    const all = this.allSecrets();
    this.chrome.setSecrets(all.filter((s) => this.state.secrets.has(s.id)).length, all.length);
  }

  showSecrets() {
    const all = this.allSecrets();
    this.chrome.openModal(
      h('h2', {}, 'Hidden things'),
      h('p', { class: 'muted' }, 'Every room hides something. Hints are shown for the ones still missing.'),
      h('ul', { class: 'secret-list' }, all.map((s) => {
        const got = this.state.secrets.has(s.id);
        return h('li', { class: got ? 'got' : '' }, h('span', { class: 'gem' }), h('div', {}, h('b', {}, got ? s.title : '???'), h('span', {}, `${s.room} · ${got ? s.desc || '' : 'Hint: ' + s.hint}`)));
      })));
  }

  showShare() {
    let image = null;
    try {
      this.room.render(this.renderer, null);
      image = this.renderer.domElement.toDataURL('image/jpeg', 0.85);
    } catch { /* ignore */ }
    const url = `${location.origin}${location.pathname}`;
    const link = h('input', { class: 'share-link', value: url, readOnly: true, 'aria-label': 'Link' });
    const copy = h('button', { class: 'ctl-btn', onclick: async () => { try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; } catch { link.select(); } } }, 'Copy link');
    const save = image ? h('a', { class: 'ctl-btn', href: image, download: 'museum-of-graphics.jpg' }, 'Save this frame') : null;
    const share = navigator.share ? h('button', { class: 'ctl-btn', onclick: () => navigator.share({ title: 'Museum of Graphics', text: 'A playable history of computer graphics.', url }).catch(() => {}) }, 'Share…') : null;
    this.chrome.openModal(
      h('h2', {}, 'Bring someone through'),
      image ? h('img', { class: 'postcard', src: image, alt: 'The current frame' }) : null,
      h('div', { class: 'share-row' }, link, copy, save, share));
  }

  // ------------------------------------------------------------------ input
  _bindChrome() {
    const c = this.chrome;
    c.on('next', () => { this.audio.init(); this.next(); });
    c.on('prev', () => this.prev());
    c.on('go', (i) => this.go(i));
    c.on('info', () => this.room?.notes.length && c.placard(this.room.notes));
    c.on('secrets', () => this.showSecrets());
    c.on('share', () => this.showShare());
    c.on('sound', () => {
      this.audio.init();
      const muted = !this.audio.muted;
      this.audio.setMuted(muted);
      this.state.setMuted(muted);
      c.setSound(!muted);
    });
    c.on('modal-closed', () => this.canvas.focus({ preventScroll: true }));
  }

  _bindKeys() {
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
    window.addEventListener('keydown', (e) => {
      if (this.chrome.modalOpen || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      this.audio.init();
      let used = false;
      try { used = !!this.room?.key(e, true); } catch (err) { console.error(err); }
      if (!used && !this.busy) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { this.next(); used = true; }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { if (this.tour && this.tour.index > 0) this.tour.prev(); else this.prev(); used = true; }
      }
      if (used) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { if (!typing(e)) { try { this.room?.key(e, false); } catch (err) { console.error(err); } } });
  }

  // ------------------------------------------------------------------ frame
  /** Lower a room's internal resolution when frames are slow. Returns the new scale. */
  adapt(owner, scale, min = 0.3) {
    if (this.lowQuality || this.fade) return scale;
    if (this.perf > 1 / 28 && scale > min && this.time - (owner._adaptAt || 0) > 1.5) {
      owner._adaptAt = this.time;
      return Math.max(min, scale * 0.85);
    }
    return scale;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const pw = this.renderer.domElement.width, ph = this.renderer.domElement.height;
    this.rtFrozen.setSize(pw, ph); this.rtLive.setSize(pw, ph);
    this.dissolve.material.uniforms.uRes.value.set(pw, ph);
    for (const s of this.services.values()) s.resize?.(w, h);
    for (const r of this.rooms) if (r.loaded) r.resize?.(w, h);
  }

  _freeze(room) {
    try { room.render(this.renderer, this.rtFrozen); } catch (err) { console.error(err); }
    this.fade = { t: 0, duration: 0.9 };
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), this.maxStep);
    this.time += dt;
    this.perf += (dt - this.perf) * 0.05;
    this.tweens.update(dt);
    const room = this.room;
    if (!room) return;
    this.tour?.update(dt);
    try { room.update(dt, this.time); } catch (err) { console.error(err); }
    for (const s of this.services.values()) s.tick?.(dt, this.time);

    const r = this.renderer;
    if (this.fade) {
      this.fade.t += dt / this.fade.duration;
      room.render(r, this.rtLive);
      const u = this.dissolve.material.uniforms;
      u.tA.value = this.rtFrozen.texture; u.tB.value = this.rtLive.texture; u.uT.value = Math.min(1, this.fade.t);
      this.dissolve.render(r, null);
      if (this.fade.t >= 1) this.fade = null;
      return;
    }
    room.render(r, null);
  }

  // ------------------------------------------------------------------ boot
  start() {
    const hash = location.hash.slice(1);
    const deep = hash ? this.roomIndex(hash) : -1;
    this.deepLink = deep > 0 ? deep : null;
    if (this.deepLink) this.unlockedAll = true;
    this.go(0);
  }
}
