import * as THREE from 'three';
import { PathTracer, TONEMAP_GLSL, MAT, intersectJS, traceJS } from '../gfx/pathtracer.js';

// ROOM 16 — Simulating light. A progressive path tracer: every pixel fires a
// ray, follows it through reflections and refractions, and averages the
// results over time. Click any pixel to see one of its rays drawn in 3D.

const DISPLAY = /* glsl */`
uniform sampler2D tSrc; uniform float uExposure; varying vec2 vUv;
${TONEMAP_GLSL}
void main(){ gl_FragColor = vec4(aces(texture2D(tSrc, vUv).rgb * uExposure), 1.0);
  #include <colorspace_fragment>
}`;

const MATS = [
  { v: 'glass', l: 'Glass', m: MAT.GLASS, p: 1.5, col: [1, 1, 1] },
  { v: 'mirror', l: 'Mirror', m: MAT.METAL, p: 0.0, col: [0.95, 0.95, 0.95] },
  { v: 'gold', l: 'Gold', m: MAT.METAL, p: 0.18, col: [1.0, 0.72, 0.35] },
  { v: 'matte', l: 'Matte', m: MAT.DIFFUSE, p: 0, col: [0.8, 0.78, 0.74] },
  { v: 'light', l: 'Light', m: MAT.EMIT, p: 5, col: [1.0, 0.85, 0.6] },
];

