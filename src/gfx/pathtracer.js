import * as THREE from 'three';

// A small progressive GPU path tracer. One sample per pixel per frame is
// averaged into a floating-point buffer. The same scene description is
// mirrored in JavaScript (traceJS) so a single ray can be followed and drawn.

export const MAT = { DIFFUSE: 0, METAL: 1, GLASS: 2, EMIT: 3 };

export function galleryScene() {
  return {
    room: { min: [-5, 0, -4.5], max: [5, 5.6, 8] },
    wallLeft: [0.07, 0.3, 0.33], wallRight: [0.72, 0.42, 0.14], wall: [0.62, 0.6, 0.57],
    spheres: [
      { c: [0, 1.95, 0], r: 1.05, m: MAT.GLASS, col: [1, 1, 1], p: 1.5 },
      { c: [-2.55, 1.0, -0.9], r: 1.0, m: MAT.METAL, col: [0.95, 0.93, 0.9], p: 0.02 },
      { c: [2.6, 0.85, -0.4], r: 0.85, m: MAT.DIFFUSE, col: [0.82, 0.8, 0.76], p: 0 },
      { c: [1.35, 0.35, 1.6], r: 0.35, m: MAT.METAL, col: [1.0, 0.72, 0.38], p: 0.25 },
      { c: [-1.2, 0.3, 1.9], r: 0.3, m: MAT.GLASS, col: [0.75, 0.95, 1.0], p: 1.45 },
    ],
    boxes: [
      { min: [-0.8, 0, -0.8], max: [0.8, 0.9, 0.8], m: MAT.DIFFUSE, col: [0.12, 0.12, 0.13], p: 0 }, // pedestal
      { min: [-1.8, 5.5, -2.0], max: [1.8, 5.6, 1.2], m: MAT.EMIT, col: [1.0, 0.92, 0.82], p: 7.5 }, // softbox
      { min: [3.0, 2.35, 1.0], max: [3.32, 2.95, 1.12], m: MAT.EMIT, col: [1.0, 0.62, 0.18], p: 14 }, // the cursor
    ],
    cam: { pos: [0, 2.55, 7.4], look: [0, 1.55, 0], fov: 46 },
  };
}

