import * as THREE from 'three';
import { galleryScene, MAT, PathTracer, TONEMAP_GLSL } from '../gfx/PathTracer.js';
import { shaderPass, makeCanvas, glowTexture } from '../gfx/three-utils.js';
import { STAGES, SHOTS, stage as stageByKey } from './stages.js';
import { WORLD_VERT, WORLD_FRAG, MASK_VERT, MASK_FRAG, COMPOSITE_FRAG, PRESENT_FRAG, COPY_FRAG, TONEMAP_FRAG, BRIGHT_FRAG, DOWN_FRAG, UP_FRAG } from './shaders.js';
import { ease, damp, clamp } from '../core/math.js';

// The gallery that the whole second half of the museum takes place in.
// It is the same room the path tracer renders, built from the same scene
// description, so any stage of real-time rendering can be swept into the
// next, all the way to path tracing, without the picture ever jumping.

const TYPE = { [MAT.DIFFUSE]: 0, [MAT.METAL]: 1, [MAT.GLASS]: 2, [MAT.EMIT]: 3, FLOOR: 4 };
const TEX = { NONE: 0, FLOOR: 1, WALL: 2 };
const CURSOR_ORIGIN = new THREE.Vector3(3.16, 2.65, 1.06);

// Soft, low-frequency mottling: enough to make a surface read as a material,
// without per-texel noise that would turn into glitter when sampled sparsely.
function mottle(x, size, alpha, seed) {
  let a = seed;
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 40; k++) {
    const cx = rnd() * size, cy = rnd() * size, r = size * (0.08 + rnd() * 0.18), dark = rnd() < 0.5;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {   // tile seamlessly
      const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
      g.addColorStop(0, dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
    }
  }
}

function floorCanvas() {
  const c = makeCanvas(256, 256), x = c.getContext('2d');
  // two by two squares; one texture repeat covers two metres
  const dark = '#464646', light = '#9b9b9b';
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { x.fillStyle = (i + j) % 2 ? light : dark; x.fillRect(i * 128, j * 128, 128, 128); }
  mottle(x, 256, 0.05, 7);
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2;
  for (let k = 0; k <= 2; k++) { x.beginPath(); x.moveTo(k * 128, 0); x.lineTo(k * 128, 256); x.stroke(); x.beginPath(); x.moveTo(0, k * 128); x.lineTo(256, k * 128); x.stroke(); }
  return c;
}

function wallCanvas() {
  const c = makeCanvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, 256, 256);
  mottle(x, 256, 0.045, 11);
  x.fillStyle = 'rgba(0,0,0,0.12)';
  for (let k = 0; k < 256; k += 64) x.fillRect(0, k, 256, 2);
  return c;
}

