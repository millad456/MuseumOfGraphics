import * as THREE from 'three';
import { WorldRoom } from '../world/WorldRoom.js';
import { MAT, intersectJS, traceJS } from '../gfx/PathTracer.js';
import { h } from '../core/dom.js';

// ROOM 16 · Simulating light.
// The last wave: the room stops being faked and starts being simulated.
// Every pixel follows random paths of light through reflections and
// refractions, and the average of many paths is the picture. Click to see
// one of those paths drawn in the room.

const MATERIALS = [
  { value: 'glass', label: 'Glass', m: MAT.GLASS, p: 1.5, col: [1, 1, 1] },
  { value: 'mirror', label: 'Mirror', m: MAT.METAL, p: 0.0, col: [0.95, 0.95, 0.95] },
  { value: 'gold', label: 'Gold', m: MAT.METAL, p: 0.18, col: [1.0, 0.72, 0.35] },
  { value: 'matte', label: 'Matte', m: MAT.DIFFUSE, p: 0, col: [0.8, 0.78, 0.74] },
  { value: 'light', label: 'Light', m: MAT.EMIT, p: 5, col: [1.0, 0.85, 0.6] },
];
const NAMES = ['the big glass ball', 'the left ball', 'the right ball', 'the small gold ball', 'the small glass ball'];

export default (app) => new PathRoom(app, {
  id: 'pathtrace', title: 'Simulating Light', years: '1980 · 1986 · 2018', music: 'ambient',
  secrets: [
    { id: 'one-ray', title: 'One ray, followed', hint: 'Follow a ray into the big glass ball.', desc: 'In, out, maybe reflected: decided ray by ray.' },
    { id: 'only-lights', title: 'Only the lights', hint: 'Allow zero bounces.', desc: 'With no bounces, a ray can only see things that glow.' },
    { id: 'mirrors', title: 'Hall of mirrors', hint: 'Turn every ball into a mirror.', desc: 'Every reflection is one more bounce.' },
  ],
  notes: [
    { title: 'Running light backwards', body: [
      'Real light leaves a lamp, bounces around, and a tiny fraction reaches your eye. Simulating that wastes nearly every ray, so ray tracing runs it backwards: from the eye, through each pixel, into the room. Mirrors reflect the ray, glass bends it with the same two rules as on the optics bench. A 1980 paper rendered reflections, refractions and shadows this way, at minutes per picture.',
    ] },
    { title: 'Path tracing', body: [
      'Matte surfaces scatter light in every direction, so one ray per pixel is not enough. Path tracing (building on the 1986 “rendering equation”) sends rays off in random directions and averages many attempts per pixel. The grain at first is that randomness; it fades as samples add up. Soft shadows, colour bleeding from the walls and light focused through glass all appear without being programmed in.',
    ] },
    { title: 'Real time, at last', body: [
      'For decades this took hours per frame. In 2018 consumer graphics cards gained hardware for testing rays against triangles, and games began mixing ray-traced light into their frames, with neural networks cleaning up the noise. This page is running a small path tracer in your browser right now.',
    ] },
  ],
});

class PathRoom extends WorldRoom {
  enter(scope, ctx) {
    const w = this.world, pt = w.pathTracer, def = w.def;
    this.begin(scope, ctx, 'hdr', 'final');
    const saved = def.spheres.map((s) => ({ ...s, col: s.col.slice() }));
    const savedBounces = pt.uniforms.uBounces.value;
    this.overlay = new THREE.Scene();
    this.labels = h('div', { class: 'ray-labels' });
    scope.mount(this.labels, this.app.chrome.overlay);
    this.selected = 0;
    scope.add(() => {
      saved.forEach((s, i) => Object.assign(def.spheres[i], s));
      pt.syncScene(); pt.uniforms.uBounces.value = savedBounces;
      this.path = null;
    });

    const tray = this.app.chrome.tray(scope, 'Lab');
    tray.slider('Bounces', { min: 0, max: 10, step: 1, value: savedBounces, format: (v) => String(v) }, (v) => {
      pt.uniforms.uBounces.value = v; pt.reset(); this.tour.pause();
      if (v === 0) this.app.secret('only-lights', 'Only the lights', 'With no bounces, a ray can only see things that glow.');
    });
    this.selLabel = tray.note(`Click a ball to select it. Selected: ${NAMES[0]}`);
    this.matSeg = tray.segmented('Make it', MATERIALS.map((m) => ({ value: m.value, label: m.label })), this.materialOf(0), (v) => this.setMaterial(v));
    this.readout = tray.readout();

    this.tour = this.startTour(scope, [
      { caption: 'Stop faking it. Follow rays of light as they really bounce around the room.', duration: 9,
        enter: () => { w.shot('final', 2.5); this.stage('path', { duration: 3.4 }); } },
      { caption: 'Each pixel averages many random paths of light. The grain fades as they add up.', duration: 9,
        enter: () => this.stage('path') },
      { caption: 'Soft shadows, colour bouncing off the walls, light focused through glass: none of it is a trick.', duration: 9,
        enter: () => this.stage('path') },
      { caption: 'Your turn: click anywhere in the room to follow one ray.',
        enter: () => this.stage('path') },
    ]);
  }

