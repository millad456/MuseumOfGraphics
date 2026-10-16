import * as THREE from 'three';
import { WorldRoom } from '../world/WorldRoom.js';
import { h } from '../core/dom.js';

// ROOM 12 · The jaggies.
// A loupe shows real pixels from the frame: before anti-aliasing every
// pixel is either inside a shape or not, and edges become stairs. Then the
// whole room is redrawn with several samples per pixel and full resolution.

const LOUPE_PX = 28;     // source pixels across the loupe
const LOUPE_SIZE = 280;  // loupe diameter on screen, CSS pixels

export default (app) => new EdgesRoom(app, {
  id: 'edges', title: 'The Jaggies', years: '1977 – 2009', music: 'lush',
  notes: [
    { title: 'Where the stairs come from', body: [
      'The hardware tests one point per pixel, its centre: inside the triangle or not. Every pixel is all or nothing, so a smooth slanted edge turns into a staircase, and when things move the stairs crawl.',
    ] },
    { title: 'Anti-aliasing', body: [
      'Supersampling renders the picture at a higher resolution and averages blocks of pixels down. Multisampling (MSAA) tests coverage at several points per pixel but computes the colour once, so edges get smooth and flat areas cost almost nothing extra. Modern games often jitter the camera slightly every frame and blend frames together instead (temporal anti-aliasing).',
    ] },
  ],
});

class EdgesRoom extends WorldRoom {
  enter(scope, ctx) {
    const w = this.world;
    this.begin(scope, ctx, 'mipmap', 'edge');
    this.canvas = h('canvas', { class: 'loupe', width: LOUPE_PX * 10, height: LOUPE_PX * 10, style: { width: `${LOUPE_SIZE}px`, height: `${LOUPE_SIZE}px` } });
    this.mark = h('div', { class: 'loupe-mark' });
    scope.mount(this.canvas, this.app.chrome.overlay);
    scope.mount(this.mark, this.app.chrome.overlay);
    this.pixels = new Uint8Array(LOUPE_PX * LOUPE_PX * 4);
    this.target = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.38 };
    this.follow = false;
    const tray = this.app.chrome.tray(scope, 'Lab');
    this.aaSeg = tray.segmented('Edges', [{ value: 'mipmap', label: 'One sample' }, { value: 'aa', label: 'Anti-aliased' }], 'mipmap', (v) => { this.tour.pause(); this.stage(v, { duration: 1.4 }); });
    tray.note('Move the pointer over the room to aim the loupe.');

    this.tour = this.startTour(scope, [
      { caption: 'Look closely: each pixel is either in or out, so every edge becomes a staircase.', duration: 9,
        enter: () => { this.stage('mipmap'); this.aaSeg.set('mipmap'); w.shot('edge', 3); } },
      { caption: 'Test several points inside each pixel and blend them: anti-aliasing.', duration: 9,
        enter: () => { this.stage('aa'); this.aaSeg.set('aa'); } },
      { caption: 'Your turn: aim the loupe and switch between the two.',
        enter: () => { this.stage('aa'); this.aaSeg.set('aa'); } },
    ]);
  }

  pointer(e) {
    if (e.type === 'move') { this.target = { x: e.x, y: e.y }; this.follow = true; }
    super.pointer(e);
  }

  update(dt, t) {
    super.update(dt, t);
    if (!this.follow) this.target = this.edgePoint(t);
  }

  /** A point on the outline of the big glass ball that creeps around it, so the loupe always shows an edge. */
  edgePoint(t) {
    const w = this.world, s = w.def.spheres[0], cam = w.camera;
    const c = new THREE.Vector3(...s.c);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const a = 0.75 + Math.sin(t * 0.25) * 0.5;
    const p = c.clone().addScaledVector(right, Math.cos(a) * s.r).addScaledVector(up, Math.sin(a) * s.r).project(cam);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  render(renderer, target) {
    super.render(renderer, target);
    if (!this.canvas) return;
    this.drawLoupe(renderer);
  }

  /** Copy a small block of real frame pixels and draw them big, with a pixel grid. */
  drawLoupe(renderer) {
    const w = this.world;
    // copy the latest frame into an 8-bit target that can be read back cheaply
    if (!this.rt) this.rt = new THREE.WebGLRenderTarget(4, 4);
    const src = w.lastFrame;
    if (this.rt.width !== src.width || this.rt.height !== src.height) this.rt.setSize(src.width, src.height);
    w.present.material.uniforms.tSrc.value = src.texture;
    w.present.render(renderer, this.rt);
    renderer.setRenderTarget(null);
    const rt = this.rt;
    const pr = renderer.getPixelRatio();
    const cx = Math.round(this.target.x * pr), cy = Math.round((window.innerHeight - this.target.y) * pr);
    const x0 = Math.max(0, Math.min(rt.width - LOUPE_PX, cx - LOUPE_PX / 2)), y0 = Math.max(0, Math.min(rt.height - LOUPE_PX, cy - LOUPE_PX / 2));
    try { renderer.readRenderTargetPixels(rt, x0, y0, LOUPE_PX, LOUPE_PX, this.pixels); } catch { return; }
    const x = this.canvas.getContext('2d'), s = 10;
    const toByte = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v / 255)), 1 / 2.2));
    for (let j = 0; j < LOUPE_PX; j++) for (let i = 0; i < LOUPE_PX; i++) {
      const k = ((LOUPE_PX - 1 - j) * LOUPE_PX + i) * 4;
      x.fillStyle = `rgb(${toByte(this.pixels[k])},${toByte(this.pixels[k + 1])},${toByte(this.pixels[k + 2])})`;
      x.fillRect(i * s, j * s, s, s);
    }
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1;
    for (let i = 0; i <= LOUPE_PX; i++) { x.beginPath(); x.moveTo(i * s + 0.5, 0); x.lineTo(i * s + 0.5, LOUPE_PX * s); x.stroke(); x.beginPath(); x.moveTo(0, i * s + 0.5); x.lineTo(LOUPE_PX * s, i * s + 0.5); x.stroke(); }
    const m = this.mark.style, size = LOUPE_PX / pr;
    m.width = m.height = `${size}px`; m.left = `${this.target.x - size / 2}px`; m.top = `${this.target.y - size / 2}px`;
    const css = this.canvas.style;
    css.left = `${Math.min(window.innerWidth - LOUPE_SIZE - 16, this.target.x + 40)}px`;
    css.top = `${Math.max(70, Math.min(window.innerHeight - LOUPE_SIZE - 200, this.target.y - LOUPE_SIZE / 2))}px`;
  }
}
