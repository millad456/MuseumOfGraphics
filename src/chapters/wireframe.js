import * as THREE from 'three';
import { makeGrid, makeStars, Orbit, textSprite } from '../gfx/lab.js';

// ROOM 06 — Through the glass. Everything in 3D begins as a list of points.
// Your sprite becomes voxels; you can follow any vertex through the model,
// view and projection matrices, and step outside the camera to watch the
// picture forming on its image plane.

const fmt = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function spriteVoxelWire(sprite, size = 0.28, depth = 2) {
  // unique lattice vertices and unique edges of every voxel
  const vmap = new Map(), verts = [], edges = new Set(), cols = [];
  const pal = [null, [0.25, 0.55, 1], [0.5, 0.95, 1], [1, 1, 1]];
  const vid = (x, y, z, c) => { const k = x + ',' + y + ',' + z; if (!vmap.has(k)) { vmap.set(k, verts.length / 3); verts.push(x * size, y * size, z * size); cols.push(...pal[c]); } return vmap.get(k); };
  for (let i = 0; i < 256; i++) {
    const v = sprite[i]; if (!v) continue;
    const x0 = (i & 15) - 8, y0 = 8 - (i >> 4) - 1;
    for (let d = 0; d < depth; d++) {
      const z0 = d - depth / 2;
      const c = [];
      for (let k = 0; k < 8; k++) c.push(vid(x0 + (k & 1), y0 + ((k >> 1) & 1), z0 + ((k >> 2) & 1), v));
      [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => { const A = c[a], B = c[b]; edges.add(A < B ? A + '-' + B : B + '-' + A); });
    }
  }
  const pos = new Float32Array(verts), col = new Float32Array(cols);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const idx = []; edges.forEach((e) => { const [a, b] = e.split('-').map(Number); idx.push(a, b); });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.BufferAttribute(col, 3)); lg.setIndex(idx);
  return { pg, lg, count: verts.length / 3, edges: edges.size };
}

