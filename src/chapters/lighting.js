import * as THREE from 'three';
import { Orbit, makeGrid, makeStars, voxelGeometry } from '../gfx/lab.js';

// ROOM 08 — Light & normals. Flat, Gouraud, Phong and Blinn-Phong shading on
// the same objects, a light you can grab, and a probe that shows N, L and
// their dot product at any point you hover.

const VERT = /* glsl */`
uniform int uMode; uniform vec3 uLightPos, uLightColor, uColor; uniform float uShine, uAmbient;
varying vec3 vWP, vWN, vGouraud;
vec3 shadeAt(vec3 P, vec3 N, int mode){
  vec3 L = normalize(uLightPos - P), V = normalize(cameraPosition - P);
  float diff = max(dot(N, L), 0.0);
  float spec = 0.0;
  if (mode == 3) spec = pow(max(dot(N, normalize(L + V)), 0.0), uShine * 2.0);
  else spec = pow(max(dot(reflect(-L, N), V), 0.0), uShine);
  return uColor * (uAmbient + diff * uLightColor) + uLightColor * spec * 0.6 * step(0.0001, diff);
}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWP = w.xyz; vWN = normalize(mat3(modelMatrix) * normal);
  vGouraud = shadeAt(vWP, vWN, 2);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
uniform int uMode, uViz; uniform vec3 uLightPos, uLightColor, uColor; uniform float uShine, uAmbient;
varying vec3 vWP, vWN, vGouraud;
vec3 heat(float t){ return clamp(vec3(1.5*t, 1.5*t*t, 0.2 + 0.8*(1.0-t)) * vec3(1.0, 1.0, step(t, 0.001) + 0.15), 0.0, 1.0); }
void main(){
  vec3 N = normalize(vWN);
  if (uMode == 0) N = normalize(cross(dFdx(vWP), dFdy(vWP)));
  vec3 L = normalize(uLightPos - vWP), V = normalize(cameraPosition - vWP);
  float ndl = dot(N, L);
  vec3 col;
  if (uViz == 1) { col = ndl > 0.0 ? mix(vec3(0.05,0.0,0.2), vec3(1.0,0.85,0.4), ndl) : vec3(0.0, 0.05, 0.25) * (1.0 + ndl); }
  else if (uViz == 2) { col = N * 0.5 + 0.5; }
  else if (uMode == 1) col = vGouraud;
  else {
    float diff = max(ndl, 0.0), spec = 0.0;
    if (uMode == 3) spec = pow(max(dot(N, normalize(L + V)), 0.0), uShine * 2.0);
    else if (uMode == 2) spec = pow(max(dot(reflect(-L, N), V), 0.0), uShine);
    col = uColor * (uAmbient + diff * uLightColor) + uLightColor * spec * 0.6 * step(0.0001, diff);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export default {
  id: 'light', title: 'Light & Normals', year: '1971–1977', tagline: 'How bright is a surface? It depends on the angle between where it faces and where the light is.',
  mode: 'world', ui: 'gel01', music: 'fm',
  secrets: [
    { id: 'terminator', title: 'The terminator', hint: 'Hover the exact line where light gives way to shadow.', desc: 'Where N·L crosses zero, the surface turns edge-on to the light.' },
  ],
  notes: [
    {
      title: 'Normals', meta: 'Which way a surface faces',
      body: `<p>A <b>normal</b> is an arrow of length 1 pointing straight out of a surface. Each vertex stores one, alongside its position. Turn on <b>Show normals</b> to see them bristling out of the test sphere.</p><p>If normals are averaged between neighbouring triangles, a faceted mesh can be lit as if it were smooth.</p>`,
    },
    {
      title: "Lambert's cosine law", meta: '1760',
      body: `<p>A surface facing the light head-on catches the most light. Tilt it away and the same light spreads over more area, so it looks dimmer. The brightness follows the cosine of the angle between the normal <b>N</b> and the direction to the light <b>L</b>:</p>
      <div class="eq">brightness = max(0, N · L)