const MAXS = 8, MAXB = 6;

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const PT_FRAG = /* glsl */`
precision highp float;
precision highp int;
varying vec2 vUv;
uniform sampler2D uPrev;
uniform float uFrame;
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform mat4 uCamWorld;
uniform mat4 uProjInv;
uniform int uBounces;
uniform float uSeed;
uniform vec4 uS[${MAXS}];
uniform vec4 uSM[${MAXS}];
uniform vec3 uSC[${MAXS}];
uniform int uNS;
uniform vec3 uBmin[${MAXB}];
uniform vec3 uBmax[${MAXB}];
uniform vec4 uBM[${MAXB}];
uniform vec3 uBC[${MAXB}];
uniform int uNB;
uniform vec3 uRoomMin, uRoomMax, uWallL, uWallR, uWall;
uniform float uDirectOnly;

uint seed;
uint pcg(){ seed = seed * 747796405u + 2891336453u; uint w = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u; return (w >> 22u) ^ w; }
float rnd(){ return float(pcg()) / 4294967295.0; }
vec3 rndSphere(){ float z = rnd()*2.0-1.0; float a = rnd()*6.2831853; float r = sqrt(1.0-z*z); return vec3(r*cos(a), r*sin(a), z); }
vec3 cosDir(vec3 n){ return normalize(n + rndSphere()); }

struct Hit { float t; vec3 n; int m; vec3 col; float p; };

void sphere(vec3 ro, vec3 rd, int i, inout Hit h){
  vec3 oc = ro - uS[i].xyz; float b = dot(oc, rd); float c = dot(oc, oc) - uS[i].w*uS[i].w;
  float d = b*b - c; if (d < 0.0) return; d = sqrt(d);
  float t = -b - d; if (t < 1e-4) t = -b + d; if (t < 1e-4 || t > h.t) return;
  h.t = t; h.n = (ro + rd*t - uS[i].xyz) / uS[i].w; h.m = int(uSM[i].x); h.col = uSC[i]; h.p = uSM[i].y;
}
void box(vec3 ro, vec3 rd, int i, inout Hit h){
  vec3 inv = 1.0 / rd; vec3 t0 = (uBmin[i] - ro) * inv, t1 = (uBmax[i] - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z), tf = min(min(tmax.x, tmax.y), tmax.z);
  if (tn > tf || tf < 1e-4) return; float t = tn > 1e-4 ? tn : tf; if (t > h.t) return;
  h.t = t; vec3 p = ro + rd*t; vec3 c = (uBmin[i] + uBmax[i]) * 0.5, e = (uBmax[i] - uBmin[i]) * 0.5;
  vec3 d = (p - c) / e; vec3 a = abs(d);
  h.n = a.x > a.y && a.x > a.z ? vec3(sign(d.x),0,0) : a.y > a.z ? vec3(0,sign(d.y),0) : vec3(0,0,sign(d.z));
  h.m = int(uBM[i].x); h.col = uBC[i]; h.p = uBM[i].y;
}
void room(vec3 ro, vec3 rd, inout Hit h){
  vec3 inv = 1.0 / rd; vec3 t0 = (uRoomMin - ro) * inv, t1 = (uRoomMax - ro) * inv;
  vec3 tmax = max(t0, t1); float tf = min(min(tmax.x, tmax.y), tmax.z);
  if (tf > h.t) return; h.t = tf; vec3 p = ro + rd*tf; h.m = 0; h.p = 0.0;
  if (tf == tmax.x) { h.n = vec3(-sign(rd.x), 0, 0); h.col = rd.x < 0.0 ? uWallL : uWallR; }
  else if (tf == tmax.y) { h.n = vec3(0, -sign(rd.y), 0);
    if (rd.y < 0.0) { float ch = mod(floor(p.x) + floor(p.z), 2.0); h.col = mix(vec3(0.06), vec3(0.32), ch); h.m = 1; h.p = 0.35; }
    else h.col = vec3(0.7); }
  else { h.n = vec3(0, 0, -sign(rd.z)); h.col = uWall; }
}
Hit scene(vec3 ro, vec3 rd){
  Hit h; h.t = 1e20; h.m = -1;
  room(ro, rd, h);
  for (int i = 0; i < ${MAXS}; i++) { if (i >= uNS) break; sphere(ro, rd, i, h); }
  for (int i = 0; i < ${MAXB}; i++) { if (i >= uNB) break; box(ro, rd, i, h); }
  return h;
}

vec3 trace(vec3 ro, vec3 rd){
  vec3 acc = vec3(0), thr = vec3(1);
  for (int b = 0; b < 12; b++) {
    if (b > uBounces) break;
    Hit h = scene(ro, rd);
    if (h.m < 0) break;
    vec3 p = ro + rd * h.t;
    if (h.m == 3) { acc += thr * h.col * h.p; break; }
    if (b == uBounces) break;
    vec3 n = h.n;
    if (h.m == 0) {
      thr *= h.col; rd = cosDir(n); ro = p + n * 1e-3;
    } else if (h.m == 1) {
      // glossy floor mixes diffuse + mirror
      if (h.p > 0.3 && rnd() < 0.55) { thr *= h.col * 1.6; rd = cosDir(n); }
      else { rd = normalize(reflect(rd, n) + rndSphere() * h.p); thr *= mix(h.col, vec3(1.0), h.p > 0.3 ? 0.6 : 0.0); if (dot(rd, n) < 0.0) break; }
      ro = p + n * 1e-3;
    } else {
      bool into = dot(rd, n) < 0.0; vec3 nn = into ? n : -n;
      float eta = into ? 1.0 / h.p : h.p;
      float cosi = -dot(rd, nn);
      float r0 = (1.0 - h.p) / (1.0 + h.p); r0 *= r0;
      float fr = r0 + (1.0 - r0) * pow(1.0 - cosi, 5.0);
      vec3 rf = refract(rd, nn, eta);
      if (dot(rf, rf) == 0.0 || rnd() < fr) { rd = reflect(rd, nn); ro = p + nn * 1e-3; }
      else { rd = rf; ro = p - nn * 1e-3; thr *= h.col; }
    }
    if (b > 3) { float q = max(thr.r, max(thr.g, thr.b)); if (rnd() > q) break; thr /= q; }
  }
  return acc;
}

void main(){
  seed = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uint(uFrame) * 26699u + uint(uSeed);
  vec2 jitter = vec2(rnd(), rnd()) - 0.5;
  vec2 ndc = ((gl_FragCoord.xy + jitter) / uRes) * 2.0 - 1.0;
  vec4 v = uProjInv * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize((uCamWorld * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
  vec3 c = trace(uCamPos, rd);
  c = min(c, vec3(24.0));
  vec3 prev = texture2D(uPrev, vUv).rgb;
  gl_FragColor = vec4(mix(prev, c, 1.0 / (uFrame + 1.0)), 1.0);
}
`;

