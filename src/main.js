import * as THREE from 'three';
import { audio } from './core/audio.js';
import { Monitor, SCREEN_W, SCREEN_H } from './core/monitor.js';
import { UI } from './core/ui.js';
import { State } from './core/state.js';
import { openShare } from './core/share.js';
import { CHAPTERS } from './chapters/index.js';
import { crtJourney, gpuJourney } from './chapters/journeys.js';
const JOURNEYS = { crt: crtJourney, gpu: gpuJourney };

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t) => t * t * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const DISSOLVE_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tA, tB; uniform float uT; uniform vec2 uRes; uniform vec3 uEdge;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  void main(){
    vec2 cell = floor(vUv * uRes / 10.0);
    float n = h(cell) * 0.6 + (1.0 - vUv.y) * 0.4;
    float e = smoothstep(uT - 0.04, uT, n) ;
    vec3 a = texture2D(tA, vUv).rgb, b = texture2D(tB, vUv).rgb;
    float band = smoothstep(0.06, 0.0, abs(n - uT)) * step(0.001, uT) * step(uT, 0.999);
    gl_FragColor = vec4(mix(b, a, e) + uEdge * band * 1.5, 1.0);
    #include <colorspace_fragment>
  }
`;

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.canvas.tabIndex = 0;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.THREE = THREE;
    // quality: software renderers and ?q=low get a lighter path tracer
    let rn = '';
    try { const gl = r.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); rn = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) {}
    this.lowQuality = /swiftshader|llvmpipe|software/i.test(rn) || /[?&]q=low/.test(location.search);
    if (this.lowQuality) r.setPixelRatio(1);
    this.audio = audio;
    this.state = new State();
    this.ui = new UI(this);
    this.chapters = CHAPTERS;
    this.idx = -1;
    this.cur = null;
    this.busy = false;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.unlockedAll = this.state.visited.has('finale');
    this._buildRoom();
    this._bindInput();
    this._buildTransitions();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ Room
  _buildRoom() {
    const s = (this.room = new THREE.Scene());
    s.background = new THREE.Color(0x030303);
    s.fog = new THREE.Fog(0x030303, 12, 30);
    this.roomCam = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
    this.monitor = new Monitor(this.renderer);
    s.add(this.monitor.group);

    this.screenLight = new THREE.PointLight(0x55ff99, 18, 14, 1.6);
    this.screenLight.position.set(0, 0, 1.6);
    s.add(this.screenLight);
    const rim = new THREE.DirectionalLight(0x6f8cff, 0.5); rim.position.set(-4, 5, -6); s.add(rim);
    const rim2 = new THREE.DirectionalLight(0xffc28a, 0.25); rim2.position.set(6, 2, -2); s.add(rim2);
    s.add(new THREE.AmbientLight(0xffffff, 0.04));

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.95, metalness: 0.0 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.62;
    s.add(floor);

    // Dust drifting through the screen's light.
    const N = 700, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 14; pos[i * 3 + 1] = (Math.random() - 0.5) * 8; pos[i * 3 + 2] = Math.random() * 9 - 1; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dc = document.createElement('canvas'); dc.width = dc.height = 32;
    const dx = dc.getContext('2d'); const grd = dx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); dx.fillStyle = grd; dx.fillRect(0, 0, 32, 32);
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, map: new THREE.CanvasTexture(dc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    s.add(this.dust);

    this.camRig = { pos: new THREE.Vector3(0, 0, 12), look: new THREE.Vector3(0, 0, 0), zoom: 1 };
    this.camAnim = null;
    this.mouse = new THREE.Vector2();
    this.smoothMouse = new THREE.Vector2();
  }

  // Where should the camera sit so the screen fills the free space between windows?
  framing(zoom = 1) {
    const w = window.innerWidth, h = window.innerHeight;
    const narrow = w < 760;
    const left = narrow ? 8 : (this.ui.notesWin.classList.contains('hidden') ? 16 : 262);
    const right = narrow ? 8 : (this.ui.controls.classList.contains('hidden') ? 16 : 300);
    const top = narrow ? 50 : 52, bottom = narrow ? (this.ui.controls.classList.contains('hidden') ? 70 : h * 0.42) : 66;
    const aw = Math.max(200, w - left - right), ah = Math.max(150, h - top - bottom);
    const fov = THREE.MathUtils.degToRad(this.roomCam.fov);
    const visH = SCREEN_H * 1.08 / zoom; // world height we want to see across ah pixels
    const worldPerPx = Math.max(visH / ah, (SCREEN_W * 1.06 / zoom) / aw);
    const fullH = worldPerPx * h;
    const dist = fullH / 2 / Math.tan(fov / 2) + 0.12;
    const cxPx = left + aw / 2 - w / 2, cyPx = top + ah / 2 - h / 2;
    return { pos: new THREE.Vector3(-cxPx * worldPerPx, cyPx * worldPerPx, dist), look: new THREE.Vector3(-cxPx * worldPerPx, cyPx * worldPerPx, 0) };
  }

  animateCam(to, dur = 1.6, fn = ease) {
    this.camAnim = { from: { pos: this.camRig.pos.clone(), look: this.camRig.look.clone() }, to, t: 0, dur, fn };
  }

  setRoomCamera(pos, look) { this.camRig.pos.copy(pos); this.camRig.look.copy(look); this.camAnim = null; }

  renderRoom(target = null, dt = 0) {
    const cam = this.roomCam;
    if (this.camAnim) {
      const a = this.camAnim; a.t += dt / a.dur;
      const k = a.fn(clamp(a.t, 0, 1));
      this.camRig.pos.lerpVectors(a.from.pos, a.to.pos, k);
      this.camRig.look.lerpVectors(a.from.look, a.to.look, k);
      if (a.t >= 1) { this.camAnim = null; a.done && a.done(); }
    } else if (this.cur && this.cur.mode === 'screen' && !this.diving && !this.freeCam) {
      const f = this.framing(this.cur.zoom || 1);
      this.camRig.pos.lerp(f.pos, 1 - Math.exp(-dt * 4));
      this.camRig.look.lerp(f.look, 1 - Math.exp(-dt * 4));
    }
    this.smoothMouse.lerp(this.mouse, 1 - Math.exp(-dt * 3));
    const sway = this.diving ? 0 : 0.18;
    cam.position.copy(this.camRig.pos);
    cam.position.x += this.smoothMouse.x * sway;
    cam.position.y += this.smoothMouse.y * sway * 0.6;
    cam.lookAt(this.camRig.look);
    // the room is lit by whatever is on the screen
    const c = this.monitor.avgColor;
    const lum = Math.max(c.r, c.g, c.b);
    this.screenLight.color.setRGB(c.r / (lum + 0.05), c.g / (lum + 0.05), c.b / (lum + 0.05));
    this.screenLight.intensity = 4 + lum * 30 * Math.max(this.monitor.uniforms.uPowerY.value, 0.05);
    this.dust.material.color.copy(this.screenLight.color);
    this.dust.rotation.y += dt * 0.01;
    this.dust.position.y = Math.sin(this.time * 0.1) * 0.2;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.room, cam);
  }

  // ------------------------------------------------------------------ Transitions
  _buildTransitions() {
    const opts = { type: THREE.HalfFloatType };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, opts);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, opts);
    this.rtDive = new THREE.WebGLRenderTarget(1024, 768, opts);
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.dissolveMat = new THREE.ShaderMaterial({
      uniforms: { tA: { value: null }, tB: { value: null }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uEdge: { value: new THREE.Color(1, 0.7, 0.3) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: DISSOLVE_FRAG + '',
    });
    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dissolveMat);
    this.fsScene = new THREE.Scene(); this.fsScene.add(this.fsQuad);
  }

  renderChapter(ch, target, dt) {
    if (ch.mode === 'screen') {
      this.renderRoom(target, dt);
    } else {
      ch.render(this.renderer, target, dt);
    }
  }

  async go(i, opts = {}) {
    if (this.busy || i === this.idx || i < 0 || i >= this.chapters.length) return;
    const to = this.chapters[i], from = this.cur;
    this.busy = true;
    try {
      if (!to._inited) { await to.init?.(this); to._inited = true; }
    } catch (e) { console.error(e); }
    const fwd = i > this.idx;
    const kind = opts.kind || (from && to.journey && fwd && i === this.idx + 1 ? 'journey' : null) || (!from ? 'cut' : (from.mode === 'screen' && to.mode === 'screen') ? 'glitch' : (from.mode === 'screen' && to.mode === 'world' && fwd && to.dive) ? 'dive' : 'dissolve');
    this.audio.setStyle(to.music || 'silent');

    const enter = () => {
      if (from) { try { from.exit?.(this); } catch (e) { console.error(e); } }
      this.ui.resetWindows();
      this.ui.clearExtras();
      this.ui.setEra(to.ui || 'museum');
      this.idx = i; this.cur = to;
      this.state.visited.add(i); this.state.save();
      this.ui.setChapter(to, i, this.chapters, this.state.visited);
      this.ui.setNotes(to.notes || []);
      this.ui.setNext(false, i === this.chapters.length - 1 ? 'Begin again ↺' : 'Next era →');
      this.ui.hideControls(true);
      if (to.monitorProfile) this.monitor.setProfile(to.monitorProfile);
      try { to.enter?.(this, { from, kind }); } catch (e) { console.error(e); }
      if (to.id) { try { history.replaceState(null, '', location.pathname + location.search + '#' + to.id); } catch (e) {} }
      if (to.titleCard !== false && i > 0) this.ui.titleCard(to.year, to.title, to.tagline);
    };

    if (kind === 'cut' || kind === 'boot') { enter(); this.busy = false; return; }

    if (kind === 'journey') {
      // leave the exhibit and travel through the hardware, then dissolve in
      const J = JOURNEYS[to.journey];
      if (!J._inited) { J.init(this); J._inited = true; }
      document.body.classList.add('journeying');
      J.start(this, from, to);
      this.journey = J;
      await new Promise((res) => { const chk = () => (J.done ? res() : setTimeout(chk, 30)); chk(); });
      const w = this.renderer.domElement.width, h = this.renderer.domElement.height;
      this.rtA.setSize(w, h); this.rtB.setSize(w, h);
      if (!this.rtFrozen) { this.rtFrozen = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }); this.frozenScene = new THREE.Scene(); this.frozenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.rtFrozen.texture }))); }
      this.rtFrozen.setSize(w, h);
      J.render(this.renderer, this.rtFrozen, 0);
      this.journey = null;
      J.finish?.(this);
      const frozen = { mode: 'world', render: (r, target) => { r.setRenderTarget(target); r.render(this.frozenScene, this.fsCam); } };
      this.dissolveMat.uniforms.uRes.value.set(w, h);
      this.transition = { a: frozen, b: null, t: 0 };
      enter();
      if (to.mode === 'screen') { this.monitor.uniforms.uPowerX.value = 1; this.monitor.uniforms.uPowerY.value = 1; this.monitor.setPowered(true); }
      this.transition.b = to;
      document.body.classList.remove('journeying');
      await this.tween(0.9, (k) => { this.transition.t = k; }, true);
      this.transition = null;
      this.busy = false; return;
    }

    if (kind === 'glitch') {
      this.audio.glitch();
      const u = this.monitor.uniforms;
      await this.tween(0.32, (k) => { u.uRGBSplit.value = k * 0.02; u.uNoise.value = 0.03 + k * 0.5; u.uPowerY.value = 1 - k * 0.97; });
      enter();
      this.cur.draw?.(this.monitor.ctx, 0, this.time, this);
      await this.tween(0.42, (k) => { u.uRGBSplit.value = (1 - k) * 0.02; u.uNoise.value = 0.03 + (1 - k) * 0.5; u.uPowerY.value = 0.03 + k * 0.97; });
      u.uRGBSplit.value = 0; this.monitor.setProfile(this.cur.monitorProfile || {});
      this.busy = false; return;
    }

    if (kind === 'dive') {
      // Pre-render the 3D world into the monitor, then push the camera through the glass.
      this.audio.whoosh(2.4, true, 0.3);
      enter();
      this.ui.hideControls(true);
      this.diving = true;
      to.setAspect?.(SCREEN_W / SCREEN_H);
      const start = { pos: this.camRig.pos.clone(), look: this.camRig.look.clone() };
      const end = { pos: new THREE.Vector3(0, 0, 0.55), look: new THREE.Vector3(0, 0, -1) };
      await this.tween(2.6, (k) => {
        const e = easeIn(k);
        this.camRig.pos.lerpVectors(start.pos, end.pos, e);
        this.camRig.look.lerpVectors(start.look, end.look, e);
        this.monitor.uniforms.uDirect.value = clamp((k - 0.4) / 0.6, 0, 1);
        this.monitor.uniforms.uScan.value = 0.3 * (1 - k);
      }, true);
      this.diving = false;
      this.monitor.uniforms.uDirect.value = 0;
      this.monitor.useCanvas();
      to.setAspect?.(window.innerWidth / window.innerHeight);
      to.afterDive?.(this);
      if (this.ui.controlsBody.children.length) this.ui.hideControls(false);
      this.busy = false; return;
    }

    // dissolve: render both sides into targets and mix through a noise threshold
    const w = this.renderer.domElement.width, h = this.renderer.domElement.height;
    this.rtA.setSize(w, h); this.rtB.setSize(w, h);
    this.dissolveMat.uniforms.uRes.value.set(w, h);
    const prev = from;
    this.audio.whoosh(1.0, fwd, 0.18);
    this.transition = { a: prev, b: null, t: 0 };
    enter();
    if (to.mode === 'screen') { this.monitor.uniforms.uPowerX.value = 1; this.monitor.uniforms.uPowerY.value = 1; this.monitor.setPowered(true); }
    this.transition.b = to;
    await this.tween(1.1, (k) => { this.transition.t = k; }, true);
    this.transition = null;
    this.busy = false;
  }

  tween(dur, fn, smooth = false) {
    return new Promise((res) => { this._tweens = this._tweens || []; this._tweens.push({ t: 0, dur, fn, res, smooth }); });
  }

  next() { if (this.idx >= this.chapters.length - 1) { this.unlockedAll = true; this.go(1); } else this.go(this.idx + 1); }
  prev() { if (this.idx > 1) this.go(this.idx - 1); }

  ready(done = true) { this.ui.setNext(done); if (done && !this._readyPinged) { this._readyPinged = true; } }

  secret(id, title, desc) {
    if (this.state.secrets.has(id)) return false;
    this.state.secrets.add(id); this.state.save();
    this.audio.secret();
    this.ui.toast('Secret found · ' + title, desc, 5200);
    this.updateSecretCount();
    return true;
  }
  allSecrets() { return this.chapters.flatMap((c) => (c.secrets || []).map((s) => ({ ...s, chapter: c.title }))); }
  updateSecretCount() {
    const all = this.allSecrets();
    const found = all.filter((s) => this.state.secrets.has(s.id)).length;
    document.querySelector('#secrets .n').textContent = `${found}/${all.length}`;
  }
  showSecrets() {
    const box = document.createElement('div'); box.className = 'placard';
    const all = this.allSecrets();
    const found = all.filter((s) => this.state.secrets.has(s.id)).length;
    box.innerHTML = `<div class="meta">${found} of ${all.length} found</div><h2>Hidden things</h2><p>Every era hides something. Hints are given for the ones you have not found yet.</p>` +
      all.map((s) => {
        const f = this.state.secrets.has(s.id);
        return `<p style="opacity:${f ? 1 : 0.7}"><span class="code" style="color:var(--ui-accent)">${f ? '◆' : '◇'}</span> <b>${f ? s.title : '???'}</b> <span style="color:var(--ui-dim)">· ${s.chapter}</span><br><span style="color:var(--ui-dim)">${f ? s.desc || '' : 'Hint: ' + s.hint}</span></p>`;
      }).join('');
    this.ui.openModal('Secrets', box);
  }

  // ------------------------------------------------------------------ Input
  _bindInput() {
    const ray = new THREE.Raycaster();
    const nd = new THREE.Vector2();
    const toScreen = (e) => {
      const r = this.canvas.getBoundingClientRect();
      nd.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(nd, this.roomCam);
      const hit = ray.intersectObject(this.monitor.screen)[0];
      if (!hit) return { x: -1, y: -1, inside: false };
      return this.monitor.uvToCanvas(hit.uv);
    };
    const world = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { nx: ((e.clientX - r.left) / r.width) * 2 - 1, ny: -((e.clientY - r.top) / r.height) * 2 + 1, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };
    const send = (type, e) => {
      if (this.busy || !this.cur || this.ui.modalOpen) return;
      const p = this.cur.mode === 'screen' ? toScreen(e) : world(e);
      this.cur.pointer?.(type, p, e, this);
    };
    this.canvas.addEventListener('pointerdown', (e) => { this.canvas.focus({ preventScroll: true }); this.canvas.setPointerCapture(e.pointerId); send('down', e); });
    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      send('move', e);
    });
    this.canvas.addEventListener('pointerup', (e) => send('up', e));
    this.canvas.addEventListener('pointercancel', (e) => send('up', e));
    this.canvas.addEventListener('wheel', (e) => { send('wheel', e); }, { passive: true });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (!this.cur || this.busy || this.ui.modalOpen) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const used = this.cur.key?.(e, true, this);
      if (used) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { if (this.cur && !this.busy) this.cur.key?.(e, false, this); });

    document.getElementById('next').addEventListener('click', () => { this.audio.click(this.ui.sfxEra()); this.next(); });
    document.getElementById('prev').addEventListener('click', () => { this.audio.click(this.ui.sfxEra()); this.prev(); });
    const snd = document.getElementById('sound');
    const setSnd = () => { snd.textContent = this.audio.muted ? 'Sound off' : 'Sound on'; snd.classList.toggle('on', !this.audio.muted); };
    snd.addEventListener('click', () => { this.audio.init(); this.audio.setMuted(!this.audio.muted); setSnd(); });
    setSnd();
    document.getElementById('secrets').addEventListener('click', () => this.showSecrets());
    document.getElementById('share').addEventListener('click', () => openShare(this));
  }

  // returns a lower scale when the GPU is struggling
  adapt(owner, scale, min = 0.2) {
    if (this.lowQuality || this.busy) return scale;
    const now = this.time;
    if (this.perf > 0.036 && scale > min && now - (owner._adaptT || 0) > 1.5) { owner._adaptT = now; return Math.max(min, scale * 0.82); }
    return scale;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.roomCam.aspect = w / h; this.roomCam.updateProjectionMatrix();
    for (const c of this.chapters) if (c._inited && c.mode === 'world' && !(this.diving && c === this.cur)) c.setAspect?.(w / h);
    this.cur?.resize?.(this);
  }

  // ------------------------------------------------------------------ Loop
  frame() {
    const dt = Math.min(this.clock.getDelta(), this.lowQuality ? 0.12 : 1 / 20);
    this.time += dt;
    // smoothed frame time, so heavy rooms can lower their resolution on slow GPUs
    this.perf = this.perf === undefined ? 0.016 : this.perf * 0.95 + Math.min(dt, 0.1) * 0.05;
    if (this._tweens && this._tweens.length) {
      this._tweens = this._tweens.filter((tw) => {
        tw.t += dt / tw.dur; const k = clamp(tw.t, 0, 1);
        tw.fn(tw.smooth ? k : ease(k));
        if (tw.t >= 1) { tw.res(); return false; }
        return true;
      });
    }
    const ch = this.cur;
    if (!ch) { this.renderer.setRenderTarget(null); this.renderer.clear(); return; }
    if (this.journey) {
      this.journey.update(dt, this.time, this);
      if (this.journey.mode === 'world' && this.journey === JOURNEYS.crt) this.monitor.update(this.time, false);
      this.journey.render(this.renderer, null, dt);
      return;
    }

    // update the active chapter (and the outgoing one during a dissolve)
    if (this.transition && this.transition.a && this.transition.a !== ch) this.transition.a.update?.(dt, this.time, this);
    ch.update?.(dt, this.time, this);
    if (ch.mode === 'screen' || this.diving) {
      if (ch.mode === 'screen') ch.draw?.(this.monitor.ctx, dt, this.time, this);
      this.monitor.update(this.time, ch.mode === 'screen');
    } else if (this.transition && this.transition.a && this.transition.a.mode === 'screen') {
      this.monitor.update(this.time, false);
    }

    if (this.diving) {
      ch.render(this.renderer, this.rtDive, dt);
      this.monitor.useTexture(this.rtDive.texture);
      this.monitor.avgColor.setRGB(0.4, 0.45, 0.55);
      this.renderRoom(null, dt);
      return;
    }

    if (this.transition && this.transition.a && this.transition.b) {
      const tr = this.transition;
      this.renderChapter(tr.a, this.rtA, dt);
      this.renderChapter(tr.b, this.rtB, dt);
      this.dissolveMat.uniforms.tA.value = this.rtA.texture;
      this.dissolveMat.uniforms.tB.value = this.rtB.texture;
      this.dissolveMat.uniforms.uT.value = tr.t;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.fsScene, this.fsCam);
      return;
    }
    this.renderChapter(ch, null, dt);
  }

  // ------------------------------------------------------------------ Boot
  start() {
    const gate = document.getElementById('gate');
    const hash = location.hash.replace('#', '');
    const deep = this.chapters.findIndex((c) => c.id === hash);
    if (this.state.sharedSprite) {
      gate.querySelector('.from').textContent = `${this.state.sharedName || 'Someone'} sent you their sprite. It will travel with you.`;
      gate.querySelector('.from').hidden = false;
    }
    this.updateSecretCount();
    this.ui.setEra('museum');
    this.ui.showChrome(false);
    // render the gate dot via the cold-open chapter in "waiting" mode
    this.go(0, { kind: 'cut' }).then(() => this.cur.waiting?.(this));
    const begin = () => {
      gate.removeEventListener('click', begin);
      window.removeEventListener('keydown', begin);
      this.audio.init();
      gate.classList.add('gone');
      if (this.state.sharedSprite) { this.state.sprite = this.state.sharedSprite; this.state.spriteEdited = true; }
      if (deep > 0) {
        this.unlockedAll = true;
        this.ui.showChrome(true);
        this.go(deep, { kind: 'dissolve' });
      } else {
        this.cur.begin?.(this);
      }
    };
    gate.addEventListener('click', begin);
    window.addEventListener('keydown', begin);
  }
}

const app = new App();
window.__mog = app;
app.start();
