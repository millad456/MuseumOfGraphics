import * as THREE from 'three';
import { Orbit, makeStars, voxelGeometry } from '../gfx/lab.js';

// ROOM 07 — Filling the triangle. Rasterization decides which pixels a
// triangle covers; the depth buffer decides which triangle wins each pixel.

const DEPTH_VIEW = /* glsl */`
varying float vZ;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`;
const DEPTH_FRAG = /* glsl */`
varying float vZ; uniform float uNear, uFar;
void main(){ float d = clamp((vZ - uNear) / (uFar - uNear), 0.0, 1.0); gl_FragColor = vec4(vec3(1.0 - pow(d, 0.7)), 1.0); }`;

function faceColored(geo, hue, sat = 0.75, light = 0.55, jitter = 0.08) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    c.setHSL(hue + (Math.random() - 0.5) * jitter * 0.5, sat, light + (Math.random() - 0.5) * jitter * 2);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export default {
  id: 'raster', title: 'The Triangle', year: '1967–1995', tagline: 'Which pixels does this triangle cover, and which triangle is in front?',
  mode: 'world', ui: 'grad98', music: 'synth',
  secrets: [
    { id: 'backface', title: 'The floor has one side', hint: 'Look at the floor from underneath.', desc: 'Triangles facing away from the camera are skipped: backface culling.' },
    { id: 'painter', title: "Painter's nightmare", hint: 'Turn off the depth buffer and look at the interlocking shapes.', desc: 'Sorting whole objects by distance fails when they intersect.' },
  ],
  notes: [
    {
      title: 'Why triangles', meta: 'The universal shape',
      body: `<p>Any surface can be approximated by triangles, and a triangle is the simplest shape that is always flat and never folds over itself. So graphics hardware does one job extremely well: fill triangles.</p><p>Every coloured facet in this room is one triangle. Your sprite alone is several thousand of them.</p>`,
    },
    {
      title: 'Inside or outside?', meta: 'Edge functions',
      body: `<p>For each pixel the rasterizer asks a simple question three times: is the centre of this pixel on the inner side of edge AB? Of BC? Of CA? Each test is a tiny cross product:</p>
      <div class="eq">E(p) = (b.x − a.x)·(p.y − a.y) − (b.y − a.y)·(p.x − a.x)</div><p>All three positive means the pixel is inside. The three values, scaled to add up to 1, are the pixel's <b>barycentric coordinates</b>: how much of each corner it is made of. That is how colours, depths and later textures are blended across a triangle. Drag the corners in the Rasterizer window.</p>`,
    },
    {
      title: 'The depth buffer', meta: '1974',
      body: `<p>When two triangles cover the same pixel, which one wins? The <b>z-buffer</b> stores, for every pixel, the depth of the nearest thing drawn there so far. A new fragment is only drawn if it is closer. It costs one extra number per pixel and solves visibility for any scene, in any order.</p><p>Switch the view to <b>Depth</b> to see it: white is near, black is far.</p>`,
    },
    {
      title: "The painter's algorithm", meta: 'Before z-buffers',
      body: `<p>Without a depth buffer, you can sort objects from far to near and paint them in that order, like a painter covering the background with the foreground. It fails when objects intersect or overlap in a cycle, because there is no correct order. Switch to <b>No depth buffer</b> and orbit around the interlocking rings.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x04050c);
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.orbit = new Orbit(this.cam, { dist: 11, theta: 0.7, phi: 1.15, target: new THREE.Vector3(0, 0.8, 0), maxPhi: Math.PI - 0.15 });
    s.add(makeStars(1000, 90));
    this.basic = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.objects = [];
    const add = (geo, hue, pos, rot = [0, 0, 0], light = 0.55) => {
      const m = new THREE.Mesh(faceColored(geo, hue, 0.75, light), this.basic);
      m.position.set(...pos); m.rotation.set(...rot); s.add(m); this.objects.push(m); return m;
    };
    // interlocking rings: the painter's algorithm cannot order these
    this.ringA = add(new THREE.TorusGeometry(1.5, 0.35, 10, 28), 0.58, [-3.2, 1.3, 0.6], [0, 0, 0]);
    this.ringB = add(new THREE.TorusGeometry(1.5, 0.35, 10, 28), 0.08, [-1.7, 1.3, 0.6], [Math.PI / 2, 0, 0]);
    this.knot = add(new THREE.IcosahedronGeometry(1.2, 1), 0.78, [3.2, 1.2, -0.4]);
    this.box = add(new THREE.BoxGeometry(1.6, 1.6, 1.6), 0.14, [2.6, 0.8, 2.2], [0.3, 0.7, 0], 0.5);
    this.sprite = null;
    // single-sided floor
    const floorGeo = faceColored(new THREE.PlaneGeometry(18, 18, 9, 9), 0.64, 0.45, 0.16, 0.25);
    this.floor = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -0.8; s.add(this.floor);
    this.depthMat = new THREE.ShaderMaterial({ uniforms: { uNear: { value: 3 }, uFar: { value: 22 } }, vertexShader: DEPTH_VIEW, fragmentShader: DEPTH_FRAG });
    this.overMat = new THREE.MeshBasicMaterial({ color: 0x3a2008, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.25 });
    this.view = 'color'; this.wire = false;
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); },

  enter(app) {
    if (this.sprite) { this.scene.remove(this.sprite); this.objects = this.objects.filter((o) => o !== this.sprite); }
    const vg = voxelGeometry(app.state.sprite, 0.16, 2);
    this.sprite = new THREE.Mesh(faceColored(vg, 0.55, 0.8, 0.6, 0.18), this.basic);
    this.sprite.position.set(0.2, 1.4, -2.2); this.scene.add(this.sprite); this.objects.push(this.sprite);
    this.buildControls();
    this.buildLab();
    app.ui.showChrome(true);
  },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Depth');
    this.obj = [ui.objective('Drag a corner in the Rasterizer'), ui.objective('Look at the depth buffer')];
    this.viewSeg = ui.segmented('View', [{ v: 'color', l: 'Colour' }, { v: 'depth', l: 'Depth' }, { v: 'painter', l: 'No depth buffer' }, { v: 'over', l: 'Overdraw' }], this.view, (v) => {
      this.view = v;
      if (v === 'depth') { this.obj[1].done(); this.app.ready(true); }
      if (v === 'painter') this._painterT = 0;
    });
    ui.toggle('Triangle edges', this.wire, (v) => (this.wire = v), ui.row());
    this.read = ui.readout();
    ui.hint('Drag to orbit. Scroll to zoom.');
  },

  buildLab() {
    const bd = this.app.ui.extraWindow('Rasterizer', { left: 14, bottom: 70 }, 392);
    const cv = (this.labCv = document.createElement('canvas'));
    this.GW = 20; this.GH = 13; this.cell = 18;
    cv.width = this.GW * this.cell; cv.height = this.GH * this.cell;
    cv.style.cssText = 'width:100%;height:auto;display:block;background:#000;touch-action:none;cursor:crosshair';
    bd.appendChild(cv);
    const r = document.createElement('div'); r.className = 'row'; bd.appendChild(r);
    this.interp = true; this.scan = false;
    this.app.ui.toggle('Blend corner colours', this.interp, (v) => (this.interp = v), r);
    this.app.ui.toggle('Scan pixels', this.scan, (v) => { this.scan = v; this.scanI = 0; }, r);
    this.labRead = document.createElement('div'); this.labRead.className = 'readout'; bd.appendChild(this.labRead);
    this.V = this.V || [[3.2, 10.8], [17.5, 7.4], [8.4, 1.6]];
    const toGrid = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / b.width * this.GW, (e.clientY - b.top) / b.height * this.GH]; };
    cv.addEventListener('pointerdown', (e) => {
      const p = toGrid(e); let bi = -1, bd2 = 2.5;
      this.V.forEach((v, i) => { const d = Math.hypot(v[0] - p[0], v[1] - p[1]); if (d < bd2) { bd2 = d; bi = i; } });
      this.dragV = bi; cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = toGrid(e); this.labHover = p;
      if (this.dragV >= 0 && e.buttons) {
        this.V[this.dragV] = [Math.max(0, Math.min(this.GW, p[0])), Math.max(0, Math.min(this.GH, p[1]))];
        if (!this._dragged) { this._dragged = true; this.obj[0].done(); this.app.ready(true); }
      }
    });
    cv.addEventListener('pointerup', () => (this.dragV = -1));
    cv.addEventListener('pointerleave', () => (this.labHover = null));
  },

  drawLab(dt) {
    const cv = this.labCv; if (!cv) return;
    const x = cv.getContext('2d'), c = this.cell, [A, B, C] = this.V;
    const E = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const area = E(A, B, C);
    x.fillStyle = '#05060c'; x.fillRect(0, 0, cv.width, cv.height);
    let covered = 0;
    const total = this.GW * this.GH;
    if (this.scan) this.scanI = ((this.scanI || 0) + dt * 60) % (total + 30);
    const limit = this.scan ? Math.floor(this.scanI) : total;
    let hoverInfo = '';
    for (let j = 0; j < this.GH; j++) for (let i = 0; i < this.GW; i++) {
      const k = j * this.GW + i; if (k >= limit) continue;
      const p = [i + 0.5, j + 0.5];
      const w0 = E(B, C, p) / area, w1 = E(C, A, p) / area, w2 = E(A, B, p) / area;
      const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
      if (inside) {
        covered++;
        x.fillStyle = this.interp ? `rgb(${Math.round(255 * w0)},${Math.round(255 * w1)},${Math.round(255 * w2)})` : '#ffb547';
        x.fillRect(i * c, j * c, c - 1, c - 1);
      }
      x.fillStyle = inside ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.25)';
      x.fillRect(i * c + c / 2 - 1, j * c + c / 2 - 1, 2, 2);
      if (this.labHover && Math.floor(this.labHover[0]) === i && Math.floor(this.labHover[1]) === j) {
        x.strokeStyle = '#fff'; x.strokeRect(i * c + 0.5, j * c + 0.5, c - 2, c - 2);
        hoverInfo = `\npixel (${i}, ${j})  ${inside ? 'INSIDE' : 'outside'}\nweights  A ${w0.toFixed(2)}  B ${w1.toFixed(2)}  C ${w2.toFixed(2)}`;
      }
    }
    if (this.scan && limit < total) { const i = limit % this.GW, j = Math.floor(limit / this.GW); x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(i * c, j * c, c - 1, c - 1); }
    // grid lines + the true triangle
    x.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i <= this.GW; i++) { x.beginPath(); x.moveTo(i * c, 0); x.lineTo(i * c, cv.height); x.stroke(); }
    for (let j = 0; j <= this.GH; j++) { x.beginPath(); x.moveTo(0, j * c); x.lineTo(cv.width, j * c); x.stroke(); }
    x.strokeStyle = '#ffffff'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(A[0] * c, A[1] * c); x.lineTo(B[0] * c, B[1] * c); x.lineTo(C[0] * c, C[1] * c); x.closePath(); x.stroke(); x.lineWidth = 1;
    const cols = ['#ff3b3b', '#3bff6a', '#3b8bff'];
    this.V.forEach((v, i) => { x.fillStyle = cols[i]; x.beginPath(); x.arc(v[0] * c, v[1] * c, 7, 0, 7); x.fill(); x.fillStyle = '#000'; x.font = 'bold 10px sans-serif'; x.fillText('ABC'[i], v[0] * c - 3.5, v[1] * c + 3.5); });
    this.labRead.textContent = `${covered} of ${total} pixel centres inside${area < 0 ? '  (winding flipped: back face!)' : ''}${hoverInfo}`;
  },

  pointer(type, p, e) { this.orbit.handle(type, p, e); },

  update(dt, t, app) {
    this.orbit.update(dt);
    this.ringA.rotation.y += dt * 0.5; this.ringB.rotation.z += dt * 0.5;
    this.knot.rotation.y += dt * 0.3; this.sprite.rotation.y = Math.sin(t * 0.4) * 0.6;
    if (this.cam.position.y < this.floor.position.y - 0.05) app.secret('backface', 'The floor has one side', 'Seen from behind, its triangles are skipped. This is backface culling: half the work, for free.');
    if (this.view === 'painter') { this._painterT = (this._painterT || 0) + dt; if (this._painterT > 4) app.secret('painter', "Painter's nightmare", 'Sorting whole objects by distance fails when they intersect.'); }
    let tris = 0; this.objects.forEach((o) => (tris += o.geometry.attributes.position.count / 3));
    tris += this.floor.geometry.attributes.position.count / 3;
    this.read && (this.read.textContent = `${tris.toLocaleString()} triangles\nview: ${this.view}\ncamera height ${this.cam.position.y.toFixed(1)}`);
    this.drawLab(dt);
  },

  render(renderer, target) {
    const all = [...this.objects, this.floor];
    const v = this.view;
    all.forEach((o) => { o.userData.mat = o.userData.mat || o.material; o.material = o.userData.mat; o.renderOrder = 0; });
    if (v === 'depth') all.forEach((o) => (o.material = this.depthMat));
    if (v === 'over') all.forEach((o) => (o.material = this.overMat));
    if (v === 'painter') {
      // sort whole objects far to near and paint without depth testing
      const cp = this.cam.position;
      all.forEach((o) => { o.material = o.userData.painterMat || (o.userData.painterMat = Object.assign(o.userData.mat.clone(), { depthTest: false, depthWrite: false })); });
      all.sort((a, b) => b.position.distanceTo(cp) - a.position.distanceTo(cp)).forEach((o, i) => (o.renderOrder = i + (o === this.floor ? -100 : 0)));
    }
    this.scene.background.set(v === 'over' ? 0x000000 : v === 'depth' ? 0x000000 : 0x04050c);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
    if (this.wire && v !== 'over') {
      const ac = renderer.autoClear; renderer.autoClear = false;
      all.forEach((o) => (o.material = this.wireMat));
      const bg = this.scene.background; this.scene.background = null;
      renderer.render(this.scene, this.cam);
      this.scene.background = bg; renderer.autoClear = ac;
      all.forEach((o) => (o.material = o.userData.mat));
    }
  },
};
