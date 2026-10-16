import * as THREE from 'three';
import { Room } from '../app/Room.js';
import { shaderPass } from '../gfx/three-utils.js';
import { clamp, damp } from '../core/math.js';

// ROOM 14 · Worlds from formulas.
// No triangles at all. The whole scene is one function that answers "how far
// is the nearest surface from here?", and every pixel's ray hops forward by
// exactly that answer until it lands. A probe ray in the scene shows the hops
// as glass bubbles: each bubble is one question asked of the formula.

const MAX_HOPS = 32;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform vec3 uCam, uTarget; uniform float uTime, uK, uMorph, uRepeat, uSteps, uProbe; uniform int uMode;
uniform vec4 uHops[${MAX_HOPS}]; uniform int uHopCount; uniform vec3 uProbeO, uProbeEnd;

float sdSphere(vec3 p, float r){ return length(p) - r; }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float smin(float a, float b, float k){ if (k <= 0.0) return min(a, b); float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

vec2 map(vec3 p){
  float d = p.y + 1.0, m = 0.0;
  vec3 q = p - vec3(0.0, 0.6, 0.0);
  float body = mix(sdSphere(q, 1.0), sdBox(q, vec3(0.75)) - 0.08, uMorph);
  float s = smin(body, sdTorus(q, vec2(1.55, 0.12)), uK);
  for (int i = 0; i < 4; i++) {
    float a = uTime * 0.7 + float(i) * 1.5708;
    s = smin(s, sdSphere(q - vec3(cos(a) * 1.9, 0.4 * sin(uTime + float(i)), sin(a) * 1.9), 0.32), uK);
  }
  if (s < d) { d = s; m = 1.0; }
  if (uRepeat > 0.5) {
    vec3 r = p; r.xz = mod(r.xz + 3.0, 6.0) - 3.0;
    float col = max(sdBox(r - vec3(0.0, 0.5, 0.0), vec3(0.28, 1.6, 0.28)), -sdSphere(p, 4.0));
    if (col < d) { d = col; m = 2.0; }
  }
  return vec2(d, m);
}

vec3 normal(vec3 p){ vec2 e = vec2(0.0015, 0.0); return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x)); }
float softShadow(vec3 ro, vec3 rd){ float r = 1.0, t = 0.03; for (int i = 0; i < 40; i++){ float h = map(ro + rd * t).x; r = min(r, 10.0 * h / t); t += clamp(h, 0.02, 0.4); if (h < 0.001 || t > 12.0) break; } return clamp(r, 0.0, 1.0); }
float ao(vec3 p, vec3 n){ float o = 0.0, s = 1.0; for (int i = 1; i <= 5; i++){ float h = 0.04 * float(i); o += (h - map(p + n * h).x) * s; s *= 0.7; } return clamp(1.0 - 2.5 * o, 0.0, 1.0); }
vec3 sky(vec3 rd){ return mix(vec3(0.42, 0.27, 0.27), vec3(0.02, 0.03, 0.08), smoothstep(-0.05, 0.45, rd.y)); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// closest distance between the view ray and a segment, and where along the view ray
vec2 segDist(vec3 ro, vec3 rd, vec3 a, vec3 b){
  vec3 ba = b - a, oa = ro - a;
  float d = dot(rd, ba), L2 = dot(ba, ba);
  float denom = L2 - d * d;
  float s = denom > 1e-6 ? clamp((dot(oa, ba) - dot(oa, rd) * d) / denom, 0.0, 1.0) : 0.0;
  vec3 pb = a + ba * s;
  float t = max(dot(pb - ro, rd), 0.0);
  return vec2(length(ro + rd * t - pb), t);
}

void main(){
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ww = normalize(uTarget - uCam), uu = normalize(cross(ww, vec3(0, 1, 0))), vv = cross(uu, ww);
  vec3 rd = normalize(p.x * uu + p.y * vv + 1.8 * ww), ro = uCam;
  float t = 0.0, steps = 0.0; vec2 h = vec2(1.0, -1.0);
  for (int i = 0; i < 256; i++) {
    if (float(i) >= uSteps) break;
    h = map(ro + rd * t);
    steps += 1.0;
    if (abs(h.x) < 0.0008 * t || t > 40.0) break;
    t += h.x;
  }
  vec3 col;
  bool hit = t < 40.0 && abs(h.x) < 0.02 * t + 0.01;
  if (uMode == 1) {
    float k = steps / uSteps;
    col = mix(vec3(0.05, 0.02, 0.2), vec3(1.0, 0.8, 0.2), sqrt(k));
    if (k > 0.98) col = vec3(1.0, 0.1, 0.2);
  } else if (!hit) col = sky(rd);
  else {
    vec3 pos = ro + rd * t, n = normal(pos);
    if (uMode == 2) col = n * 0.5 + 0.5;
    else {
      vec3 L = normalize(vec3(-0.5, 0.6, -0.4));
      vec3 alb = h.y < 0.5 ? vec3(0.32) : h.y < 1.5 ? vec3(0.95, 0.45, 0.3) : vec3(0.75, 0.78, 0.85);
      if (h.y < 0.5) { vec2 g = abs(fract(pos.xz) - 0.5); alb *= 0.75 + 0.25 * smoothstep(0.46, 0.5, max(g.x, g.y)); }
      float dif = max(dot(n, L), 0.0) * softShadow(pos + n * 0.01, L);
      float spe = pow(max(dot(reflect(rd, n), L), 0.0), 40.0) * dif;
      col = alb * (vec3(2.2, 1.7, 1.35) * dif + sky(n) * 0.45 * ao(pos, n)) + spe * 2.0;
    }
    col = mix(col, sky(rd), 1.0 - exp(-0.0025 * t * t));
  }
  float tScene = hit ? t : 1e5;
  if (uMode == 3) {
    // the formula itself, painted on the horizontal slice y = 0.6
    float tp = (0.6 - ro.y) / rd.y;
    if (tp > 0.0 && tp < tScene) {
      float dd = map(ro + rd * tp).x;
      vec3 band = dd > 0.0 ? vec3(0.25, 0.6, 1.0) : vec3(1.0, 0.4, 0.2);
      float iso = smoothstep(0.06, 0.0, abs(fract(dd * 4.0) - 0.5) - 0.44);
      vec3 c2 = band * (0.35 + 0.25 * cos(dd * 25.0)) + iso * 0.6;
      c2 = mix(c2, vec3(1.0), smoothstep(0.03, 0.0, abs(dd)));
      col = mix(col, c2, 0.85);
    }
  }
  if (uMode == 0 || uMode == 3) col = aces(col);

  // the probe: glass bubbles, one per hop, threaded on the ray
  if (uProbe > 0.001) {
    vec3 acc = vec3(0.0); float alpha = 0.0;
    for (int i = 0; i < ${MAX_HOPS}; i++) {
      if (i >= uHopCount) break;
      vec4 s = uHops[i];
      vec3 oc = ro - s.xyz;
      float b = dot(oc, rd), c = dot(oc, oc) - s.w * s.w, disc = b * b - c;
      if (disc > 0.0) {
        float t0 = -b - sqrt(disc);
        if (t0 > 0.0 && t0 < tScene) {
          vec3 nn = normalize(oc + rd * t0);
          float rim = pow(1.0 - abs(dot(nn, rd)), 3.0);
          float a = (0.025 + rim * 0.45) * uProbe;
          acc += vec3(1.0, 0.86, 0.6) * a * (1.0 - alpha); alpha += a * (1.0 - alpha);
        }
      }
      // the point where the formula was asked
      vec3 pc = s.xyz - ro; float tc = dot(pc, rd);
      if (tc > 0.0 && tc < tScene) {
        float dd = length(pc - rd * tc) / tc;
        float dot_ = smoothstep(0.012, 0.006, dd) * uProbe;
        acc = mix(acc, vec3(1.0), dot_); alpha = max(alpha, dot_);
      }
    }
    vec2 sd = segDist(ro, rd, uProbeO, uProbeEnd);
    if (sd.y < tScene + 0.05) {
      float line = smoothstep(0.006, 0.002, sd.x / max(sd.y, 0.1)) * uProbe;
      acc = mix(acc, vec3(1.0, 0.95, 0.85), line); alpha = max(alpha, line);
    }
    col = col * (1.0 - alpha) + acc;
  }
  // colours above are display values; store them linear so the copy pass can encode them
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), 1.0);
}`;

const COPY = /* glsl */`uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv);
  #include <colorspace_fragment>
}`;

// ---- the same formula in JavaScript, so the probe can be traced exactly
const len3 = (x, y, z) => Math.hypot(x, y, z);
function sdBox(x, y, z, bx, by = bx, bz = bx) {
  const qx = Math.abs(x) - bx, qy = Math.abs(y) - by, qz = Math.abs(z) - bz;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
}
function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}
function mapJS(x, y, z, u) {
  let d = y + 1;
  const qx = x, qy = y - 0.6, qz = z, k = u.uK.value, m = u.uMorph.value, time = u.uTime.value;
  const body = (len3(qx, qy, qz) - 1) * (1 - m) + (sdBox(qx, qy, qz, 0.75) - 0.08) * m;
  let s = smin(body, Math.hypot(Math.hypot(qx, qz) - 1.55, qy) - 0.12, k);
  for (let i = 0; i < 4; i++) {
    const a = time * 0.7 + i * 1.5708;
    s = smin(s, len3(qx - Math.cos(a) * 1.9, qy - 0.4 * Math.sin(time + i), qz - Math.sin(a) * 1.9) - 0.32, k);
  }
  d = Math.min(d, s);
  if (u.uRepeat.value > 0.5) {
    const mod = (v) => ((((v + 3) % 6) + 6) % 6) - 3;
    d = Math.min(d, Math.max(sdBox(mod(x), y - 0.5, mod(z), 0.28, 1.6, 0.28), -(len3(x, y, z) - 4)));
  }
  return d;
}

export default (app) => new RaymarchRoom(app, {
  id: 'raymarch', title: 'Worlds from Formulas', years: '1989 · 2000s', music: 'lush',
  secrets: [
    { id: 'infinity', title: 'Infinity for free', hint: 'Fold space so the world repeats.', desc: 'One mod() call turns one column into infinitely many.' },
    { id: 'fewsteps', title: 'Out of steps', hint: 'Starve the rays of steps.', desc: 'Grazing rays need many small steps; give them too few and the world dissolves.' },
  ],
  notes: [
    { title: 'Signed distance', body: [
      'Instead of a list of triangles, the whole scene is one function that answers: from this point, how far is the nearest surface? Positive outside, negative inside, zero exactly on the surface. A sphere is one line:',
      { eq: 'sphere(p) = length(p) − radius' },
    ] },
    { title: 'Sphere tracing', body: [
      'The answer is the distance to the nearest surface in any direction, so a ray can safely jump forward by exactly that much without passing through anything: the bubbles in the scene. Repeat until the distance is tiny. Near edges the jumps get tiny, which is why the Hops view glows around outlines.',
    ] },
    { title: 'Blending shapes', body: [
      'Combining two shapes is min(a, b): whichever is nearer. Replace min with a smooth minimum and the shapes melt together like liquid metal. One number, k, sets how far the blending reaches.',
      { eq: 'h = clamp(0.5 + 0.5·(b − a)/k, 0, 1)\nsmin = mix(b, a, h) − k·h·(1 − h)' },
    ] },
    { title: 'The demoscene', body: [
      'Demosceners, programmers who make real-time art under extreme size limits, adopted this approach in the 2000s: a whole animated world could be a few hundred bytes of maths. Online shader communities later made it a shared art form. The shadows, soft occlusion and fog here are each a few more lines of the same idea.',
    ] },
  ],
});

class RaymarchRoom extends Room {
  constructor(app, meta) { super(app, meta); this.kind = 'scene'; }
  get camera() { return this.cam; }

  async load() {
    const hops = Array.from({ length: MAX_HOPS }, () => new THREE.Vector4());
    this.u = {
      uRes: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector3() }, uTarget: { value: new THREE.Vector3(0, 0.4, 0) },
      uTime: { value: 0 }, uK: { value: 0.45 }, uMorph: { value: 0 }, uRepeat: { value: 0 }, uSteps: { value: 128 }, uMode: { value: 0 },
      uProbe: { value: 0 }, uHops: { value: hops }, uHopCount: { value: 0 }, uProbeO: { value: new THREE.Vector3() }, uProbeEnd: { value: new THREE.Vector3() },
    };
    this.pass = shaderPass(FRAG, this.u);
    this.copy = shaderPass(COPY, { tSrc: { value: null } });
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.cam = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
    this.scale = this.app.lowQuality ? 0.25 : Math.min(1, 1.25 / (window.devicePixelRatio || 1));
    this.probeHome = new THREE.Vector3(-4.4, 0.9, 0.6);
    this.probe = { o: this.probeHome.clone(), dir: new THREE.Vector3() };
  }

  enter(scope) {
    const u = this.u;
    Object.assign(this.view = {}, { theta: 0.6, phi: 1.2, dist: 6.5, thetaT: 0.6, phiT: 1.2, distT: 6.5 });
    u.uK.value = 0.45; u.uMorph.value = 0; u.uRepeat.value = 0; u.uSteps.value = 128; u.uMode.value = 0;
    this.probeOn = false; this.hopsShown = 0; this.hopsLimit = MAX_HOPS;
    this.probe.o.copy(this.probeHome); this.probe.dir.set(0.2, 0.8, 0).sub(this.probeHome).normalize();
    this.touched = false;

    const tray = this.app.chrome.tray(scope, 'Formula');
    const k = tray.slider('Melt together', { min: 0, max: 1.2, step: 0.01, value: u.uK.value }, (v) => { this.pause(); u.uK.value = v; });
    const morph = tray.slider('Sphere → box', { min: 0, max: 1, step: 0.01, value: 0 }, (v) => { this.pause(); u.uMorph.value = v; });
    tray.slider('Hops allowed', { min: 4, max: 256, step: 1, value: 128, format: (v) => v.toFixed(0) }, (v) => {
      this.pause(); u.uSteps.value = v;
      if (v <= 10) this.app.secret('fewsteps', 'Out of steps', 'Grazing rays need many tiny hops. Starve them and the world dissolves.');
    });
    this.viewSeg = tray.segmented('See', [{ value: 0, label: 'Lit' }, { value: 1, label: 'Hops' }, { value: 2, label: 'Normals' }, { value: 3, label: 'Distances' }], 0, (v) => { this.pause(); u.uMode.value = v; });
    this.probeBtn = tray.button('Show one ray', (on) => { this.pause(); this.setProbe(on); }, { toggle: true });
    this.repeatBtn = tray.button('Repeat space', (on) => { this.pause(); this.setRepeat(on); }, { toggle: true });
    tray.note('Drag to look around. Click the scene to aim the ray.');
    this.readout = tray.readout();
    const mode = (v) => { u.uMode.value = v; this.viewSeg.set(v); };
    scope.add(() => { this.kTween?.cancel(); });

    this.tour = this.startTour(scope, [
      { caption: 'No triangles here. This whole world is a single formula.', duration: 7,
        enter: () => { mode(0); this.setProbe(false); } },
      { caption: 'Ask it, from any point: how far to the nearest surface? That distance is a safe bubble.', duration: 8,
        enter: () => { mode(0); this.setProbe(true, 1); this.look(0.08, 1.3, 7.5); } },
      { caption: 'Hop across the bubble, ask again. Hop, ask, hop… until you touch something.', duration: 9,
        enter: () => { mode(0); this.setProbe(true); } },
      { caption: 'Every pixel does this. Brighter here means more hops: edges are expensive.', duration: 8,
        enter: () => { mode(1); this.setProbe(true); } },
      { caption: 'The formula itself, painted on a slice of space. Each ring is a step further away.', duration: 8,
        enter: () => { mode(3); this.setProbe(false); this.look(0.7, 0.55, 8); } },
      { caption: 'Change one number and the shapes melt together like liquid.', duration: 8,
        enter: () => {
          mode(0); this.look(0.6, 1.2, 6.5);
          this.kTween?.cancel();
          this.kTween = scope.tween(6, (t) => { u.uK.value = 0.45 + Math.sin(t * Math.PI * 2) * 0.4; k.set(u.uK.value); });
        },
        exit: () => { this.kTween?.cancel(); u.uK.value = 0.45; k.set(0.45); } },
      { caption: 'Add one line, and the world repeats forever.', duration: 8,
        enter: () => { mode(0); this.setRepeat(true); this.look(0.9, 1.35, 9); },
        exit: () => this.setRepeat(false) },
      { caption: 'Your turn: melt, morph, starve the rays, or click to aim the probe.',
        enter: () => { mode(0); morph.set(u.uMorph.value); } },
    ]);
  }

  pause() { this.tour?.pause(); }
  look(theta, phi, dist) { Object.assign(this.view, { thetaT: theta, phiT: phi, distT: dist }); }

  setProbe(on, limit = MAX_HOPS) {
    if (on && !this.probeOn) this.hopsShown = 0;   // start the walk again
    this.probeOn = on; this.probeBtn?.set(on);
    this.hopsLimit = limit;
  }

  setRepeat(on) {
    this.u.uRepeat.value = on ? 1 : 0; this.repeatBtn?.set(on);
    if (on) this.app.secret('infinity', 'Infinity for free', 'mod() folds space, so one column becomes infinitely many.');
  }

  /** Trace the probe ray with the JS copy of the formula. */
  traceProbe() {
    const { o, dir } = this.probe, u = this.u;
    let t = 0, n = 0;
    const p = new THREE.Vector3();
    for (; n < MAX_HOPS; n++) {
      p.copy(o).addScaledVector(dir, t);
      const d = mapJS(p.x, p.y, p.z, u);
      u.uHops.value[n].set(p.x, p.y, p.z, Math.max(0, d));
      if (d < 0.004 || t > 30) { n++; break; }
      t += d;
    }
    u.uProbeO.value.copy(o);
    u.uProbeEnd.value.copy(o).addScaledVector(dir, t);
    return { count: n, hit: t <= 30 };
  }

  /** Aim the probe at whatever is under the pointer. */
  aim(nx, ny) {
    const u = this.u, ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.cam);
    const ro = ray.ray.origin, rd = ray.ray.direction;
    let t = 0;
    for (let i = 0; i < 128 && t < 40; i++) {
      const d = mapJS(ro.x + rd.x * t, ro.y + rd.y * t, ro.z + rd.z * t, u);
      if (d < 0.002) break;
      t += d;
    }
    if (t >= 40) return;
    const target = ro.clone().addScaledVector(rd, t);
    // start the probe from a point off to the side so its hops are seen side-on
    const side = new THREE.Vector3().subVectors(target, this.cam.position).cross(new THREE.Vector3(0, 1, 0)).normalize();
    this.probe.o.copy(target).addScaledVector(side, -4.5).add(new THREE.Vector3(0, 1.2, 0));
    this.probe.dir.subVectors(target, this.probe.o).normalize();
    this.probeOn = false; this.setProbe(true);
    this.app.audio.blipUp(0);
  }

  pointer(e) {
    const v = this.view;
    if (e.type === 'down') this._drag = { x: e.x, y: e.y, moved: false };
    else if (e.type === 'move' && this._drag && e.buttons) {
      const dx = e.x - this._drag.x, dy = e.y - this._drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this._drag.moved = true;
      if (this._drag.moved) {
        v.thetaT -= (e.x - (this._drag.lx ?? this._drag.x)) * 0.006;
        v.phiT = clamp(v.phiT - (e.y - (this._drag.ly ?? this._drag.y)) * 0.006, 0.25, 1.5);
        this._drag.lx = e.x; this._drag.ly = e.y;
        this.touched = true; this.pause();
      }
    } else if (e.type === 'up') {
      if (this._drag && !this._drag.moved) { this.pause(); this.aim(e.nx, e.ny); }
      this._drag = null;
    } else if (e.type === 'wheel') { v.distT = clamp(v.distT * Math.exp(e.deltaY * 0.001), 3, 16); this.pause(); }
  }

  update(dt, t) {
    const u = this.u, v = this.view;
    u.uTime.value = t;
    if (!this.touched && !this.probeOn) v.thetaT += 0.06 * dt;   // a slow turntable until the visitor takes over
    v.theta = damp(v.theta, v.thetaT, 4, dt); v.phi = damp(v.phi, v.phiT, 4, dt); v.dist = damp(v.dist, v.distT, 4, dt);
    this.cam.position.set(Math.sin(v.theta) * Math.sin(v.phi), Math.cos(v.phi), Math.cos(v.theta) * Math.sin(v.phi)).multiplyScalar(v.dist).add(u.uTarget.value);
    this.cam.lookAt(u.uTarget.value);
    u.uCam.value.copy(this.cam.position);

    // grow the hops one by one, so the walk along the ray can be followed
    u.uProbe.value = damp(u.uProbe.value, this.probeOn ? 1 : 0, 6, dt);
    if (this.probeOn) {
      const { count, hit } = this.traceProbe();
      const prev = Math.floor(this.hopsShown);
      this.hopsShown = Math.min(this.hopsShown + dt * 2.2, count, this.hopsLimit);
      if (Math.floor(this.hopsShown) > prev) this.app.audio.tick(prev, 0.035);
      const shown = Math.max(1, Math.ceil(this.hopsShown));
      u.uHopCount.value = shown;
      const last = u.uHops.value[shown - 1];
      u.uProbeEnd.value.set(last.x, last.y, last.z);
      if (this.readout) this.readout.textContent = `${shown} of ${count} hops · ${shown < count ? 'still walking' : hit ? 'landed on a surface' : 'flew off into the sky'}`;
    } else if (this.readout) this.readout.textContent = '';
  }

  render(renderer, target) {
    this.scale = this.app.adapt(this, this.scale, 0.3);
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const w = Math.max(32, Math.floor(W * this.scale)), h = Math.max(24, Math.floor(H * this.scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    this.u.uRes.value.set(w, h);
    this.cam.aspect = W / H; this.cam.updateProjectionMatrix();
    this.pass.render(renderer, this.rt);
    this.copy.material.uniforms.tSrc.value = this.rt.texture;
    this.copy.render(renderer, target);
  }
}