N · L = Nx·Lx + Ny·Ly + Nz·Lz = cos θ</div><p>That is a <i>dot product</i>: three multiplications and two additions. Hover any object to see the arrows and the numbers.</p>`,
    },
    {
      title: 'Per vertex or per pixel', meta: '1971 & 1973',
      body: `<p><b>Flat</b>: one brightness per triangle. Cheap, faceted.</p><p><b>Gouraud</b> (1971): compute lighting only at the corners and blend the colours across the triangle. Smooth, but a small highlight can fall between vertices and vanish. Lower the sphere's detail and watch the highlight smear.</p><p><b>Phong</b> (1973–75): blend the <i>normals</i> instead, and light every pixel. Crisp highlights at the cost of much more arithmetic per pixel.</p>`,
    },
    {
      title: 'The shiny part', meta: 'Specular light',
      body: `<p>The bright spot is a reflection of the light source itself. Phong's model measures how closely the reflected light ray lines up with your eye. In 1977 Blinn suggested a cheaper, often nicer variant using the vector halfway between the light and the eye.</p><div class="eq">Phong:  spec = (R · V)^shininess
Blinn:  spec = (N · H)^shininess,   H = normalize(L + V)</div>`,
    },
    {
      title: 'The hidden cost', meta: 'Normalizing',
      body: `<p>Every one of these formulas needs vectors of length exactly 1. Making a vector that long means dividing by its length, which needs a square root, followed by a division. In the 1990s those were among the slowest things a processor could do, and a game might do it millions of times per second. The next room is about one very strange shortcut.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x06060c);
    this.cam = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.orbit = new Orbit(this.cam, { dist: 10.5, theta: 0.2, phi: 1.2, target: new THREE.Vector3(0, 1.1, 0) });
    const g = makeGrid(0x6a5cff, 0.08, 0.6); g.position.y = -0.6; s.add(g);
    s.add(makeStars(800, 80, 0x7a6cff));
    this.u = {
      uMode: { value: 2 }, uViz: { value: 0 }, uLightPos: { value: new THREE.Vector3(3, 4, 3) }, uLightColor: { value: new THREE.Color(1, 0.95, 0.88) },
      uColor: { value: new THREE.Color(0.8, 0.8, 0.8) }, uShine: { value: 32 }, uAmbient: { value: 0.06 },
    };
    const mk = (color) => {
      const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(this.u), vertexShader: VERT, fragmentShader: FRAG, extensions: { derivatives: true } });
      m.uniforms.uColor.value.set(color);
      return m;
    };
    this.mats = [];
    const add = (geo, color, pos) => { const mat = mk(color); this.mats.push(mat); const m = new THREE.Mesh(geo, mat); m.position.set(...pos); s.add(m); return m; };
    this.sphereDetail = 10;
    this.sphere = add(new THREE.SphereGeometry(1.3, this.sphereDetail, Math.max(4, this.sphereDetail * 0.7 | 0)), 0xd8d2c8, [0, 1.1, 0]);
    this.knot = add(new THREE.TorusKnotGeometry(0.75, 0.26, 160, 24), 0xff6a3d, [3.4, 1.2, -0.6]);
    this.ico = add(new THREE.IcosahedronGeometry(1.0, 0), 0x3d9bff, [-3.3, 1.0, -0.4]);
    this.spriteMesh = null;
    // the light: a glowing orb you can grab
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff1d0 }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.haloTex(), color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(2.2); this.orb.add(halo);
    s.add(this.orb);
    this.orbAngle = 0.8; this.autoLight = true;
    // probe arrows
    this.arrN = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.2, 0x55aaff, 0.22, 0.12);
    this.arrL = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.2, 0xffd060, 0.22, 0.12);
    this.arrN.visible = this.arrL.visible = false; s.add(this.arrN, this.arrL);
    this.normalLines = null;
    this.ray = new THREE.Raycaster();
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  haloTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.3, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  },

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); },

  rebuildSphere(d) {
    this.sphereDetail = d;
    this.sphere.geometry.dispose();
    this.sphere.geometry = new THREE.SphereGeometry(1.3, d, Math.max(3, Math.round(d * 0.7)));
    if (this.normalLines) this.makeNormals();
  },

  makeNormals() {
    if (this.normalLines) { this.scene.remove(this.normalLines); this.normalLines.geometry.dispose(); }
    const g = this.sphere.geometry, p = g.attributes.position, n = g.attributes.normal;
    const arr = new Float32Array(p.count * 6);
    for (let i = 0; i < p.count; i++) arr.set([p.getX(i), p.getY(i), p.getZ(i), p.getX(i) + n.getX(i) * 0.45, p.getY(i) + n.getY(i) * 0.45, p.getZ(i) + n.getZ(i) * 0.45], i * 6);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.normalLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x55aaff, transparent: true, opacity: 0.8 }));
    this.normalLines.position.copy(this.sphere.position);
    this.scene.add(this.normalLines);
  },

  enter(app) {
    if (this.spriteMesh) this.scene.remove(this.spriteMesh);
    const mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(this.u), vertexShader: VERT, fragmentShader: FRAG, extensions: { derivatives: true } });
    mat.uniforms.uColor.value.set(0x58e0ff); this.mats.push(mat);
    this.spriteMesh = new THREE.Mesh(voxelGeometry(app.state.sprite, 0.11, 2), mat);
    this.spriteMesh.geometry.computeVertexNormals();
    this.spriteMesh.position.set(0, 3.4, -1.6); this.scene.add(this.spriteMesh);
    this.buildControls();
    this.buildDot();
    app.ui.showChrome(true);
  },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Shading');
    this.obj = [ui.objective('Grab the light and move it'), ui.objective('Compare Gouraud and Phong')];
    ui.segmented('Model', [{ v: 0, l: 'Flat' }, { v: 1, l: 'Gouraud' }, { v: 2, l: 'Phong' }, { v: 3, l: 'Blinn' }], this.u.uMode.value, (v) => {
      this.setU('uMode', v); this.triedModes = (this.triedModes || new Set()).add(v);
      if (this.triedModes.has(1) && this.triedModes.has(2)) { this.obj[1].done(); this.app.ready(true); }
    });
    ui.segmented('Show', [{ v: 0, l: 'Lit' }, { v: 1, l: 'N · L' }, { v: 2, l: 'Normals as colour' }], 0, (v) => this.setU('uViz', v));
    ui.slider('Sphere detail', { min: 3, max: 64, step: 1, value: this.sphereDetail, fmt: (v) => v + ' segments' }, (v) => this.rebuildSphere(v));
    ui.slider('Shininess', { min: 2, max: 200, step: 1, value: 32, fmt: (v) => v.toFixed(0) }, (v) => this.setU('uShine', v));
    const r = ui.row();
    ui.toggle('Show normals', false, (v) => { if (v) this.makeNormals(); else if (this.normalLines) { this.scene.remove(this.normalLines); this.normalLines = null; } }, r);
    ui.toggle('Light orbits', this.autoLight, (v) => (this.autoLight = v), r);
    this.read = ui.readout();
  },

  buildDot() {
    const bd = this.app.ui.extraWindow('N · L', { left: 14, bottom: 70 }, 250);
    this.dotCv = document.createElement('canvas'); this.dotCv.width = 460; this.dotCv.height = 300;
    this.dotCv.style.cssText = 'width:100%;height:auto;display:block;border-radius:6px;background:#0a0a14';
    bd.appendChild(this.dotCv);
    this.dotRead = document.createElement('div'); this.dotRead.className = 'readout'; bd.appendChild(this.dotRead);
  },

  setU(k, v) { this.mats.forEach((m) => (m.uniforms[k].value = v)); this.u[k].value = v; },

  pointer(type, p, e, app) {
    const nd = new THREE.Vector2(p.nx, p.ny);
    this.ray.setFromCamera(nd, this.cam);
    if (type === 'down') {
      if (this.ray.intersectObject(this.orb, true).length) {
        this.dragOrb = true; this.autoLight = false;
        this.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.cam.getWorldDirection(new THREE.Vector3()).negate(), this.orb.position);
        return;
      }
    }
    if (this.dragOrb) {
      if (type === 'move' && e.buttons) {
        const hit = new THREE.Vector3();
        if (this.ray.ray.intersectPlane(this.dragPlane, hit)) { this.orb.position.copy(hit); this.obj[0].done(); this.app.ready(true); }
      }
      if (type === 'up') this.dragOrb = false;
      return;
    }
    this.orbit.handle(type, p, e);
    this.mouseNd = nd;
  },

  update(dt, t, app) {
    this.orbit.update(dt);
    if (this.autoLight) { this.orbAngle += dt * 0.5; this.orb.position.set(Math.cos(this.orbAngle) * 4.2, 3.2 + Math.sin(t * 0.7) * 0.8, Math.sin(this.orbAngle) * 4.2); }
    this.setU('uLightPos', this.orb.position);
    this.mats.forEach((m) => m.uniforms.uLightPos.value.copy(this.orb.position));
    this.knot.rotation.y += dt * 0.3; this.ico.rotation.y -= dt * 0.25; this.ico.rotation.x += dt * 0.1;
    if (this.spriteMesh) this.spriteMesh.rotation.y = Math.sin(t * 0.5) * 0.7;
    if (this.normalLines) this.normalLines.rotation.copy(this.sphere.rotation);

    // probe
    let info = 'Hover an object to probe it.';
    this.arrN.visible = this.arrL.visible = false;
    let ndl = null, angle = 0;
    if (this.mouseNd && !this.dragOrb) {
      this.ray.setFromCamera(this.mouseNd, this.cam);
      const hit = this.ray.intersectObjects([this.sphere, this.knot, this.ico, this.spriteMesh].filter(Boolean))[0];
      if (hit) {
        let n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (this.u.uMode.value !== 0 && hit.uv !== undefined && hit.object.geometry.attributes.normal) {
          // smooth normal from barycentric interpolation
          const g = hit.object.geometry, nA = g.attributes.normal, f = hit.face;
          const tri = new THREE.Triangle(), b = new THREE.Vector3();
          const pA = new THREE.Vector3().fromBufferAttribute(g.attributes.position, f.a).applyMatrix4(hit.object.matrixWorld);
          const pB = new THREE.Vector3().fromBufferAttribute(g.attributes.position, f.b).applyMatrix4(hit.object.matrixWorld);
          const pC = new THREE.Vector3().fromBufferAttribute(g.attributes.position, f.c).applyMatrix4(hit.object.matrixWorld);
          tri.set(pA, pB, pC).getBarycoord(hit.point, b);
          n = new THREE.Vector3().fromBufferAttribute(nA, f.a).multiplyScalar(b.x)
            .add(new THREE.Vector3().fromBufferAttribute(nA, f.b).multiplyScalar(b.y))
            .add(new THREE.Vector3().fromBufferAttribute(nA, f.c).multiplyScalar(b.z)).transformDirection(hit.object.matrixWorld).normalize();
        }
        const L = this.orb.position.clone().sub(hit.point).normalize();
        ndl = n.dot(L); angle = Math.acos(Math.max(-1, Math.min(1, ndl)));
        this.arrN.position.copy(hit.point); this.arrN.setDirection(n);
        this.arrL.position.copy(hit.point); this.arrL.setDirection(L);
        this.arrN.visible = this.arrL.visible = true;
        info = `N = (${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)})\nL = (${L.x.toFixed(2)}, ${L.y.toFixed(2)}, ${L.z.toFixed(2)})\nN·L = ${ndl.toFixed(3)}   angle ${Math.round(angle * 57.3)}°\nbrightness = max(0, N·L) = ${Math.max(0, ndl).toFixed(3)}`;
        if (Math.abs(ndl) < 0.012) app.secret('terminator', 'The terminator', 'Where N·L crosses zero, the surface is edge-on to the light. Past it, darkness.');
      }
    }
    this.dotRead && (this.dotRead.textContent = info);
    this.drawDot(ndl, angle);
    const verts = this.sphere.geometry.attributes.position.count;
    const px = Math.round(window.innerWidth * window.innerHeight * 0.18);
    this.read && (this.read.textContent = `sphere: ${verts} vertices\nGouraud lights ${verts} points\nPhong lights ≈ ${px.toLocaleString()} pixels`);
  },

  drawDot(ndl, angle) {
    const c = this.dotCv; if (!c) return; const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = '#0a0a14'; x.fillRect(0, 0, c.width, c.height);
    const ox = 150, oy = 240, R = 150;
    x.strokeStyle = 'rgba(255,255,255,0.15)'; x.beginPath(); x.moveTo(20, oy); x.lineTo(c.width - 20, oy); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(20, oy, c.width - 40, 40);
    const arrow = (a, col, label) => {
      const ex = ox + Math.sin(a) * R, ey = oy - Math.cos(a) * R;
      x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 4; x.beginPath(); x.moveTo(ox, oy); x.lineTo(ex, ey); x.stroke();
      x.beginPath(); x.arc(ex, ey, 7, 0, 7); x.fill(); x.font = '600 22px Geist, sans-serif'; x.fillText(label, ex + 10, ey);
    };
    if (ndl === null) { x.fillStyle = 'rgba(255,255,255,0.4)'; x.font = '20px Geist, sans-serif'; x.fillText('hover an object', 120, 120); return; }
    x.strokeStyle = 'rgba(255,208,96,0.5)'; x.lineWidth = 2; x.beginPath(); x.arc(ox, oy, 50, -Math.PI / 2, -Math.PI / 2 + angle); x.stroke();
    arrow(0, '#55aaff', 'N'); arrow(angle, '#ffd060', 'L');
    // projection of L onto N: the cosine
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(ox + Math.sin(angle) * R, oy - Math.cos(angle) * R); x.lineTo(ox, oy - Math.cos(angle) * R); x.stroke(); x.setLineDash([]);
    const bx = 360, bh = 200 * Math.max(0, ndl);
    x.fillStyle = '#ffd060'; x.fillRect(bx, oy - bh, 50, bh);
    x.strokeStyle = 'rgba(255,255,255,0.3)'; x.strokeRect(bx, oy - 200, 50, 200);
    x.fillStyle = '#fff'; x.font = '600 22px "JetBrains Mono", monospace'; x.fillText(Math.max(0, ndl).toFixed(2), bx - 4, oy - 210);
  },

  render(renderer, target) { renderer.setRenderTarget(target); renderer.render(this.scene, this.cam); },
};