function mipLevelsTexture() {
  const cols = [[255, 70, 60], [255, 160, 40], [255, 236, 60], [80, 220, 90], [60, 190, 255], [90, 90, 255], [200, 80, 255], [255, 80, 200], [255, 255, 255]];
  const mips = [];
  for (let s = 256, l = 0; s >= 1; s >>= 1, l++) {
    const d = new Uint8Array(s * s * 4), c = cols[Math.min(l, cols.length - 1)];
    for (let i = 0; i < s * s; i++) d.set([c[0], c[1], c[2], 255], i * 4);
    mips.push({ data: d, width: s, height: s });
  }
  const t = new THREE.DataTexture(mips[0].data, 256, 256);
  t.mipmaps = mips; t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

function textureFrom(canvas, mips) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (mips) { t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; }
  else { t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
}

export class World {
  constructor(app) {
    this.app = app;
    this.renderer = app.renderer;
    this.def = galleryScene();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.05, 60);
    this.segments = 40;
    this._buildTextures();
    this._buildUniforms();
    this._buildObjects();
    this._buildPasses();
    this.current = STAGES[0];
    this.sweep = null;
    this.view = { pos: new THREE.Vector3(...SHOTS.wide.pos), look: new THREE.Vector3(...SHOTS.wide.look), fov: SHOTS.wide.fov };
    this.orbit = { yaw: 0, pitch: 0, zoom: 1, yawT: 0, pitchT: 0, zoomT: 1 };
    this.drift = 1;
    this.time = 0;
    this.resize(window.innerWidth, window.innerHeight);
  }

  // ------------------------------------------------------------------ build
  _buildTextures() {
    const fc = floorCanvas(), wc = wallCanvas();
    this.tex = {
      floorNearest: textureFrom(fc, false), floorMip: textureFrom(fc, true),
      wallNearest: textureFrom(wc, false), wallMip: textureFrom(wc, true),
      mipLevels: mipLevelsTexture(),
    };
  }

  _buildUniforms() {
    const d = this.def, wl = d.wallLeft, wr = d.wallRight, wc = d.wall;
    this.u = {
      uShade: { value: 4 }, uView: { value: 0 }, uTexOn: { value: 0 }, uEnvOn: { value: 0 }, uShadowOn: { value: 0 }, uHDR: { value: 0 },
      uAffine: { value: 0 }, uSnap: { value: 0 }, uSnapRes: { value: new THREE.Vector2(160, 120) }, uMipViz: { value: 0 },
      uTime: { value: 0 }, uNear: { value: 2 }, uFar: { value: 16 }, uEnvBright: { value: 1 }, uEmitScale: { value: 1 },
      uTexFloor: { value: this.tex.floorMip }, uTexWall: { value: this.tex.wallMip }, uTexMip: { value: this.tex.mipLevels },
      uShadowMap: { value: null }, uShadowMat: { value: new THREE.Matrix4() },
      uRoomMin: { value: new THREE.Vector3(...d.room.min) }, uRoomMax: { value: new THREE.Vector3(...d.room.max) },
      uWallL: { value: new THREE.Vector3(...wl) }, uWallR: { value: new THREE.Vector3(...wr) }, uWallC: { value: new THREE.Vector3(...wc) },
      uLightPos: { value: new THREE.Vector3(0, 5.25, -0.4) }, uLightColor: { value: new THREE.Color(1.0, 0.92, 0.82) }, uLightPower: { value: 2.6 },
      uLight2Pos: { value: CURSOR_ORIGIN.clone() }, uLight2Color: { value: new THREE.Color(1.0, 0.62, 0.18) }, uLight2Power: { value: 1.6 },
      uSky: { value: new THREE.Color(0.32, 0.31, 0.3) }, uGround: { value: new THREE.Color(0.12, 0.11, 0.1) }, uAmbient: { value: 0.55 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: WORLD_VERT, fragmentShader: WORLD_FRAG, extensions: { derivatives: true } });
    this.maskU = { uOrigin: { value: CURSOR_ORIGIN.clone() }, uRadius: { value: 0 }, uWidth: { value: 0.5 } };
    this.maskMaterial = new THREE.ShaderMaterial({ uniforms: this.maskU, vertexShader: MASK_VERT, fragmentShader: MASK_FRAG });
    this.depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
  }

  /** Every surface of the gallery, as separate indexed geometries. */
  _parts() {
    const d = this.def, parts = [];
    const add = (geo, { albedo, type, param = 0, emit = 0, tex = TEX.NONE }) => parts.push({ geo, albedo, type, param, emit, tex });
    const seg = this.segments;
    // spheres first and the room last, so a renderer without a depth test paints the room over them
    for (const s of d.spheres) {
      const g = new THREE.SphereGeometry(s.r, seg, Math.max(6, Math.round(seg * 0.6)));
      g.translate(...s.c);
      add(g, { albedo: s.col, type: TYPE[s.m], param: s.p });
    }
    for (const b of d.boxes) {
      const size = b.max.map((v, i) => v - b.min[i]), c = b.max.map((v, i) => (v + b.min[i]) / 2);
      const g = new THREE.BoxGeometry(...size, 2, 2, 2); g.translate(...c);
      add(g, { albedo: b.col, type: TYPE[b.m], emit: b.m === MAT.EMIT ? b.p : 0 });
    }
    const [x0, y0, z0] = d.room.min, [x1, y1, z1] = d.room.max;
    const W = x1 - x0, H = y1 - y0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const plane = (w, h, sx, sy, rotX, rotY, pos) => { const g = new THREE.PlaneGeometry(w, h, sx, sy); if (rotX) g.rotateX(rotX); if (rotY) g.rotateY(rotY); g.translate(...pos); return g; };
    const floor = plane(W, D, 8, 10, -Math.PI / 2, 0, [cx, y0, cz]);
    // floor texture coordinates follow the world: one square per metre
    const p = floor.attributes.position, uv = floor.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, -p.getZ(i) / 2);
    add(floor, { albedo: [0.19, 0.19, 0.19], type: TYPE.FLOOR, tex: TEX.FLOOR });
    add(plane(W, H, 8, 4, 0, 0, [cx, H / 2, z0]), { albedo: d.wall, type: 0, tex: TEX.WALL });
    add(plane(D, H, 10, 4, 0, Math.PI / 2, [x0, H / 2, cz]), { albedo: d.wallLeft, type: 0, tex: TEX.WALL });
    add(plane(D, H, 10, 4, 0, -Math.PI / 2, [x1, H / 2, cz]), { albedo: d.wallRight, type: 0, tex: TEX.WALL });
    add(plane(W, D, 6, 6, Math.PI / 2, 0, [cx, y1, cz]), { albedo: [0.7, 0.7, 0.7], type: 0 });
    add(plane(W, H, 6, 3, 0, Math.PI, [cx, H / 2, z1]), { albedo: d.wall, type: 0, tex: TEX.WALL });
    return parts;
  }

  _buildObjects() {
    const parts = this._parts();
    // one non-indexed mesh for every triangle, so triangles can be revealed one by one
    const flat = parts.map((p) => p.geo.toNonIndexed());
    const total = flat.reduce((a, g) => a + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uvs = new Float32Array(total * 2);
    const alb = new Float32Array(total * 3), mat = new Float32Array(total * 4), tri = new Float32Array(total);
    let o = 0;
    flat.forEach((g, k) => {
      const p = parts[k], n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uvs.set(g.attributes.uv.array, o * 2);
      for (let i = 0; i < n; i++) {
        alb.set(p.albedo, (o + i) * 3);
        mat.set([p.type, p.param, p.emit, p.tex], (o + i) * 4);
        tri[o + i] = Math.floor((o + i) / 3) * 0.37 + k * 13.1;
      }
      o += n;
      g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aAlbedo', new THREE.BufferAttribute(alb, 3));
    geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 4));
    geo.setAttribute('aTri', new THREE.BufferAttribute(tri, 1));
    if (this.solid) { this.scene.remove(this.solid, this.points, this.wire, this.normals); [this.solid, this.points, this.wire, this.normals].forEach((m) => m.geometry.dispose()); }
    this.solid = new THREE.Mesh(geo, this.material);
    this.solid.frustumCulled = false;
    this.triangleCount = total / 3;

    // points: every unique corner, coloured by its surface
    const pts = [], cols = [];
    const lines = [], lcols = [];
    const normals = [];
    for (const p of parts) {
      const g = p.geo, a = g.attributes.position, nrm = g.attributes.normal;
      const c = p.emit ? [1, 0.8, 0.5] : p.albedo.map((v) => Math.min(1, v * 1.6 + 0.25));
      for (let i = 0; i < a.count; i++) { pts.push(a.getX(i), a.getY(i), a.getZ(i)); cols.push(...c); }
      const w = new THREE.WireframeGeometry(g), wp = w.attributes.position;
      for (let i = 0; i < wp.count; i++) { lines.push(wp.getX(i), wp.getY(i), wp.getZ(i)); lcols.push(...c); }
      w.dispose();
      if (g.type === 'SphereGeometry') for (let i = 0; i < a.count; i += 2) {
        normals.push(a.getX(i), a.getY(i), a.getZ(i), a.getX(i) + nrm.getX(i) * 0.3, a.getY(i) + nrm.getY(i) * 0.3, a.getZ(i) + nrm.getZ(i) * 0.3);
      }
      g.dispose();
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.07, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.pointCount = pts.length / 3;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lcols, 3));
    this.wire = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(normals, 3));
    this.normals = new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: 0x6ab4ff }));
    this.normals.visible = false;
    for (const o2 of [this.points, this.wire, this.normals]) o2.frustumCulled = false;
    this.scene.add(this.solid, this.points, this.wire, this.normals);

    if (!this.lightOrb) {
      this.lightOrb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(1.6); this.lightOrb.add(halo);
      this.lightOrb.visible = false;
      this.scene.add(this.lightOrb);
    }
  }

  /** Show only the first fraction `k` of all triangles, in the order they are stored. */
  revealTriangles(k) {
    this.solid.geometry.setDrawRange(0, k >= 1 ? Infinity : Math.floor(k * this.triangleCount) * 3);
  }

  /** Rebuild with a different sphere tessellation (used to show Gouraud's weakness). */
  setDetail(segments) {
    if (segments === this.segments) return;
    this.segments = segments;
    this._buildObjects();
  }

  _buildPasses() {
    const hf = { type: THREE.HalfFloatType };
    const near = { ...hf, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.rtLow = new THREE.WebGLRenderTarget(4, 4, near);
    this.rtMSAA = new THREE.WebGLRenderTarget(4, 4, { ...hf, samples: 4 });
    this.rtA = new THREE.WebGLRenderTarget(4, 4, hf);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, hf);
    this.rtMask = new THREE.WebGLRenderTarget(4, 4);
    this.rtTone = new THREE.WebGLRenderTarget(4, 4, hf);
    this.bright = new THREE.WebGLRenderTarget(4, 4, hf);
    this.mips = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(4, 4, hf));
    this.ups = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(4, 4, hf));
    this.shadowRT = new THREE.WebGLRenderTarget(2048, 2048);
    this.shadowRT.depthTexture = new THREE.DepthTexture(2048, 2048);
    this.u.uShadowMap.value = this.shadowRT.depthTexture;
    this.shadowCam = new THREE.PerspectiveCamera(128, 1, 0.3, 16);
    this.composite = shaderPass(COMPOSITE_FRAG, { tA: { value: null }, tB: { value: null }, tMask: { value: null }, uTime: { value: 0 }, uEdge: { value: new THREE.Color(1.0, 0.85, 0.6) } });
    this.present = shaderPass(PRESENT_FRAG, { tSrc: { value: null } });
    this.copy = shaderPass(COPY_FRAG, { tSrc: { value: null } });
    this.tonemap = shaderPass(TONEMAP_FRAG, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.8 }, uExposure: { value: 1 } });
    this.brightPass = shaderPass(BRIGHT_FRAG, { tSrc: { value: null }, uThresh: { value: 1.1 }, uKnee: { value: 0.5 } });
    this.downPass = shaderPass(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upPass = shaderPass(UP_FRAG, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.ptDisplay = shaderPass(`uniform sampler2D tSrc; uniform float uExposure; varying vec2 vUv; ${TONEMAP_GLSL}
      void main(){ gl_FragColor = vec4(aces(texture2D(tSrc, vUv).rgb * uExposure), 1.0); }`, { tSrc: { value: null }, uExposure: { value: 1 } });
  }

  resize(w, h) {
    const pr = this.renderer.getPixelRatio();
    this.W = Math.floor(w * pr); this.H = Math.floor(h * pr);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    for (const rt of [this.rtA, this.rtB, this.rtMask, this.rtTone]) rt.setSize(this.W, this.H);
    let bw = this.W >> 1, bh = this.H >> 1;
    this.bright.setSize(bw, bh);
    this.mips.forEach((m, i) => { bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); m.setSize(bw, bh); this.ups[i].setSize(bw, bh); });
    this.pt?.setSize(this.W, this.H);
  }

  // ------------------------------------------------------------------ path tracing
  get pathTracer() {
    if (!this.pt) {
      this.pt = new PathTracer(this.renderer, this.def);
      this.pt.scale = this.app.lowQuality ? 0.15 : Math.min(0.75, 1.1 / (window.devicePixelRatio || 1));
      this.pt.setSize(this.W, this.H);
    }
    return this.pt;
  }

  // ------------------------------------------------------------------ camera
  /** Glide to a named shot (or {pos, look, fov}). Returns a promise. */
  shot(name, duration = 3) {
    const s = typeof name === 'string' ? SHOTS[name] : name;
    this._shotTween?.cancel();
    const from = { pos: this.view.pos.clone(), look: this.view.look.clone(), fov: this.view.fov };
    const to = { pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look), fov: s.fov || 46 };
    this.orbit.yawT = 0; this.orbit.pitchT = 0; this.orbit.zoomT = 1;
    if (duration <= 0) { this.view.pos.copy(to.pos); this.view.look.copy(to.look); this.view.fov = to.fov; return Promise.resolve(true); }
    this._shotTween = this.app.tweens.to(duration, (k) => {
      this.view.pos.lerpVectors(from.pos, to.pos, k); this.view.look.lerpVectors(from.look, to.look, k); this.view.fov = from.fov + (to.fov - from.fov) * k;
    }, { ease: 'inOutSine' });
    return this._shotTween.promise;
  }

  /** Visitor drag/wheel around the current shot. */
  orbitBy(dx, dy, wheel = 0) {
    const o = this.orbit;
    o.yawT = clamp(o.yawT - dx * 0.004, -1.2, 1.2);
    o.pitchT = clamp(o.pitchT + dy * 0.003, -0.5, 0.6);
    if (wheel) o.zoomT = clamp(o.zoomT * Math.pow(1.0012, wheel), 0.45, 1.5);
  }

  _applyCamera(dt) {
    const o = this.orbit, cam = this.camera;
    // settle exactly, so a still camera really is still (the path tracer restarts on any movement)
    const settle = (v, t, k, eps = 1e-5) => (Math.abs(v - t) < eps ? t : damp(v, t, k, dt));
    o.yaw = settle(o.yaw, o.yawT, 5); o.pitch = settle(o.pitch, o.pitchT, 5); o.zoom = settle(o.zoom, o.zoomT, 5);
    const look = this.view.look, off = this.view.pos.clone().sub(look);
    const still = this.current.show === 'path' || (this.sweep && this.sweep.to.show === 'path');
    this.drift = settle(this.drift, still ? 0 : 1, 4, 1e-3);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += o.yaw + Math.sin(this.time * 0.11) * 0.07 * this.drift;
    sph.phi = clamp(sph.phi - o.pitch + Math.sin(this.time * 0.07) * 0.025 * this.drift, 0.2, Math.PI / 2 + 0.25);
    sph.radius *= o.zoom;
    cam.position.copy(look).add(new THREE.Vector3().setFromSpherical(sph));
    cam.lookAt(look);
    if (Math.abs(cam.fov - this.view.fov) > 1e-3) { cam.fov = this.view.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ stages
  get stageIndex() { return STAGES.indexOf(this.current); }

  /**
   * Show a stage. With `sweep`, an upgrade wave travels out of the glowing
   * cursor bar and redraws the room behind it. Returns a promise that
   * resolves when the wave has finished.
   */
  setStage(key, { sweep = true, duration = 2.6, origin = CURSOR_ORIGIN } = {}) {
    const next = typeof key === 'string' ? stageByKey(key) : key;
    if (!next) throw new Error(`unknown stage ${key}`);
    if (this.sweep) { this.current = this.sweep.to; this.sweep.resolve(false); this.sweep = null; }
    if (next === this.current) return Promise.resolve(true);
    if (!sweep) { this.current = next; return Promise.resolve(true); }
    if (next.show === 'path') this.pathTracer.reset();
    this.maskU.uOrigin.value.copy(origin);
    return new Promise((resolve) => {
      this.sweep = { from: this.current, to: next, t: 0, duration, resolve };
      this.app.audio.sweep(duration * 0.7, 0.06);
    });
  }

  /** Called by rooms every frame. */
  update(dt, t) {
    this.time = t;
    this.u.uTime.value = t;
    this.composite.material.uniforms.uTime.value = t;
    if (this.sweep) {
      const s = this.sweep;
      s.t += dt / s.duration;
      this.maskU.uRadius.value = ease.inOutSine(clamp(s.t)) * 16;
      if (s.t >= 1) { this.current = s.to; this.sweep = null; s.resolve(true); }
    }
    this._applyCamera(dt);
  }

  _setStageState(s) {
    const u = this.u;
    u.uShade.value = s.shade ?? 4;
    u.uTexOn.value = s.tex && s.tex !== 'none' ? 1 : 0;
    u.uTexFloor.value = s.tex === 'nearest' ? this.tex.floorNearest : this.tex.floorMip;
    u.uTexWall.value = s.tex === 'nearest' ? this.tex.wallNearest : this.tex.wallMip;
    u.uEnvOn.value = s.env ? 1 : 0;
    u.uShadowOn.value = s.shadow ? 1 : 0;
    u.uHDR.value = s.hdr ? 1 : 0;
    u.uEmitScale.value = 1;
    this.material.depthTest = s.depth !== false;
    this.material.depthWrite = s.depth !== false;
    this.solid.visible = s.show === 'solid';
    this.points.visible = s.show === 'points';
    this.wire.visible = s.show === 'wire';
    this.normals.visible = !!this.showNormals && s.show === 'solid';
    if (this.forceView !== undefined) u.uView.value = this.forceView;
  }

  _renderShadowMap() {
    const r = this.renderer, cam = this.shadowCam;
    cam.position.copy(this.u.uLightPos.value);
    cam.up.set(0, 0, -1);
    cam.lookAt(cam.position.x, 0, cam.position.z);
    cam.updateMatrixWorld();
    this.u.uShadowMat.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const vis = [this.points.visible, this.wire.visible, this.lightOrb.visible, this.normals.visible, this.solid.visible];
    this.points.visible = this.wire.visible = this.lightOrb.visible = this.normals.visible = false; this.solid.visible = true;
    this.scene.overrideMaterial = this.depthMaterial;
    r.setRenderTarget(this.shadowRT); r.clear(); r.render(this.scene, cam);
    this.scene.overrideMaterial = null;
    [this.points.visible, this.wire.visible, this.lightOrb.visible, this.normals.visible, this.solid.visible] = vis;
  }

  /** Render one stage, display-ready, into `out` (full resolution). */
  renderStage(s, out) {
    const r = this.renderer;
    if (s.show === 'path') { this._renderPath(out); return; }
    this._setStageState(s);
    if (s.shadow) this._renderShadowMap();
    const scale = this.app.lowQuality ? Math.min(s.res, 0.5) : s.res;
    const w = Math.max(16, Math.floor(this.W * scale)), h = Math.max(12, Math.floor(this.H * scale));
    const rt = s.msaa ? this.rtMSAA : this.rtLow;
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    r.setRenderTarget(rt);
    r.setClearColor(s.show === 'solid' ? 0x000000 : 0x05060c, 1);
    r.clear();
    r.render(this.scene, this.camera);
    if (s.hdr) {
      this._bloom(rt.texture);
      const tu = this.tonemap.material.uniforms;
      tu.tScene.value = rt.texture; tu.tBloom.value = this.bloomTexture;
      this.tonemap.render(r, out);
    } else {
      this.copy.material.uniforms.tSrc.value = rt.texture;
      this.copy.render(r, out);
    }
  }

  _bloom(src) {
    const r = this.renderer;
    this.brightPass.material.uniforms.tSrc.value = src; this.brightPass.render(r, this.bright);
    let cur = this.bright;
    for (const m of this.mips) { const u = this.downPass.material.uniforms; u.tSrc.value = cur.texture; u.uTexel.value.set(1 / cur.width, 1 / cur.height); this.downPass.render(r, m); cur = m; }
    let up = this.mips[this.mips.length - 1];
    for (let i = this.mips.length - 2; i >= 0; i--) {
      const u = this.upPass.material.uniforms; u.tSrc.value = up.texture; u.tPrev.value = this.mips[i].texture; u.uTexel.value.set(1 / up.width, 1 / up.height);
      this.upPass.render(r, this.ups[i]); up = this.ups[i];
    }
    this.bloomTexture = up.texture;
  }

  _renderPath(out) {
    const pt = this.pathTracer, cam = this.camera;
    const moved = pt.camera.position.distanceToSquared(cam.position) > 1e-12 || pt.camera.quaternion.angleTo(cam.quaternion) > 1e-6 || Math.abs(pt.camera.fov - cam.fov) > 1e-4;
    if (moved) {
      pt.camera.position.copy(cam.position); pt.camera.quaternion.copy(cam.quaternion);
      pt.camera.fov = cam.fov; pt.camera.aspect = cam.aspect; pt.camera.updateProjectionMatrix();
      pt.reset();
    }
    const ns = this.app.adapt(this, pt.scale, 0.2);
    if (ns !== pt.scale) { pt.scale = ns; pt.setSize(this.W, this.H); }
    if (pt.frame < 6000) pt.step(this.app.lowQuality ? 1 : pt.frame < 64 ? 2 : 1);
    this.ptDisplay.material.uniforms.tSrc.value = pt.texture;
    this.ptDisplay.render(this.renderer, out);
  }

  _renderMask() {
    const r = this.renderer;
    const vis = [this.points.visible, this.wire.visible, this.lightOrb.visible, this.normals.visible, this.solid.visible];
    this.points.visible = this.wire.visible = this.lightOrb.visible = this.normals.visible = false; this.solid.visible = true;
    const dt = this.material.depthTest;
    this.scene.overrideMaterial = this.maskMaterial;
    r.setRenderTarget(this.rtMask); r.setClearColor(0x000000, 1); r.clear(); r.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.material.depthTest = dt;
    [this.points.visible, this.wire.visible, this.lightOrb.visible, this.normals.visible, this.solid.visible] = vis;
  }

  /** Render the current stage (or a sweep between two) to `target`. */
  render(target = null) {
    const r = this.renderer;
    if (this.sweep) {
      this.renderStage(this.sweep.from, this.rtA);
      this.renderStage(this.sweep.to, this.rtB);
      this._renderMask();
      const u = this.composite.material.uniforms;
      u.tA.value = this.rtA.texture; u.tB.value = this.rtB.texture; u.tMask.value = this.rtMask.texture;
      this.composite.render(r, target);
      return;
    }
    this.renderStage(this.current, this.rtA);
    this.present.material.uniforms.tSrc.value = this.rtA.texture;
    this.present.render(r, target);
  }

  /** The texture of the last presented frame (for loupes and thumbnails). */
  get lastFrame() { return this.rtA; }
}

export const getWorld = (app) => app.service('world', (a) => new World(a));
export { CURSOR_ORIGIN };
