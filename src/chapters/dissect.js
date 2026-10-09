import * as THREE from 'three';
import { Orbit, textSprite } from '../gfx/lab.js';
import { BRIGHT, DOWN, UP } from './post.js';

// ROOM 13 — The frame, dissected. One modern-looking frame, pulled apart into
// the eleven images it is built from. The lighting function is live GLSL you
// can edit and recompile.

const QV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const DEFAULT_SURFACE = `// Called for every pixel of every surface.
// albedo: base colour   N: normal   V: to eye
// L: to sun   shadow: 0 in shadow, 1 lit
float diff = max(dot(N, L), 0.0) * shadow;
vec3  H    = normalize(L + V);
float spec = pow(max(dot(N, H), 0.0), 90.0) * shadow;
vec3  amb  = sky * 0.22;
return albedo * (sun * diff + amb) + sun * spec * 0.6;`;

const SCENE_VERT = /* glsl */`
attribute vec3 tint;
varying vec3 vWP, vN, vCol; varying vec4 vSC; varying float vVZ;
uniform mat4 uShadowMat;
void main(){
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.0);
  vWP = w.xyz; vN = normalize(mat3(m) * normal);
  vCol = tint;
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #endif
  vSC = uShadowMat * w;
  vec4 mv = viewMatrix * w; vVZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const sceneFrag = (surface) => /* glsl */`