  materialOf(i) {
    const s = this.world.def.spheres[i];
    if (s.m === MAT.GLASS) return 'glass';
    if (s.m === MAT.EMIT) return 'light';
    if (s.m === MAT.DIFFUSE) return 'matte';
    return s.p > 0.1 ? 'gold' : 'mirror';
  }

  select(i) {
    this.selected = i;
    this.selLabel.textContent = `Click a ball to select it. Selected: ${NAMES[i] || 'a ball'}`;
    this.matSeg.set(this.materialOf(i));
  }

  setMaterial(v) {
    const m = MATERIALS.find((x) => x.value === v), s = this.world.def.spheres[this.selected];
    Object.assign(s, { m: m.m, p: m.p, col: m.col.slice() });
    this.world.pathTracer.syncScene();
    this.path = null; this.labels.replaceChildren();
    if (this.world.def.spheres.every((q) => q.m === MAT.METAL && q.p < 0.1)) this.app.secret('mirrors', 'Hall of mirrors', 'Every reflection is one more bounce.');
  }

  pointer(e) {
    if (e.type === 'down') this._down = { x: e.x, y: e.y };
    if (e.type === 'up' && this._down && Math.hypot(e.x - this._down.x, e.y - this._down.y) < 5 && this.world.current.key === 'path') this.follow(e);
    if (e.type === 'up') this._down = null;
    // keep the camera still while the picture converges; only clicks here
  }

  follow(e) {
    const w = this.world, cam = w.camera;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(e.nx, e.ny), cam);
    const ro = cam.position.toArray(), rd = ray.ray.direction.toArray();
    const first = intersectJS(w.def, ro, rd);
    if (first.kind === 'sphere') this.select(first.i);
    let seed = 7 + Math.floor(Math.random() * 1000);
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pts = traceJS(w.def, ro, rd, Math.max(1, w.pathTracer.uniforms.uBounces.value), rng);
    const start = new THREE.Vector3(...ro).add(new THREE.Vector3(...rd).multiplyScalar(0.6));
    this.overlay.clear();
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, ...pts.slice(1).map((q) => new THREE.Vector3(...q.p))]), new THREE.LineBasicMaterial({ color: 0xffe7b8, depthTest: false, transparent: true }));
    this.overlay.add(line);
    this.path = pts.slice(1).map((q, i) => ({ p: new THREE.Vector3(...q.p), what: q.event || q.kind, i }));
    for (const q of this.path) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); m.position.copy(q.p); this.overlay.add(m); }
    this.labels.replaceChildren(...this.path.map((q) => h('div', { class: 'ray-label', dataset: { i: String(q.i) } }, `${q.i + 1} · ${q.what}`)));
    this.tour.pause();
    if (first.kind === 'sphere' && w.def.spheres[first.i].m === MAT.GLASS && first.i === 0) this.app.secret('one-ray', 'One ray, followed', 'In, out, maybe reflected: decided ray by ray.');
    this.app.audio.chime(pts.map((_, i) => 74 + i * 3).slice(0, 6), 'triangle', 0.06);
  }

  update(dt, t) {
    super.update(dt, t);
    const pt = this.world.pt;
    if (pt && this.readout) {
      const res = pt.uniforms.uRes.value;
      this.readout.textContent = `${pt.frame} samples per pixel · ${((pt.frame * res.x * res.y) / 1e6).toFixed(0)} million rays`;
    }
    if (this.path) {
      const cam = this.world.camera, W = window.innerWidth, H = window.innerHeight;
      for (const el of this.labels.children) {
        const q = this.path[+el.dataset.i], v = q.p.clone().project(cam);
        el.style.left = `${((v.x + 1) / 2) * W}px`; el.style.top = `${((1 - v.y) / 2) * H}px`;
        el.hidden = v.z > 1;
      }
    }
  }

  render(renderer, target) {
    super.render(renderer, target);
    if (this.path) {
      const ac = renderer.autoClear; renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.render(this.overlay, this.world.camera);
      renderer.autoClear = ac;
    }
  }
}