export const TONEMAP_GLSL = /* glsl */`
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
`;

export class PathTracer {
  constructor(renderer, scene = galleryScene()) {
    this.renderer = renderer;
    this.sceneDef = scene;
    const canFloat = renderer.extensions.has('EXT_color_buffer_float');
    const opt = { type: canFloat ? THREE.FloatType : THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rt = [new THREE.WebGLRenderTarget(4, 4, opt), new THREE.WebGLRenderTarget(4, 4, opt)];
    this.cur = 0;
    this.frame = 0;
    this.scale = 0.5;
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    const S = this.sceneDef;
    this.uniforms = {
      uPrev: { value: null }, uFrame: { value: 0 }, uRes: { value: new THREE.Vector2(4, 4) },
      uCamPos: { value: new THREE.Vector3() }, uCamWorld: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
      uBounces: { value: 6 }, uSeed: { value: Math.random() * 1e6 }, uDirectOnly: { value: 0 },
      uS: { value: Array.from({ length: MAXS }, () => new THREE.Vector4()) },
      uSM: { value: Array.from({ length: MAXS }, () => new THREE.Vector4()) },
      uSC: { value: Array.from({ length: MAXS }, () => new THREE.Vector3()) },
      uNS: { value: 0 },
      uBmin: { value: Array.from({ length: MAXB }, () => new THREE.Vector3()) },
      uBmax: { value: Array.from({ length: MAXB }, () => new THREE.Vector3()) },
      uBM: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) },
      uBC: { value: Array.from({ length: MAXB }, () => new THREE.Vector3()) },
      uNB: { value: 0 },
      uRoomMin: { value: new THREE.Vector3(...S.room.min) }, uRoomMax: { value: new THREE.Vector3(...S.room.max) },
      uWallL: { value: new THREE.Vector3(...S.wallLeft) }, uWallR: { value: new THREE.Vector3(...S.wallRight) }, uWall: { value: new THREE.Vector3(...S.wall) },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: PT_FRAG, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.qscene = new THREE.Scene(); this.qscene.add(this.quad);
    this.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.syncScene();
    const c = S.cam;
    this.camera.position.set(...c.pos); this.camera.lookAt(...c.look); this.camera.fov = c.fov;
  }

  syncScene() {
    const S = this.sceneDef, u = this.uniforms;
    S.spheres.slice(0, MAXS).forEach((s, i) => { u.uS.value[i].set(...s.c, s.r); u.uSM.value[i].set(s.m, s.p, 0, 0); u.uSC.value[i].set(...s.col); });
    u.uNS.value = Math.min(S.spheres.length, MAXS);
    S.boxes.slice(0, MAXB).forEach((b, i) => { u.uBmin.value[i].set(...b.min); u.uBmax.value[i].set(...b.max); u.uBM.value[i].set(b.m, b.p, 0, 0); u.uBC.value[i].set(...b.col); });
    u.uNB.value = Math.min(S.boxes.length, MAXB);
    u.uWallL.value.set(...S.wallLeft); u.uWallR.value.set(...S.wallRight);
    this.reset();
  }

  setSize(w, h) {
    const W = Math.max(4, Math.floor(w * this.scale)), H = Math.max(4, Math.floor(h * this.scale));
    if (this.rt[0].width === W && this.rt[0].height === H) return;
    this.rt.forEach((r) => r.setSize(W, H));
    this.uniforms.uRes.value.set(W, H);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.reset();
  }

  reset() { this.frame = 0; }

  step(samples = 1) {
    const r = this.renderer, u = this.uniforms, cam = this.camera;
    cam.updateMatrixWorld();
    u.uCamPos.value.copy(cam.position);
    u.uCamWorld.value.copy(cam.matrixWorld);
    u.uProjInv.value.copy(cam.projectionMatrixInverse);
    const prevTarget = r.getRenderTarget();
    for (let i = 0; i < samples; i++) {
      u.uPrev.value = this.rt[this.cur].texture;
      u.uFrame.value = this.frame;
      this.cur ^= 1;
      r.setRenderTarget(this.rt[this.cur]);
      r.render(this.qscene, this.qcam);
      this.frame++;
    }
    r.setRenderTarget(prevTarget);
  }