uniform int uView; uniform float uFog, uEmissive, uTime, uFlat, uNear, uFar;
uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uFogCol;
uniform sampler2D uShadow;
varying vec3 vWP, vN, vCol; varying vec4 vSC; varying float vVZ;
float shadowAt(){
  vec3 c = vSC.xyz / vSC.w * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0) return 1.0;
  float s = 0.0; vec2 t = vec2(1.0 / 2048.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) s += step(c.z - 0.0015, texture2D(uShadow, c.xy + vec2(x, y) * t * 1.5).r);
  return s / 9.0;
}
vec3 surface(vec3 albedo, vec3 N, vec3 V, vec3 L, float shadow, vec3 sun, vec3 sky){
${surface}
}
void main(){
  vec3 N = normalize(vN);
  if (uFlat > 0.5) N = normalize(cross(dFdx(vWP), dFdy(vWP)));
  vec3 V = normalize(cameraPosition - vWP), L = normalize(uSunDir);
  vec3 albedo = vCol;
  float sh = shadowAt();
  vec3 sky = mix(uSkyHor, uSkyTop, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 lit = surface(albedo, N, V, L, sh, uSunCol, sky) + albedo * uEmissive;
  float dist = length(vWP - cameraPosition);
  float fogF = 1.0 - exp(-dist * uFog) * (1.0 - 0.0);
  fogF *= clamp(1.2 - vWP.y * 0.08, 0.0, 1.0);
  vec3 col;
  if (uView == 1) col = vec3(1.0 - clamp((vVZ - uNear) / (uFar - uNear), 0.0, 1.0));
  else if (uView == 2) col = N * 0.5 + 0.5;
  else if (uView == 3) col = albedo;
  else if (uView == 5) col = albedo * uSunCol * max(dot(N, L), 0.0) * sh;
  else if (uView == 6) col = uSunCol * pow(max(dot(N, normalize(L + V)), 0.0), 90.0) * sh * 0.6 + albedo * sky * 0.22 + albedo * uEmissive;
  else if (uView == 7) col = vec3(fogF);
  else col = mix(lit, uFogCol, fogF);
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_FRAG = /* glsl */`
uniform int uView; uniform vec3 uSkyTop, uSkyHor, uFogCol, uSunDir, uSunCol;
varying vec3 vWP, vN, vCol; varying vec4 vSC; varying float vVZ;
void main(){
  vec3 d = normalize(vWP - cameraPosition);
  vec3 c = mix(uFogCol, uSkyTop, smoothstep(-0.02, 0.5, d.y));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunCol * (pow(s, 600.0) * 30.0 + pow(s, 12.0) * 0.25);
  if (uView == 1 || uView == 2 || uView == 3 || uView == 5 || uView == 6) c = vec3(0.0);
  if (uView == 7) c = vec3(1.0);
  gl_FragColor = vec4(c, 1.0);
}`;

const VIEW_FRAG = /* glsl */`
uniform sampler2D tSrc, tBloom; uniform int uMode; uniform float uBloom, uExposure; varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  if (uMode == 1) c = aces(c * uExposure);                              // HDR preview
  if (uMode == 2) c = aces(c * 2.0);                                    // bloom only
  if (uMode == 3) { c = aces((c + texture2D(tBloom, vUv).rgb * uBloom) * uExposure);
    vec2 v = vUv * (1.0 - vUv.yx); c *= pow(clamp(v.x * v.y * 15.0, 0.0, 1.0), 0.25);
    c = pow(c, vec3(0.95, 1.0, 1.05)); }
  if (uMode == 4) c = vec3(pow(c.r, 6.0));                              // shadow map depth
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const PASSES = [
  { name: 'Geometry', desc: 'Triangles only: the raw shapes, before any colour.' },
  { name: 'Depth', desc: 'Distance from the camera. White is near.' },
  { name: 'Normals', desc: 'The direction each surface faces, stored as a colour (x→red, y→green, z→blue).' },
  { name: 'Albedo', desc: 'The base colour of each material, with no light at all.' },
  { name: 'Shadow map', desc: 'The scene seen from the sun. Anything farther than this depth is in shadow.' },
  { name: 'Direct light', desc: 'Sunlight only: albedo × sun colour × N·L × shadow.' },
  { name: 'Specular + sky', desc: 'Highlights reflected from the sun, plus soft light from the sky.' },
  { name: 'Fog', desc: 'How much air sits between each pixel and the eye. White is fully hidden.' },
  { name: 'Lit (HDR)', desc: 'Everything combined, with brightness values far above 1.0.' },
  { name: 'Bloom', desc: 'The brightest parts, blurred through a pyramid of shrinking images.' },
  { name: 'Final', desc: 'Lit + bloom, tone mapped, vignetted and colour graded.' },
];

export default {
  id: 'dissect', title: 'The Frame, Dissected', year: '2010s', tagline: 'One frame of a modern renderer is built from a dozen hidden images. Pull them apart.',
  mode: 'world', ui: 'flat13', music: 'pulse',
  secrets: [
    { id: 'shaderedit', title: 'Shader author', hint: 'Edit the lighting code and recompile it.', desc: 'You changed how every pixel of the frame is lit.' },
    { id: 'shaderbreak', title: 'Compile error', hint: 'Break the shader on purpose.', desc: 'Every graphics programmer has met this black screen.' },
  ],
  notes: [
    {
      title: 'A frame is a recipe', meta: 'Render passes',
      body: `<p>Modern games rarely draw a frame in one go. They render the scene several times into hidden images (depth, normals, base colour, shadows) and then combine them in later passes. Many engines from the late 2000s onward used this <b>deferred</b> approach because lighting could then be computed once per pixel, however many objects there were.</p><p>Drag <b>Explode</b> to pull the frame apart into its layers.</p>`,
    },
    {
      title: 'Shadow maps', meta: '1978',
      body: `<p>To know if a point is in shadow, render the scene once from the light's point of view and keep only the depth. Later, for each pixel, ask: is this point farther from the sun than what the sun could see? If so, something is in the way.</p><p>The idea dates from 1978 and is still the most common shadow technique in games.</p>`,
    },
    {
      title: 'The code is the look', meta: 'Live GLSL',
      body: `<p>The <b>Lighting shader</b> window holds the actual function that lights every pixel of the final image, written in GLSL, the language graphics cards run. Change a number (try 90.0 → 8.0 for broad, soft highlights, or multiply <code>amb</code> by 3.0) and press <b>Compile</b>. Your code is sent to the GPU and runs on millions of pixels a second.</p>`,
    },
    {
      title: 'Fog and atmosphere', meta: 'Distance',
      body: `<p>Air is not perfectly clear. The farther away something is, the more of its light is scattered and replaced by the colour of the sky. One exponential does it convincingly:</p><div class="eq">fog = 1 − e^(−distance × density)
colour = mix(surface, sky, fog)</div><p>Early 3D games also used fog to hide how short their draw distance was.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.orbit = new Orbit(this.cam, { dist: 23, theta: -0.55, phi: 1.2, target: new THREE.Vector3(0, 3.0, 0), maxPhi: 1.52, minDist: 8, maxDist: 45 });
    this.orbit.auto = 0.03;
    this.common = {
      uView: { value: 10 }, uFog: { value: 0.022 }, uEmissive: { value: 0 }, uTime: { value: 0 }, uFlat: { value: 0 }, uNear: { value: 6 }, uFar: { value: 60 },
      uSunDir: { value: new THREE.Vector3(-0.55, 0.32, -0.6).normalize() }, uSunCol: { value: new THREE.Color(3.2, 2.2, 1.4) },
      uSkyTop: { value: new THREE.Color(0.08, 0.14, 0.32) }, uSkyHor: { value: new THREE.Color(0.55, 0.3, 0.22) }, uFogCol: { value: new THREE.Color(0.42, 0.24, 0.2) },
      uShadow: { value: null }, uShadowMat: { value: new THREE.Matrix4() },
    };
    this.surfaceCode = DEFAULT_SURFACE;
    this.mats = [];
    const mk = (opts = {}) => {
      const u = { ...this.common, uEmissive: { value: opts.emissive || 0 }, uFlat: { value: opts.flat ? 1 : 0 } };
      const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SCENE_VERT, fragmentShader: sceneFrag(this.surfaceCode), extensions: { derivatives: true } });
      this.mats.push(m); return m;
    };
    const tint = (geo, c) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3); const col = new THREE.Color(c); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3); geo.setAttribute('tint', new THREE.BufferAttribute(a, 3)); return geo; };
    this.tint = tint;

    // sky dome
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.ShaderMaterial({ uniforms: this.common, vertexShader: SCENE_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
    tint(this.sky.geometry, 0x000000); s.add(this.sky);
    // wet floor
    const floor = new THREE.Mesh(tint(new THREE.PlaneGeometry(160, 160, 1, 1), 0x15161c), mk()); floor.rotation.x = -Math.PI / 2; s.add(floor);
    // the monolith field: instanced hexagonal pillars
    const pg = tint(new THREE.CylinderGeometry(0.5, 0.55, 1, 6), 0xffffff); pg.translate(0, 0.5, 0);
    const N = 140; const pillars = new THREE.InstancedMesh(pg, mk({ flat: true }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    let k = 0, rnd = 3;
    const R = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    while (k < N) {
      const a = R() * Math.PI * 2, r = 6 + Math.pow(R(), 0.8) * 34;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = (0.8 + R() * 2) * (8 / (1 + r * 0.12)) * (R() > 0.85 ? 2.2 : 1);
      const w = 0.6 + R() * 1.4;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 3);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(w, h, w));
      pillars.setMatrixAt(k, m4);
      c.setHSL(0.6 + R() * 0.08, 0.15, 0.18 + R() * 0.2); pillars.setColorAt(k, c);
      k++;
    }
    s.add(pillars); this.pillars = pillars;
    // the crystal: flat-shaded icosahedron with an emissive core and a ring
    this.crystal = new THREE.Mesh(tint(new THREE.IcosahedronGeometry(1.6, 0), 0xc8d4ff), mk({ flat: true }));
    this.crystal.position.set(0, 4.2, 0); s.add(this.crystal);
    this.core = new THREE.Mesh(tint(new THREE.IcosahedronGeometry(0.55, 1), 0xffb070), mk({ emissive: 9 })); this.core.position.copy(this.crystal.position); s.add(this.core);
    this.ring = new THREE.Mesh(tint(new THREE.TorusGeometry(3.0, 0.045, 8, 160), 0x6ad8ff), mk({ emissive: 7 })); this.ring.position.copy(this.crystal.position); s.add(this.ring);
    this.ring2 = new THREE.Mesh(tint(new THREE.TorusGeometry(3.6, 0.03, 8, 160), 0xff6a9a), mk({ emissive: 6 })); this.ring2.position.copy(this.crystal.position); s.add(this.ring2);
    // pedestal
    const ped = new THREE.Mesh(tint(new THREE.CylinderGeometry(1.4, 1.8, 1.2, 6), 0x2a2b33), mk({ flat: true })); ped.position.y = 0.6; s.add(ped);
    // drifting shards
    const sg = tint(new THREE.TetrahedronGeometry(0.18), 0xffffff);
    this.shards = new THREE.InstancedMesh(sg, mk({ flat: true, emissive: 2.5 }), 70);
    this.shardData = Array.from({ length: 70 }, () => ({ a: Math.random() * 6.28, r: 2 + Math.random() * 6, y: Math.random() * 9, v: 0.2 + Math.random() * 0.5 }));
    for (let i = 0; i < 70; i++) this.shards.setColorAt(i, new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 0.9, 0.6));
    s.add(this.shards);

    // shadow map from the sun
    this.sunCam = new THREE.OrthographicCamera(-40, 40, 40, -40, 1, 160);
    this.shadowRT = new THREE.WebGLRenderTarget(2048, 2048, { depthBuffer: true });
    this.shadowRT.depthTexture = new THREE.DepthTexture(2048, 2048);
    this.common.uShadow.value = this.shadowRT.depthTexture;
    this.depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.wireMat = new THREE.MeshBasicMaterial({ color: 0x8fd3ff, wireframe: true });

    // render targets for every pass
    this.passRT = PASSES.map(() => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
    this.full = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.bright = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.mips = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
    this.ups = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
    const M = (frag, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: QV, fragmentShader: frag, depthTest: false });
    this.mBright = M(BRIGHT, { tSrc: { value: null }, uThresh: { value: 1.2 }, uKnee: { value: 0.5 } });
    this.mDown = M(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = M(UP, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mView = M(VIEW_FRAG, { tSrc: { value: null }, tBloom: { value: null }, uMode: { value: 0 }, uBloom: { value: 0.9 }, uExposure: { value: 1.0 } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mView);
    this.qs = new THREE.Scene(); this.qs.add(this.quad); this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // the dissection stage: every pass as a glass layer in space
    this.stack = new THREE.Scene(); this.stack.background = new THREE.Color(0x101318);
    this.stackCam = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.layers = PASSES.map((p, i) => {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.passRT[i].texture, side: THREE.DoubleSide, transparent: true }));
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xff6b57 }));
      plane.add(frame);
      const lab = textSprite(`${String(i + 1).padStart(2, '0')}  ${p.name}`, { size: 0.09, color: '#f2f4f8', font: '500 40px Geist, sans-serif' });
      lab.position.set(-0.5 + lab.geometry.parameters.width / 2, 0.56, 0); plane.add(lab);
      this.stack.add(plane); return plane;
    });
    this.dispRT = PASSES.map(() => null);
    this.view = 10; this.explode = 0; this.explodeGoal = 0;
    this.setAspect(window.innerWidth / window.innerHeight);
  },

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); this.stackCam.aspect = a; this.stackCam.updateProjectionMatrix(); this._key = null; this.aspect = a; },

  size(renderer) {
    const W = renderer.domElement.width, H = renderer.domElement.height, key = W + 'x' + H;
    if (this._key === key) return; this._key = key;
    this.full.setSize(W, H);
    const pw = Math.floor(W * 0.42), ph = Math.floor(H * 0.42);
    this.passRT.forEach((r) => r.setSize(pw, ph));
    let w = W >> 1, h = H >> 1; this.bright.setSize(w, h);
    this.mips.forEach((m, i) => { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); m.setSize(w, h); this.ups[i].setSize(w, h); });
    this.layers.forEach((l) => l.scale.set(this.aspect, 1, 1));
  },

  enter(app) { this.buildControls(); this.buildCode(); app.ui.showChrome(true); },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Render passes');
    this.obj = [ui.objective('Explode the frame'), ui.objective('Look at three different passes')];
    ui.slider('Explode', { min: 0, max: 1, step: 0.01, value: 0, fmt: (v) => Math.round(v * 100) + '%' }, (v) => { this.explodeGoal = v; if (v > 0.5) { this.obj[0].done(); this.app.ready(true); } });
    this.passSeg = ui.segmented('Show pass', PASSES.map((p, i) => ({ v: i, l: `${i + 1} ${p.name}` })), this.view, (v) => {
      this.view = v; (this.seen = this.seen || new Set()).add(v); if (this.seen.size >= 3) this.obj[1].done();
      this.passDesc.textContent = PASSES[v].desc;
    });
    this.passDesc = ui.hint(PASSES[this.view].desc);
    ui.slider('Fog density', { min: 0, max: 0.08, step: 0.001, value: this.common.uFog.value, fmt: (v) => v.toFixed(3) }, (v) => (this.common.uFog.value = v));
    ui.slider('Sun height', { min: 0.05, max: 1.2, step: 0.01, value: 0.32 }, (v) => { this.common.uSunDir.value.set(-0.55, v, -0.6).normalize(); });
  },

  buildCode() {
    const bd = this.app.ui.extraWindow('Lighting shader · GLSL', { left: 14, bottom: 70 }, 400);
    const ta = (this.ta = document.createElement('textarea')); ta.className = 'code'; ta.id = 'glsl-surface'; ta.spellcheck = false; ta.value = this.surfaceCode;
    ta.style.minHeight = '190px';
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') this.compile(); });
    bd.appendChild(ta);
    const r = document.createElement('div'); r.className = 'row'; bd.appendChild(r);
    this.app.ui.button('Compile ⌘↵', () => this.compile(), r, 'on');
    this.app.ui.button('Reset', () => { ta.value = DEFAULT_SURFACE; this.compile(); }, r);
    this.codeMsg = document.createElement('div'); this.codeMsg.className = 'hint'; this.codeMsg.textContent = 'vec3 surface(vec3 albedo, vec3 N, vec3 V, vec3 L, float shadow, vec3 sun, vec3 sky)';
    bd.appendChild(this.codeMsg);
  },

  compile() {
    const r = this.app.renderer, code = this.ta.value;
    let err = null;
    const prev = r.debug.onShaderError;
    r.debug.onShaderError = (gl, program, vs, fs) => { err = gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(program) || 'compile failed'; };
    const test = new THREE.ShaderMaterial({ uniforms: this.mats[0].uniforms, vertexShader: SCENE_VERT, fragmentShader: sceneFrag(code), extensions: { derivatives: true } });
    const probe = new THREE.Mesh(this.crystal.geometry, test);
    const sc = new THREE.Scene(); sc.add(probe);
    try { r.compile(sc, this.cam); r.setRenderTarget(this.passRT[0]); r.render(sc, this.cam); } catch (e) { err = String(e); }
    r.debug.onShaderError = prev;
    test.dispose();
    if (err) {
      const line = (err.match(/ERROR: 0:(\d+): (.*)/) || [])[2] || err.split('\n')[0];
      this.codeMsg.textContent = '✕ ' + line.slice(0, 140);
      this.codeMsg.style.color = 'var(--ui-accent)';
      this.app.audio.hurt();
      this.app.secret('shaderbreak', 'Compile error', 'Every graphics programmer knows this feeling. The old shader keeps running.');
      return;
    }
    this.surfaceCode = code;
    for (const m of this.mats) { m.fragmentShader = sceneFrag(code); m.needsUpdate = true; }
    this.codeMsg.style.color = ''; this.codeMsg.textContent = '✓ compiled and running on every pixel';
    this.app.audio.chime([74, 79, 86], 'fm');
    if (code.trim() !== DEFAULT_SURFACE.trim()) this.app.secret('shaderedit', 'Shader author', 'You changed how every pixel of the frame is lit.');
  },

  pointer(type, p, e) { this.orbit.handle(type, p, e); },

  update(dt, t) {
    this.orbit.update(dt);
    this.common.uTime.value = t;
    this.crystal.rotation.set(t * 0.2, t * 0.3, 0); this.core.rotation.y = -t;
    this.ring.rotation.set(1.2 + Math.sin(t * 0.3) * 0.2, t * 0.4, 0); this.ring2.rotation.set(0.4, -t * 0.25, Math.sin(t * 0.2));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    this.shardData.forEach((d, i) => {
      d.y += d.v * dt; if (d.y > 10) d.y = 0; d.a += dt * 0.2;
      q.setFromEuler(new THREE.Euler(t + i, t * 0.7 + i, 0));
      m4.compose(new THREE.Vector3(Math.cos(d.a) * d.r, d.y, Math.sin(d.a) * d.r), q, new THREE.Vector3(1, 1, 1));
      this.shards.setMatrixAt(i, m4);
    });
    this.shards.instanceMatrix.needsUpdate = true;
    this.explode += (this.explodeGoal - this.explode) * (1 - Math.exp(-dt * 4));
    // stack layout
    const e = this.explode;
    this.layers.forEach((l, i) => {
      const k = i - (PASSES.length - 1);
      l.position.set(k * 0.12 * e, 0, k * 0.9 * e);
      l.material.opacity = i === this.view ? 1 : 0.92;
      l.children[0].material.color.set(i === this.view ? 0xffffff : 0xff6b57);
    });
    const a = -0.9 * e + t * 0.05 * e;
    const camR = 2.6 + e * 7;
    this.stackCam.position.set(Math.sin(a) * camR + e * 1.5, 0.4 + e * 1.8, Math.cos(a) * camR);
    this.stackCam.lookAt(e * -0.6, 0, -e * 4.5);
  },

  pass(mat, target) { this.quad.material = mat; this.app.renderer.setRenderTarget(target); this.app.renderer.render(this.qs, this.qc); },

  renderView(renderer, view, target) {
    const s = this.scene;
    if (view === 0) {
      s.overrideMaterial = this.wireMat; this.sky.visible = false; const bg = s.background; s.background = new THREE.Color(0x05070c);
      renderer.setRenderTarget(target); renderer.render(s, this.cam);
      s.overrideMaterial = null; this.sky.visible = true; s.background = bg; return;
    }
    if (view === 4) { this.mView.uniforms.tSrc.value = this.shadowRT.depthTexture; this.mView.uniforms.uMode.value = 4; this.pass(this.mView, target); return; }
    this.common.uView.value = view >= 8 ? 8 : view;
    renderer.setRenderTarget(target); renderer.render(s, this.cam);
  },

  bloom(src) {
    this.mBright.uniforms.tSrc.value = src.texture; this.pass(this.mBright, this.bright);
    let cur = this.bright;
    for (const m of this.mips) { this.mDown.uniforms.tSrc.value = cur.texture; this.mDown.uniforms.uTexel.value.set(1 / cur.width, 1 / cur.height); this.pass(this.mDown, m); cur = m; }
    let up = this.mips[this.mips.length - 1];
    for (let i = this.mips.length - 2; i >= 0; i--) { this.mUp.uniforms.tSrc.value = up.texture; this.mUp.uniforms.tPrev.value = this.mips[i].texture; this.mUp.uniforms.uTexel.value.set(1 / up.width, 1 / up.height); this.pass(this.mUp, this.ups[i]); up = this.ups[i]; }
    return up.texture;
  },

  render(renderer, target) {
    this.size(renderer);
    // sun shadow map
    const L = this.common.uSunDir.value;
    this.sunCam.position.copy(L).multiplyScalar(70); this.sunCam.lookAt(0, 0, 0); this.sunCam.updateMatrixWorld();
    this.common.uShadowMat.value.multiplyMatrices(this.sunCam.projectionMatrix, this.sunCam.matrixWorldInverse);
    this.sky.visible = false; this.scene.overrideMaterial = this.depthMat;
    renderer.setRenderTarget(this.shadowRT); renderer.render(this.scene, this.sunCam);
    this.scene.overrideMaterial = null; this.sky.visible = true;

    const exploded = this.explode > 0.02;
    // HDR lit frame at full resolution, then bloom
    this.common.uView.value = 8;
    renderer.setRenderTarget(this.full); renderer.render(this.scene, this.cam);
    const bloomTex = this.bloom(this.full);
    const v = this.mView.uniforms; v.tBloom.value = bloomTex;

    if (!exploded) {
      const view = this.view;
      if (view === 10) { v.tSrc.value = this.full.texture; v.uMode.value = 3; this.pass(this.mView, target); }
      else if (view === 9) { v.tSrc.value = bloomTex; v.uMode.value = 2; this.pass(this.mView, target); }
      else if (view === 8) { v.tSrc.value = this.full.texture; v.uMode.value = 1; this.pass(this.mView, target); }
      else if (view === 4) this.renderView(renderer, 4, target);
      else {
        // render straight into the target with the pass's output mode
        this.renderView(renderer, view, this.passRT[view]);
        v.tSrc.value = this.passRT[view].texture; v.uMode.value = 0; this.pass(this.mView, target);
      }
      return;
    }
    // exploded: render every pass into its layer (as display-ready images)
    for (let i = 0; i < PASSES.length; i++) {
      if (i <= 7) { this.renderView(renderer, i, this.passRT[i]); if (i !== 4) { /* raw */ } }
    }
    // convert the HDR-ish layers to display values in place via a temp copy
    const disp = (i, mode, tex) => { v.tSrc.value = tex; v.uMode.value = mode; this.pass(this.mView, this.passRT[i]); };
    disp(8, 1, this.full.texture); disp(9, 2, bloomTex); disp(10, 3, this.full.texture);
    renderer.setRenderTarget(target);
    renderer.render(this.stack, this.stackCam);
  },
};