export default {
  id: 'raytrace', title: 'Simulating Light', year: '1980 · 1986 · 2018', tagline: 'Stop faking it. Follow the light itself, bounce by bounce, and every effect from the previous rooms appears on its own.',
  mode: 'world', ui: 'glass20', music: 'ambient',
  secrets: [
    { id: 'hallmirrors', title: 'Hall of mirrors', hint: 'Turn every sphere into a mirror.', desc: 'Each reflection is another bounce. Raise the bounce limit and they go on forever.' },
    { id: 'zerobounce', title: 'Only the lights', hint: 'Set the bounce limit to zero.', desc: 'With no bounces, a ray can only see things that glow.' },
    { id: 'raypath', title: 'One ray, followed', hint: 'Follow a ray into the glass sphere.', desc: 'Refract in, refract out, maybe reflect: Snell and Fresnel, per ray.' },
  ],
  notes: [
    {
      title: 'Turning it around', meta: '1980',
      body: `<p>In reality, light leaves a lamp, bounces around, and a tiny fraction reaches your eye. Simulating that wastes nearly every ray. Ray tracing runs it backwards: from the eye, through each pixel, into the scene. When the ray hits a mirror it reflects; when it hits glass it refracts. These are the two rules from the optics bench.</p><p>A 1980 paper showed recursive reflections, refractions and shadows this way. Each frame took minutes.</p>`,
    },
    {
      title: 'Path tracing', meta: '1986',
      body: `<p>Matte surfaces scatter light in all directions, so a single reflected ray is not enough. Path tracing, building on the 1986 "rendering equation", sends rays off in random directions and averages many tries per pixel. That randomness is the grain you see at first; it fades as samples accumulate.</p><p>Soft shadows, light bleeding colour from the amber wall, glowing caustics under the glass: nothing here is a special effect. They all emerge from the same bounce loop.</p>`,
    },
    {
      title: 'Bounces', meta: 'How deep to go',
      body: `<p>The <b>Bounces</b> slider sets how many times a ray may bounce before we give up. 0: only things that glow are visible. 1: direct light, with hard-edged contrast. 2–3: light starts to bounce off walls and fill the shadows. Glass needs several bounces to get in and out again.</p>`,
    },
    {
      title: 'Real time, at last', meta: '2018',
      body: `<p>For decades this was for films and architecture, at hours per frame. In 2018 consumer graphics cards gained dedicated hardware for testing rays against triangles, and games began mixing ray-traced light into rasterized frames, with AI denoisers cleaning up the grain. This page is running a small path tracer in your browser, right now.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    this.pt = new PathTracer(app.renderer);
    this.pt.scale = app.lowQuality ? 0.15 : Math.min(0.75, 1.1 / (window.devicePixelRatio || 1));
    this.S = this.pt.sceneDef;
    this.disp = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uExposure: { value: 1 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: DISPLAY });
    this.qs = new THREE.Scene(); this.qs.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.disp));
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.overlay = new THREE.Scene();
    this.pathLine = null; this.markers = new THREE.Group(); this.overlay.add(this.markers);
    const c = this.S.cam;
    this.target = new THREE.Vector3(...c.look);
    const off = new THREE.Vector3(...c.pos).sub(this.target);
    this.sph = { r: off.length(), th: Math.atan2(off.x, off.z), ph: Math.acos(off.y / off.length()) };
    this.selected = 0; this.follow = false;
    this.labels = document.createElement('div'); this.labels.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    document.getElementById('ui').appendChild(this.labels);
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  setAspect() { const r = this.app.renderer.domElement; this.pt.setSize(r.width, r.height); },

  enter(app) { this.buildControls(); app.ui.showChrome(true); this.labels.style.display = ''; },
  exit() { this.labels.style.display = 'none'; },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Path tracer');
    this.obj = [ui.objective('Change the bounce limit'), ui.objective('Follow one ray (toggle, then click the image)')];
    ui.slider('Bounces', { min: 0, max: 10, step: 1, value: this.pt.uniforms.uBounces.value, fmt: (v) => v.toFixed(0) }, (v) => {
      this.pt.uniforms.uBounces.value = v; this.pt.reset(); this.obj[0].done(); this.app.ready(true);
      if (v === 0) this.app.secret('zerobounce', 'Only the lights', 'With no bounces, a ray can only see things that glow.');
    });
    ui.slider('Exposure', { min: 0.3, max: 3, step: 0.01, value: 1 }, (v) => (this.disp.uniforms.uExposure.value = v));
    this.selLabel = ui.hint('');
    this.matSeg = ui.segmented('Material of selected sphere', MATS.map((m) => ({ v: m.v, l: m.l })), this.matOf(this.selected), (v) => this.setMat(v));
    const r = ui.row();
    this.followT = ui.toggle('Follow one ray', this.follow, (v) => { this.follow = v; if (!v) this.clearPath(); }, r);
    ui.button('Next sphere', () => this.select((this.selected + 1) % this.S.spheres.length), r);
    this.read = ui.readout();
    ui.hint('Drag to orbit (the image restarts and sharpens again). Click a sphere to select it.');
    this.select(this.selected);
  },

  matOf(i) {
    const s = this.S.spheres[i];
    if (s.m === MAT.GLASS) return 'glass'; if (s.m === MAT.EMIT) return 'light'; if (s.m === MAT.DIFFUSE) return 'matte';
    return s.p > 0.1 ? 'gold' : 'mirror';
  },
  select(i) {
    this.selected = i;
    const names = ['the big centre sphere', 'the left sphere', 'the right sphere', 'the small front-right sphere', 'the small front-left sphere'];
    this.selLabel && (this.selLabel.textContent = 'Selected: ' + (names[i] || 'sphere ' + i));
    this.matSeg?.set(this.matOf(i));
  },
  setMat(v) {
    const m = MATS.find((x) => x.v === v), s = this.S.spheres[this.selected];
    s.m = m.m; s.p = m.p; s.col = m.col.slice();
    this.pt.syncScene();
    if (this.S.spheres.every((q) => q.m === MAT.METAL && q.p < 0.1)) this.app.secret('hallmirrors', 'Hall of mirrors', 'Each reflection is another bounce. Raise the bounce limit and they go on.');
  },

  clearPath() { if (this.pathLine) { this.overlay.remove(this.pathLine); this.pathLine = null; } this.markers.clear(); this.labels.innerHTML = ''; this.pathPts = null; },

  pointer(type, p, e, app) {
    if (type === 'down') { this.drag = { x: p.x, y: p.y, th: this.sph.th, ph: this.sph.ph, moved: false }; return; }
    if (type === 'move' && this.drag && e.buttons) {
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      if (this.drag.moved) { this.sph.th = this.drag.th - dx * 0.004; this.sph.ph = Math.max(0.6, Math.min(1.75, this.drag.ph - dy * 0.004)); this.camDirty = true; }
      return;
    }
    if (type === 'wheel') { this.sph.r = Math.max(3, Math.min(12, this.sph.r * Math.pow(1.001, e.deltaY))); this.camDirty = true; return; }
    if (type === 'up' && this.drag) {
      const click = !this.drag.moved; this.drag = null;
      if (!click) return;
      const cam = this.pt.camera;
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(p.nx, p.ny), cam);
      const ro = cam.position.toArray(), rd = ray.ray.direction.toArray();
      const h = intersectJS(this.S, ro, rd);
      if (h.kind === 'sphere') { this.select(h.i); app.audio.click('modern'); }
      if (this.follow) this.showPath(ro, rd, h);
    }
  },

  showPath(ro, rd, first) {
    this.clearPath();
    let seed = 7; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pts = traceJS(this.S, ro, rd, Math.max(1, this.pt.uniforms.uBounces.value), rng);
    // start the line slightly in front of the eye so it is visible
    const start = new THREE.Vector3(...pts[0].p).add(new THREE.Vector3(...rd).multiplyScalar(0.8));
    const v = [start, ...pts.slice(1).map((q) => new THREE.Vector3(...q.p))];
    const g = new THREE.BufferGeometry().setFromPoints(v);
    this.pathLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe7b8, depthTest: false, transparent: true }));
    this.overlay.add(this.pathLine);
    this.pathPts = pts.slice(1).map((q, i) => ({ p: new THREE.Vector3(...q.p), ev: q.event || q.kind, i }));
    this.pathPts.forEach((q) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); m.position.copy(q.p); this.markers.add(m); });
    this.labels.innerHTML = this.pathPts.map((q) => `<div class="toast" style="position:absolute;padding:4px 8px;font-size:12px;animation:none;transform:translate(10px,-50%)" data-i="${q.i}"><b style="margin:0">${q.i + 1}</b>&nbsp;${q.ev}</div>`).join('');
    this.obj[1].done();
    if (first.kind === 'sphere' && this.S.spheres[first.i].m === MAT.GLASS) this.app.secret('raypath', 'One ray, followed', 'Refract in, refract out, sometimes reflect. Snell and Fresnel, decided per ray.');
    this.app.audio.chime(pts.map((_, i) => 74 + i * 3).slice(0, 6), 'triangle', 0.06);
  },

  update(dt, t) {
    if (this.camDirty) {
      const { r, th, ph } = this.sph, c = this.pt.camera;
      c.position.set(this.target.x + r * Math.sin(ph) * Math.sin(th), this.target.y + r * Math.cos(ph), this.target.z + r * Math.sin(ph) * Math.cos(th));
      c.lookAt(this.target); this.pt.reset(); this.camDirty = false;
    }
    if (this.pathPts) {
      const W = window.innerWidth, H = window.innerHeight;
      this.labels.querySelectorAll('[data-i]').forEach((el) => {
        const q = this.pathPts[+el.dataset.i]; const v = q.p.clone().project(this.pt.camera);
        el.style.left = ((v.x + 1) / 2 * W) + 'px'; el.style.top = ((1 - v.y) / 2 * H) + 'px';
        el.style.display = v.z < 1 ? '' : 'none';
      });
    }
    const spp = this.pt.frame;
    const px = this.pt.uniforms.uRes.value.x * this.pt.uniforms.uRes.value.y;
    this.read && (this.read.textContent = `samples per pixel  ${spp}\nrays traced        ${(spp * px / 1e6).toFixed(1)} million\nresolution         ${this.pt.uniforms.uRes.value.x}×${this.pt.uniforms.uRes.value.y}`);
  },

  render(renderer, target) {
    const ns = this.app.adapt(this, this.pt.scale, 0.25);
    if (ns !== this.pt.scale) { this.pt.scale = ns; const r = renderer.domElement; this.pt.setSize(r.width, r.height); }
    const spf = this.app.lowQuality ? 1 : this.pt.frame < 64 ? 2 : 1;
    if (this.pt.frame < 4000) this.pt.step(spf);
    this.disp.uniforms.tSrc.value = this.pt.texture;
    renderer.setRenderTarget(target); renderer.render(this.qs, this.qc);
    if (this.pathLine) {
      const ac = renderer.autoClear; renderer.autoClear = false;
      renderer.render(this.overlay, this.pt.camera); renderer.autoClear = ac;
    }
  },
};