  get texture() { return this.rt[this.cur].texture; }
}

// ---------------------------------------------------------------- JS mirror
// Deterministic version (no randomness except where the material demands it),
// used to draw the path one ray takes through the scene.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const reflect = (d, n) => sub(d, mul(n, 2 * dot(d, n)));
function refract(d, n, eta) {
  const c = -dot(n, d), k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return null;
  return add(mul(d, eta), mul(n, eta * c - Math.sqrt(k)));
}

export function intersectJS(S, ro, rd) {
  let best = { t: 1e20 };
  const rm = S.room, inv = rd.map((v) => 1 / v);
  const tmax = [0, 1, 2].map((k) => Math.max((rm.min[k] - ro[k]) * inv[k], (rm.max[k] - ro[k]) * inv[k]));
  const tf = Math.min(...tmax), ax = tmax.indexOf(tf);
  const n = [0, 0, 0]; n[ax] = -Math.sign(rd[ax]);
  best = { t: tf, n, m: ax === 1 && rd[1] < 0 ? MAT.METAL : MAT.DIFFUSE, p: ax === 1 && rd[1] < 0 ? 0.35 : 0, kind: 'wall' };
  S.spheres.forEach((s, i) => {
    const oc = sub(ro, s.c), b = dot(oc, rd), c = dot(oc, oc) - s.r * s.r, d = b * b - c;
    if (d < 0) return; const sd = Math.sqrt(d);
    let t = -b - sd; if (t < 1e-4) t = -b + sd; if (t < 1e-4 || t > best.t) return;
    best = { t, n: mul(sub(add(ro, mul(rd, t)), s.c), 1 / s.r), m: s.m, p: s.p, kind: 'sphere', i };
  });
  S.boxes.forEach((bx, i) => {
    let tn = -1e20, tf2 = 1e20;
    for (let k = 0; k < 3; k++) {
      const t0 = (bx.min[k] - ro[k]) * inv[k], t1 = (bx.max[k] - ro[k]) * inv[k];
      tn = Math.max(tn, Math.min(t0, t1)); tf2 = Math.min(tf2, Math.max(t0, t1));
    }
    if (tn > tf2 || tf2 < 1e-4) return; const t = tn > 1e-4 ? tn : tf2; if (t > best.t) return;
    const p = add(ro, mul(rd, t)); const c = mul(add(bx.min, bx.max), 0.5), e = mul(sub(bx.max, bx.min), 0.5);
    const d = [0, 1, 2].map((k) => (p[k] - c[k]) / e[k]); const a = d.map(Math.abs);
    const k = a[0] > a[1] && a[0] > a[2] ? 0 : a[1] > a[2] ? 1 : 2; const nn = [0, 0, 0]; nn[k] = Math.sign(d[k]);
    best = { t, n: nn, m: bx.m, p: bx.p, kind: 'box', i };
  });
  return best;
}

// Follow one ray. Diffuse bounces pick a deterministic-looking random direction.
export function traceJS(S, ro, rd, bounces = 6, rng = Math.random) {
  const pts = [{ p: ro, kind: 'eye' }];
  for (let b = 0; b <= bounces; b++) {
    const h = intersectJS(S, ro, rd);
    const p = add(ro, mul(rd, h.t));
    const ev = { p, m: h.m, kind: h.kind, n: h.n };
    pts.push(ev);
    if (h.m === MAT.EMIT) { ev.event = 'light'; break; }
    if (b === bounces) { ev.event = 'stop'; break; }
    let n = h.n;
    if (h.m === MAT.DIFFUSE) {
      let r; do { r = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]; } while (dot(r, r) > 1);
      rd = norm(add(n, norm(r))); ro = add(p, mul(n, 1e-3)); ev.event = 'diffuse';
    } else if (h.m === MAT.METAL) {
      rd = norm(reflect(rd, n)); ro = add(p, mul(n, 1e-3)); ev.event = 'reflect';
    } else {
      const into = dot(rd, n) < 0; const nn = into ? n : mul(n, -1);
      const rf = refract(rd, nn, into ? 1 / h.p : h.p);
      if (!rf) { rd = reflect(rd, nn); ro = add(p, mul(nn, 1e-3)); ev.event = 'total internal reflection'; }
      else { rd = norm(rf); ro = sub(p, mul(nn, 1e-3)); ev.event = into ? 'refract in' : 'refract out'; }
    }
  }
  return pts;
}
