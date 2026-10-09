import * as THREE from 'three';
import { Orbit, makeStars } from '../gfx/lab.js';

// ROOM 10 — Texture. Images wrapped onto triangles: perspective-correct vs
// affine mapping (the mid-90s console wobble), nearest vs bilinear filtering,
// and mipmaps, made visible with one colour per level.

const VERT = /* glsl */`
uniform float uSnap; uniform vec2 uSnapRes;
varying vec2 vUv; varying vec2 vUvW; varying float vW; varying vec3 vN;
void main(){
  vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  if (uSnap > 0.5) { vec2 ndc = clip.xy / clip.w; ndc = floor(ndc * uSnapRes + 0.5) / uSnapRes; clip.xy = ndc * clip.w; }
  vUvW = uv * clip.w; vW = clip.w;
  gl_Position = clip;
}`;
const FRAG = /* glsl */`
uniform sampler2D uTex, uMip; uniform float uAffine, uMipViz, uUvViz, uRepeat, uLit;
varying vec2 vUv; varying vec2 vUvW; varying float vW; varying vec3 vN;
void main(){
  vec2 uv = mix(vUv, vUvW / vW, uAffine) * uRepeat;
  vec3 c = texture2D(uTex, uv).rgb;
  if (uMipViz > 0.5) c = mix(c, texture2D(uMip, uv).rgb, 0.65);
  if (uUvViz > 0.5) c = vec3(fract(uv), 0.0);
  float l = mix(1.0, 0.45 + 0.55 * max(dot(normalize(vN), normalize(vec3(0.4, 0.9, 0.5))), 0.0), uLit);
  gl_FragColor = vec4(c * l, 1.0);
  #include <colorspace_fragment>
}`;

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#0d0f1c'; x.fillRect(0, 0, 512, 512);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if ((i + j) & 1) { x.fillStyle = '#d8dcf0'; x.fillRect(i * 32, j * 32, 32, 32); }
  x.strokeStyle = '#ff4fa8'; x.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  return c;
}
function gridTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 512); g.addColorStop(0, '#1b3cff'); g.addColorStop(1, '#ff3c8a');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 3;
  for (let i = 0; i <= 512; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  x.fillStyle = '#fff'; x.font = 'bold 40px "JetBrains Mono", monospace';
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if ((i + j) % 3 === 0) x.fillText('UV'[(i + j) % 2], i * 64 + 18, j * 64 + 46);
  return c;
}
function mipTexture() {
  const cols = [[255, 60, 60], [255, 160, 40], [255, 240, 60], [80, 230, 90], [60, 200, 255], [90, 90, 255], [200, 80, 255], [255, 80, 200], [255, 255, 255], [180, 180, 180]];
  const mips = [];
  let s = 512, l = 0;
  while (s >= 1) {
    const d = new Uint8Array(s * s * 4); const c = cols[Math.min(l, cols.length - 1)];
    for (let i = 0; i < s * s; i++) d.set([c[0], c[1], c[2], 255], i * 4);
    mips.push({ data: d, width: s, height: s }); s >>= 1; l++;
  }
  const t = new THREE.DataTexture(mips[0].data, 512, 512);
  t.mipmaps = mips; t.generateMipmaps = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

export default {
  id: 'texture', title: 'Wallpaper for Triangles', year: '1974–1995', tagline: 'Glue a picture onto every triangle and a dozen polygons can look like a thousand.',
  mode: 'world', ui: 'gel01', music: 'fm',
  secrets: [
    { id: 'wobble', title: '1995 console mode', hint: 'Combine affine mapping with vertex snapping.', desc: 'Skipped divisions and whole-pixel vertices: the signature wobble of mid-90s consoles.' },
    { id: 'mipview', title: 'Seeing the pyramid', hint: 'Make the mipmap levels visible.', desc: 'Each colour is a pre-shrunk copy of the texture.' },
  ],
  notes: [
    {
      title: 'Coordinates on a picture', meta: '1974',
      body: `<p>Each vertex gets a second pair of numbers, <b>(u, v)</b>: a position on an image, from 0 to 1 across and down. The rasterizer blends those coordinates across the triangle (with the barycentric weights from the triangle room), and every pixel looks up its colour in the image. The image is the <b>texture</b>; each of its pixels is a <b>texel</b>.</p><p>Hover over an object to see which texel each point uses.</p>`,
    },
    {
      title: 'The wobble', meta: 'Perspective-correct mapping',
      body: `<p>Blending u and v straight across the screen is wrong in perspective: a texture on a tilted surface should get squeezed in the distance. The fix is to blend u/w, v/w and 1/w and divide per pixel.</p><p>Some mid-90s consoles skipped that division to save time (<b>affine</b> mapping) and also rounded vertices to whole pixels, so textures warped and shimmered as the camera moved. Turn both on and orbit the big panel.</p>`,
    },
    {
      title: 'Nearest or bilinear', meta: 'Magnification',
      body: `<p>When a texture is stretched, one texel covers many pixels. <b>Nearest</b> picks the closest texel and keeps hard pixel edges. <b>Bilinear</b> blends the four closest, which smooths but blurs. Your 16 × 16 sprite on the cube shows the difference starkly.</p>`,
    },
    {
      title: 'Mipmaps', meta: '1983',
      body: `<p>Far away, the opposite happens: one pixel covers many texels, and picking just one causes sparkling and moiré patterns on the floor. A 1983 paper proposed storing the texture again at ½, ¼, ⅛… size (a pyramid, costing only one third more memory) and sampling the level whose texels match the pixel size.</p><p>Turn on <b>Show mip levels</b>: each colour is a different level. Red is full size, then orange, yellow, green…</p>`,
    },
  ],

  init(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x070812); s.fog = null;
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.orbit = new Orbit(this.cam, { dist: 9, theta: 0.5, phi: 1.28, target: new THREE.Vector3(0, 1.1, 0), maxPhi: 1.52 });
    s.add(makeStars(800, 120));
    this.texFloor = new THREE.CanvasTexture(floorTexture());
    this.texGrid = new THREE.CanvasTexture(gridTexture());
    this.spriteCanvas = document.createElement('canvas'); this.spriteCanvas.width = this.spriteCanvas.height = 16;
    this.texSprite = new THREE.CanvasTexture(this.spriteCanvas);
    [this.texFloor, this.texGrid, this.texSprite].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; });
    this.mip = mipTexture();
    this.uniformsBase = { uSnap: 0, uAffine: 0, uMipViz: 0, uUvViz: 0 };
    this.mats = [];
    const mk = (tex, repeat = 1, lit = 1) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTex: { value: tex }, uMip: { value: this.mip }, uSnap: { value: 0 }, uSnapRes: { value: new THREE.Vector2(160, 120) }, uAffine: { value: 0 }, uMipViz: { value: 0 }, uUvViz: { value: 0 }, uRepeat: { value: repeat }, uLit: { value: lit } },
        vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      });
      this.mats.push(m); return m;
    };
    // a huge floor running to the horizon: aliasing heaven
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300, 1, 1), mk(this.texFloor, 60, 0));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -0.6; s.add(this.floor);
    this.mip.repeat = 60;
    // big low-poly panel: two triangles, the classic affine stress test
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.6, 1, 1), mk(this.texGrid, 1, 0));
    this.panel.position.set(-2.4, 1.4, -2.4); this.panel.rotation.y = 0.9; s.add(this.panel);
    this.cube = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), mk(this.texSprite, 1, 1)); this.cube.position.set(2.2, 0.6, 0.6); s.add(this.cube);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), mk(this.texGrid, 1, 1)); this.ball.position.set(0.1, 0.4, 2.2); s.add(this.ball);
    this.filter = 'nearest-mip';
    this.applyFilter('trilinear');
    this.ray = new THREE.Raycaster();
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); },

  applyFilter(f) {
    this.filter = f;
    const set = (t, isSprite) => {
      if (f === 'nearest') { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.anisotropy = 1; }
      else if (f === 'bilinear') { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = 1; }
      else { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = f === 'aniso' ? 16 : 1; }
      t.needsUpdate = true;
    };
    [this.texFloor, this.texGrid, this.texSprite].forEach((t) => set(t));
    this.mip.anisotropy = f === 'aniso' ? 16 : 1; this.mip.needsUpdate = true;
  },

  setU(k, v) { this.mats.forEach((m) => (m.uniforms[k].value = v)); },

  enter(app) {
    const x = this.spriteCanvas.getContext('2d'); x.clearRect(0, 0, 16, 16);
    x.fillStyle = '#10142a'; x.fillRect(0, 0, 16, 16);
    const sp = app.state.sprite, pal = app.state.palette;
    for (let i = 0; i < 256; i++) if (sp[i]) { x.fillStyle = pal[sp[i]]; x.fillRect(i & 15, i >> 4, 1, 1); }
    this.texSprite.needsUpdate = true;
    this.buildControls();
    this.buildUV();
    app.ui.showChrome(true);
  },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Texturing');
    this.obj = [ui.objective('Switch to affine mapping'), ui.objective('Compare the filters on the floor')];
    this.affine = false; this.snap = false;
    const r = ui.row();
    ui.toggle('Affine (no ÷w)', false, (v) => { this.affine = v; this.setU('uAffine', v ? 1 : 0); this.obj[0].done(); this.app.ready(true); this.checkWobble(); }, r);
    ui.toggle('Snap vertices', false, (v) => { this.snap = v; this.setU('uSnap', v ? 1 : 0); this.checkWobble(); }, r);
    ui.segmented('Filtering', [{ v: 'nearest', l: 'Nearest' }, { v: 'bilinear', l: 'Bilinear' }, { v: 'trilinear', l: 'Mipmaps' }, { v: 'aniso', l: 'Anisotropic' }], 'trilinear', (v) => {
      this.applyFilter(v); (this.tried = this.tried || new Set()).add(v); if (this.tried.size >= 2) this.obj[1].done();
    });
    const r2 = ui.row();
    ui.toggle('Show mip levels', false, (v) => { this.setU('uMipViz', v ? 1 : 0); if (v) this.app.secret('mipview', 'Seeing the pyramid', 'Each colour is a smaller copy of the texture: red is full size, then orange, yellow, green…'); }, r2);
    ui.toggle('Show UVs', false, (v) => this.setU('uUvViz', v ? 1 : 0), r2);
    ui.hint('Orbit low over the floor to see the far distance shimmer. Drag to orbit.');
  },

  checkWobble() { if (this.affine && this.snap) this.app.secret('wobble', '1995 console mode', 'Skipped divisions and whole-pixel vertices: the signature wobble of mid-90s consoles.'); },

  buildUV() {
    const bd = this.app.ui.extraWindow('Texture lookup', { left: 14, bottom: 70 }, 236);
    this.uvCv = document.createElement('canvas'); this.uvCv.width = this.uvCv.height = 256;
    this.uvCv.style.cssText = 'width:100%;height:auto;display:block;image-rendering:pixelated;background:#000';
    bd.appendChild(this.uvCv);
    this.uvRead = document.createElement('div'); this.uvRead.className = 'readout'; bd.appendChild(this.uvRead);
  },

  pointer(type, p, e) { this.orbit.handle(type, p, e); this.mouseNd = new THREE.Vector2(p.nx, p.ny); },

  update(dt, t) {
    this.orbit.update(dt);
    this.cube.rotation.y += dt * 0.4; this.cube.rotation.x = Math.sin(t * 0.3) * 0.3;
    this.ball.rotation.y -= dt * 0.3;
    // lookup visualizer
    const cv = this.uvCv; if (!cv) return;
    let hit = null;
    if (this.mouseNd) { this.ray.setFromCamera(this.mouseNd, this.cam); hit = this.ray.intersectObjects([this.cube, this.ball, this.panel, this.floor])[0]; }
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    const obj = hit ? hit.object : this.cube;
    const tex = obj.material.uniforms.uTex.value;
    x.drawImage(tex.image, 0, 0, 256, 256);
    if (hit && hit.uv) {
      let u = hit.uv.x * obj.material.uniforms.uRepeat.value, v = hit.uv.y * obj.material.uniforms.uRepeat.value;
      u -= Math.floor(u); v -= Math.floor(v);
      const px = u * 256, py = (1 - v) * 256;
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(px, py, 9, 0, 7); x.stroke();
      x.strokeStyle = '#000'; x.lineWidth = 1; x.beginPath(); x.arc(px, py, 11, 0, 7); x.stroke();
      const tw = tex.image.width;
      this.uvRead.textContent = `u ${u.toFixed(3)}   v ${v.toFixed(3)}\ntexel (${Math.floor(u * tw)}, ${Math.floor((1 - v) * tw)}) of ${tw}×${tw}\ndistance ${hit.distance.toFixed(1)}`;
    } else this.uvRead.textContent = 'Hover an object to see\nwhere its colour comes from.';
  },

  render(renderer, target) { renderer.setRenderTarget(target); renderer.render(this.scene, this.cam); },
};