export default {
  id: 'wireframe', title: 'The Vertex', year: '1963–1985', tagline: 'Through the glass. In 3D, every shape starts as a list of points and a few matrices.',
  mode: 'world', dive: true, ui: 'grad98', music: 'synth',
  secrets: [
    { id: 'vertigo', title: 'Vertigo', hint: 'Slide all the way from perspective to orthographic.', desc: 'A dolly zoom: narrowing the lens while backing away flattens perspective.' },
  ],
  notes: [
    {
      title: 'Everything is points', meta: 'Vertices',
      body: `<p>A 3D model is, first of all, a list of points in space called <b>vertices</b>, each just three numbers: x, y and z. Lines or triangles are then described as "connect vertex 12 to vertex 13".</p><p>Your sprite from the pixel room is now a 3D model: every lit pixel became a small cube. Hover over any glowing point to see its numbers.</p>`,
    },
    {
      title: 'Matrices move the world', meta: 'Transforms',
      body: `<p>To rotate, scale or move a model, every vertex is multiplied by a 4 × 4 grid of numbers called a <b>matrix</b>. One matrix can hold a rotation, a scale and a move at once, and matrices can be chained:</p>
      <div class="eq">screen ← Projection × View × Model × vertex</div><p><b>Model</b> places the object in the world. <b>View</b> moves the whole world so the camera sits at the origin looking down −z. <b>Projection</b> squeezes the view into a box that will become the screen.</p>`,
    },
    {
      title: 'The perspective divide', meta: 'Projection',
      body: `<p>Far things look smaller because the screen position is divided by distance:</p><div class="eq">x_screen = x ÷ z
y_screen = y ÷ z</div><p>The projection matrix copies the depth into a fourth coordinate, <b>w</b>, and the hardware divides by it. The extra coordinate (called homogeneous coordinates) was brought into computer graphics in the early 1960s and is why the matrices here are 4 × 4 and not 3 × 3.</p><p>It is the same division the parallax layers were doing by hand.</p>`,
    },
    {
      title: 'Outside the camera', meta: 'Image plane',
      body: `<p>Turn on <b>Outside view</b> to step out of the camera. The pyramid is its view frustum: anything inside it can be seen. The glowing rectangle is the image plane. Each orange line runs from a vertex to the camera's eye, and it crosses the image plane exactly where that vertex appears on screen.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x02030a);
    s.fog = new THREE.FogExp2(0x02030a, 0.035);
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.orbit = new Orbit(this.cam, { dist: 9, theta: 0.5, phi: 1.25, target: new THREE.Vector3(0, 0.6, 0) });
    this.god = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.godOrbit = new Orbit(this.god, { dist: 22, theta: 2.2, phi: 1.05, target: new THREE.Vector3(0, 0.6, 3) });
    const grid = makeGrid(0x2a4bff, 0.05); grid.position.y = -2.4; s.add(grid);
    s.add(makeStars(1200, 90));

    this.model = new THREE.Group(); this.model.position.y = 0.6; s.add(this.model);
    this.dotTex = dotTexture();
    this.pmat = new THREE.PointsMaterial({ size: 0.16, map: this.dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lmat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rebuild();

    // a distant wire globe for scale
    const globe = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(30, 2)), new THREE.LineBasicMaterial({ color: 0x1a2a6a, transparent: true, opacity: 0.35 }));
    globe.position.set(0, 6, -60); s.add(globe); this.globe = globe;

    // camera helper + image plane for the outside view
    this.helper = new THREE.CameraHelper(this.cam);
    this.helper.setColors(new THREE.Color(0xffb547), new THREE.Color(0xffb547), new THREE.Color(0xffffff), new THREE.Color(0xffb547), new THREE.Color(0x6688ff));
    this.helper.visible = false; s.add(this.helper);
    this.rt = new THREE.WebGLRenderTarget(512, 384);
    this.imgPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.rt.texture, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
    this.imgPlane.visible = false; s.add(this.imgPlane);
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb547 }));
    this.eye.visible = false; s.add(this.eye);
    this.rayGeo = new THREE.BufferGeometry(); this.rayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 6), 3));
    this.rays = new THREE.LineSegments(this.rayGeo, new THREE.LineBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.55 }));
    this.rays.visible = false; this.rays.frustumCulled = false; s.add(this.rays);
    this.camLabel = textSprite('camera', { size: 0.5, color: '#ffb547' }); this.camLabel.visible = false; s.add(this.camLabel);

    // hover marker
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.17, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    this.marker.visible = false; s.add(this.marker);

    this.rot = { y: 0, x: 0, s: 1, tx: 0, spin: true };
    this.persp = 0;
    this.outside = false;
    this.tip = document.createElement('div');
    this.tip.className = 'win'; this.tip.style.cssText = 'position:absolute;width:auto;pointer-events:none;z-index:3;display:none';
    this.tip.innerHTML = '<div class="tb"><span class="t">Vertex</span></div><div class="bd readout" style="font-size:11px;padding:8px 10px"></div>';
    document.getElementById('ui').appendChild(this.tip);
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  rebuild() {
    this.model.clear();
    const w = spriteVoxelWire(this.app.state.sprite);
    this.wire = w;
    this.points = new THREE.Points(w.pg, this.pmat);
    this.lines = new THREE.LineSegments(w.lg, this.lmat);
    this.model.add(this.lines, this.points);
    this.vcount = w.count;
  },

  setAspect(a) {
    this.cam.aspect = a; this.cam.updateProjectionMatrix();
    this.god.aspect = a; this.god.updateProjectionMatrix();
    this.aspect = a;
    this.rt.setSize(640, Math.round(640 / a));
  },

  enter(app) {
    this.rebuild();
    this.buildControls();
    app.ui.showChrome(true);
  },
  exit() { this.tip.style.display = 'none'; },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Transform');
    this.obj = [ui.objective('Change the model matrix'), ui.objective('Hover a vertex to follow it'), ui.objective('Step outside the camera')];
    ui.slider('Rotate Y', { min: -Math.PI, max: Math.PI, step: 0.01, value: 0, fmt: (v) => Math.round(v * 57.3) + '°' }, (v) => { this.rot.y = v; this.rot.spin = false; this.obj[0].done(); this.app.ready(true); });
    ui.slider('Rotate X', { min: -Math.PI / 2, max: Math.PI / 2, step: 0.01, value: 0, fmt: (v) => Math.round(v * 57.3) + '°' }, (v) => { this.rot.x = v; this.obj[0].done(); this.app.ready(true); });
    ui.slider('Scale', { min: 0.3, max: 2, step: 0.01, value: 1, fmt: (v) => v.toFixed(2) + '×' }, (v) => { this.rot.s = v; this.obj[0].done(); });
    ui.slider('Perspective → Orthographic', { min: 0, max: 1, step: 0.005, value: 0, fmt: (v) => { const f = 50 + (1 - 50) * v; return f.toFixed(0) + '° lens'; } }, (v) => { this.persp = v; if (v > 0.98) this.app.secret('vertigo', 'Vertigo', 'Narrowing the lens while backing away flattens perspective: a dolly zoom.'); });
    const r = ui.row();
    this.outT = ui.toggle('Outside view', this.outside, (v) => { this.outside = v; if (v) { this.obj[2].done(); this.app.ready(true); } }, r);
    ui.toggle('Spin', this.rot.spin, (v) => (this.rot.spin = v), r);
    this.mread = ui.readout();
    ui.hint('Drag to orbit. Scroll to zoom.');
  },

  pointer(type, p, e) {
    const o = this.outside ? this.godOrbit : this.orbit;
    o.handle(type, p, e);
    this.mouse = p;
  },

  update(dt, t, app) {
    const r = this.rot;
    if (r.spin) r.y += dt * 0.35;
    this.model.rotation.set(r.x, r.y, 0);
    this.model.scale.setScalar(r.s);
    this.globe.rotation.y += dt * 0.01;
    // dolly zoom: narrow the lens and back away so the subject keeps its size
    const fov = 50 + (1 - 50) * this.persp;
    const k = Math.tan(THREE.MathUtils.degToRad(25)) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    this.orbit.update(dt);
    const dir = this.cam.position.clone().sub(this.orbit.target);
    this.cam.position.copy(this.orbit.target).add(dir.multiplyScalar(k));
    this.cam.fov = fov; this.cam.far = 400 * k; this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
    this.godOrbit.update(dt);
    this.helper.update();
    this.model.updateMatrixWorld();

    // image plane sits 2 units in front of the camera
    const d = 2.0, h = 2 * d * Math.tan(THREE.MathUtils.degToRad(fov / 2)), w = h * this.cam.aspect;
    this.imgPlane.position.copy(this.cam.position).add(new THREE.Vector3(0, 0, -d).applyQuaternion(this.cam.quaternion));
    this.imgPlane.quaternion.copy(this.cam.quaternion); this.imgPlane.scale.set(w, h, 1);
    this.eye.position.copy(this.cam.position);
    this.camLabel.position.copy(this.cam.position).add(new THREE.Vector3(0, 0.6, 0)); this.camLabel.quaternion.copy(this.god.quaternion);
    // projection rays from some vertices to the eye
    const pos = this.wire.pg.attributes.position.array, ra = this.rayGeo.attributes.position.array;
    const v = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      const vi = Math.floor((i * 97) % this.vcount);
      v.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]).applyMatrix4(this.model.matrixWorld);
      ra.set([v.x, v.y, v.z, this.cam.position.x, this.cam.position.y, this.cam.position.z], i * 6);
    }
    this.rayGeo.attributes.position.needsUpdate = true;
    [this.helper, this.imgPlane, this.eye, this.rays, this.camLabel].forEach((o) => (o.visible = this.outside));

    // matrix readout
    const m = this.model.matrixWorld.elements;
    const row = (i) => [m[i], m[i + 4], m[i + 8], m[i + 12]].map(fmt).join(' ');
    const pm = this.cam.projectionMatrix.elements;
    this.mread && (this.mread.textContent = `MODEL MATRIX\n${row(0)}\n${row(1)}\n${row(2)}\n${row(3)}\n\nPROJECTION (perspective row)\n w = ${fmt(pm[11])} × z_view\n\n${this.vcount} vertices · ${this.wire.edges} edges`);

    this.hover();
  },

  hover() {
    const p = this.mouse; if (!p || this.outside) { this.tip.style.display = 'none'; this.marker.visible = false; return; }
    const pos = this.wire.pg.attributes.position.array;
    const v = new THREE.Vector3(), best = { d: 196, i: -1 };
    for (let i = 0; i < this.vcount; i++) {
      v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(this.model.matrixWorld).project(this.cam);
      const sx = (v.x + 1) / 2 * p.w, sy = (1 - v.y) / 2 * p.h;
      const d = (sx - p.x) ** 2 + (sy - p.y) ** 2;
      if (d < best.d && v.z < 1) { best.d = d; best.i = i; }
    }
    if (best.i < 0) { this.tip.style.display = 'none'; this.marker.visible = false; return; }
    if (!this._hovered) { this._hovered = true; this.obj[1].done(); }
    const i = best.i;
    const L = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const Wd = L.clone().applyMatrix4(this.model.matrixWorld);
    const V = Wd.clone().applyMatrix4(this.cam.matrixWorldInverse);
    const C = new THREE.Vector4(V.x, V.y, V.z, 1).applyMatrix4(this.cam.projectionMatrix);
    const N = new THREE.Vector3(C.x / C.w, C.y / C.w, C.z / C.w);
    const px = (N.x + 1) / 2 * p.w, py = (1 - N.y) / 2 * p.h;
    const f3 = (a) => `(${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)})`;
    this.tip.querySelector('.t').textContent = `Vertex #${i}`;
    this.tip.querySelector('.bd').textContent = `model   ${f3(L)}\n  × Model matrix\nworld   ${f3(Wd)}\n  × View matrix\nview    ${f3(V)}\n  × Projection\nclip    ${f3(C)}  w=${C.w.toFixed(2)}\n  ÷ w   (perspective divide)\nNDC     (${N.x.toFixed(3)}, ${N.y.toFixed(3)})\n  → viewport\npixel   (${px.toFixed(0)}, ${py.toFixed(0)})`;
    this.tip.style.display = 'block';
    const tx = Math.min(p.x + 18, window.innerWidth - 300), ty = Math.min(p.y + 18, window.innerHeight - 240);
    this.tip.style.left = tx + 'px'; this.tip.style.top = ty + 'px';
    this.marker.visible = true; this.marker.position.copy(Wd); this.marker.quaternion.copy(this.cam.quaternion);
  },

  render(renderer, target) {
    if (this.outside) {
      // picture-in-the-world: render what the camera sees onto its image plane
      [this.helper, this.imgPlane, this.eye, this.rays, this.camLabel].forEach((o) => (o.visible = false));
      renderer.setRenderTarget(this.rt); renderer.render(this.scene, this.cam);
      [this.helper, this.imgPlane, this.eye, this.rays, this.camLabel].forEach((o) => (o.visible = true));
      renderer.setRenderTarget(target); renderer.render(this.scene, this.god);
    } else {
      renderer.setRenderTarget(target); renderer.render(this.scene, this.cam);
    }
  },
};
