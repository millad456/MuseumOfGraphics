import * as THREE from 'three';
import { Orbit } from '../gfx/lab.js';

// ROOM 14 — Worlds from formulas. No triangles at all: every pixel marches a
// ray through a signed distance field, a function that returns how far the
// nearest surface is. The whole scene is the function map() below.

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform vec3 uCam, uTarget; uniform float uTime, uK, uMorph, uRepeat, uSteps; uniform int uMode;

float sdSphere(vec3 p, float r){ return length(p) - r; }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

vec2 map(vec3 p){
  // the floor
  float d = p.y + 1.0; float m = 0.0;
  // the sculpture: a sphere melting into a box, ringed by a torus and orbiting drops
  vec3 q = p - vec3(0.0, 0.6, 0.0);
  float body = mix(sdSphere(q, 1.0), sdBox(q, vec3(0.75)) - 0.08, uMorph);
  float ring = sdTorus(q, vec2(1.55, 0.12));
  float s = smin(body, ring, uK);
  for (int i = 0; i < 4; i++) {
    float a = uTime * 0.7 + float(i) * 1.5708;
    vec3 c = vec3(cos(a) * 1.9, 0.4 * sin(uTime + float(i)), sin(a) * 1.9);
    s = smin(s, sdSphere(q - c, 0.32), uK);
  }
  if (s < d) { d = s; m = 1.0; }
  // optional infinite colonnade, by folding space
  if (uRepeat > 0.5) {
    vec3 r = p; r.xz = mod(r.xz + 3.0, 6.0) - 3.0;
    float col = sdBox(r - vec3(0.0, 0.5, 0.0), vec3(0.28, 1.6, 0.28));
    col = max(col, -sdSphere(p, 4.0));
    if (col < d) { d = col; m = 2.0; }
  }
  return vec2(d, m);
}

vec3 normal(vec3 p){ vec2 e = vec2(0.0015, 0.0); return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x)); }
float softShadow(vec3 ro, vec3 rd){ float r = 1.0, t = 0.03; for (int i = 0; i < 48; i++){ float h = map(ro + rd * t).x; r = min(r, 10.0 * h / t); t += clamp(h, 0.02, 0.4); if (h < 0.001 || t > 12.0) break; } return clamp(r, 0.0, 1.0); }
float ao(vec3 p, vec3 n){ float o = 0.0, s = 1.0; for (int i = 1; i <= 5; i++){ float h = 0.04 * float(i); o += (h - map(p + n * h).x) * s; s *= 0.7; } return clamp(1.0 - 2.5 * o, 0.0, 1.0); }

vec3 sky(vec3 rd){ return mix(vec3(0.62, 0.42, 0.40), vec3(0.05, 0.07, 0.17), smoothstep(-0.05, 0.5, rd.y)); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }

void main(){
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ww = normalize(uTarget - uCam), uu = normalize(cross(ww, vec3(0, 1, 0))), vv = cross(uu, ww);
  vec3 rd = normalize(p.x * uu + p.y * vv + 1.8 * ww), ro = uCam;
  float t = 0.0; float steps = 0.0; vec2 h = vec2(1.0, -1.0);
  for (int i = 0; i < 256; i++) {
    if (float(i) >= uSteps) break;
    h = map(ro + rd * t);
    steps += 1.0;
    if (abs(h.x) < 0.0008 * t || t > 40.0) break;
    t += h.x;
  }
  vec3 col;
  bool hit = t < 40.0 && abs(h.x) < 0.02 * t + 0.01;
  if (uMode == 1) { float k = steps / uSteps; col = mix(vec3(0.05, 0.02, 0.2), vec3(1.0, 0.8, 0.2), sqrt(k)); if (k > 0.98) col = vec3(1.0, 0.1, 0.2); }
  else if (!hit) col = sky(rd);
  else {
    vec3 pos = ro + rd * t, n = normal(pos);
    if (uMode == 2) col = n * 0.5 + 0.5;
    else {
      vec3 L = normalize(vec3(-0.5, 0.6, -0.4));
      vec3 alb = h.y < 0.5 ? vec3(0.32) : h.y < 1.5 ? vec3(0.95, 0.45, 0.3) : vec3(0.75, 0.78, 0.85);
      if (h.y < 0.5) { vec2 g = abs(fract(pos.xz) - 0.5); alb *= 0.75 + 0.25 * smoothstep(0.46, 0.5, max(g.x, g.y)); }
      float dif = max(dot(n, L), 0.0) * softShadow(pos + n * 0.01, L);
      float occ = ao(pos, n);
      float spe = pow(max(dot(reflect(rd, n), L), 0.0), 40.0) * dif;
      col = alb * (vec3(2.2, 1.7, 1.35) * dif + sky(n) * 0.45 * occ) + spe * 2.0;
      if (uMode == 3) {
        // contour lines of the distance field on the floor
        float dd = map(vec3(pos.x, 0.6, pos.z)).x; if (h.y < 0.5) dd = 1e3;
        if (h.y < 0.5) { float dsc = map(vec3(pos.x, 0.6, pos.z) ).x; }
      }
    }
    col = mix(col, sky(rd), 1.0 - exp(-0.0025 * t * t));
  }
  if (uMode == 3) {
    // slice view: the distance field drawn on the plane y = 0.6 seen from above the camera ray
    float tp = (0.6 - ro.y) / rd.y;
    if (tp > 0.0 && (tp < t || !hit)) {
      vec3 sp = ro + rd * tp; float dd = map(sp).x;
      vec3 band = dd > 0.0 ? vec3(0.25, 0.6, 1.0) : vec3(1.0, 0.4, 0.2);
      float iso = smoothstep(0.06, 0.0, abs(fract(dd * 4.0) - 0.5) - 0.44);
      vec3 c2 = band * (0.35 + 0.25 * cos(dd * 25.0)) + iso * 0.6;
      c2 = mix(c2, vec3(1.0), smoothstep(0.03, 0.0, abs(dd)));
      col = mix(col, c2, 0.85);
    }
  }
  col = uMode == 0 || uMode == 3 ? aces(col) : col;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export default {
  id: 'raymarch', title: 'Worlds from Formulas', year: '1989 · 2000s demoscene', tagline: 'No triangles. Every pixel asks one function, "how far is the nearest surface?", and steps forward by exactly that much.',
  mode: 'world', ui: 'glass20', music: 'lush',
  secrets: [
    { id: 'infinity', title: 'Infinity for free', hint: 'Fold space so the world repeats.', desc: 'One mod() call turns one column into infinitely many.' },
    { id: 'fewsteps', title: 'Out of steps', hint: 'Starve the ray of steps.', desc: 'Grazing rays need many small steps; give them too few and the world dissolves.' },
  ],
  notes: [
    {
      title: 'Signed distance', meta: 'A world as one function',
      body: `<p>Instead of a list of triangles, the whole scene is one function that answers: <i>from this point, how far is the nearest surface?</i> Positive outside, negative inside, zero exactly on the surface. A sphere is one line:</p><div class="eq">sphere(p) = length(p) − radius</div><p>Turn on <b>Distance field</b> view to see the function's values painted across a slice of space, with contour lines every quarter unit.</p>`,
    },
    {
      title: 'Sphere tracing', meta: '1989–1996',
      body: `<p>Because the function tells you the distance to the <i>nearest</i> surface in any direction, a ray can safely jump forward by exactly that much without passing through anything. Repeat until the distance is tiny. That is sphere tracing.</p><p>Drag in the small window to aim a ray through a 2D slice: each circle is one step. Near edges the steps get tiny, which is why the <b>Steps</b> view glows around silhouettes.</p>`,
    },
    {
      title: 'Blending shapes', meta: 'Smooth minimum',
      body: `<p>Combining two shapes is <code>min(a, b)</code>: whichever is nearer. Replace min with a <b>smooth minimum</b> and the shapes melt together like liquid metal. One parameter, k, sets how far the blending reaches.</p><div class="eq">h = clamp(0.5 + 0.5·(b − a)/k, 0, 1)
smin = mix(b, a, h) − k·h·(1 − h)</div>`,
    },
    {
      title: 'The demoscene', meta: 'Art in kilobytes',
      body: `<p>Demosceners, programmers who make real-time art under extreme size limits, adopted this approach in the 2000s: a whole animated world could be a few hundred bytes of maths. Online shader communities later made it a shared art form. Shadows, ambient occlusion and fog here are each a few more lines of the same idea.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    this.u = { uRes: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector3() }, uTarget: { value: new THREE.Vector3(0, 0.4, 0) }, uTime: { value: 0 }, uK: { value: 0.45 }, uMorph: { value: 0 }, uRepeat: { value: 0 }, uSteps: { value: 128 }, uMode: { value: 0 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FRAG });
    this.scene = new THREE.Scene(); this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.cam = new THREE.PerspectiveCamera();
    this.orbit = new Orbit(this.cam, { dist: 6.5, theta: 0.6, phi: 1.2, target: new THREE.Vector3(0, 0.4, 0), minDist: 3, maxDist: 16, maxPhi: 1.5 });
    this.orbit.auto = 0.08;
    this.scale = app.lowQuality ? 0.25 : Math.min(1, 1.25 / (window.devicePixelRatio || 1));
    this.rt = new THREE.WebGLRenderTarget(4, 4);
    this.blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.rt.texture }));
    this.bs = new THREE.Scene(); this.bs.add(this.blit);
  },

  setAspect() {},

  enter(app) { this.buildControls(); this.buildTracer(); app.ui.showChrome(true); },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Distance field');
    this.obj = [ui.objective('Blend the shapes'), ui.objective('Look at the distance field itself')];
    ui.slider('Smooth blend k', { min: 0, max: 1.2, step: 0.01, value: this.u.uK.value }, (v) => { this.u.uK.value = v; this.obj[0].done(); this.app.ready(true); });
    ui.slider('Sphere → box', { min: 0, max: 1, step: 0.01, value: 0 }, (v) => (this.u.uMorph.value = v));
    ui.slider('Max steps per ray', { min: 4, max: 256, step: 1, value: 128, fmt: (v) => v.toFixed(0) }, (v) => { this.u.uSteps.value = v; if (v <= 10) this.app.secret('fewsteps', 'Out of steps', 'Grazing rays need many tiny steps. Starve them and the world dissolves.'); });
    ui.segmented('View', [{ v: 0, l: 'Lit' }, { v: 1, l: 'Steps' }, { v: 2, l: 'Normals' }, { v: 3, l: 'Distance field' }], 0, (v) => { this.u.uMode.value = v; if (v === 3) this.obj[1].done(); });
    ui.toggle('Repeat space', false, (v) => { this.u.uRepeat.value = v ? 1 : 0; if (v) this.app.secret('infinity', 'Infinity for free', 'mod() folds space, so one column becomes infinitely many.'); }, ui.row());
  },

  buildTracer() {
    const bd = this.app.ui.extraWindow('Sphere tracing, in 2D', { left: 14, bottom: 70 }, 330);
    const cv = (this.cv = document.createElement('canvas')); cv.width = 600; cv.height = 380;
    cv.style.cssText = 'width:100%;height:auto;display:block;border-radius:12px;touch-action:none;cursor:crosshair';
    bd.appendChild(cv);
    this.trRead = document.createElement('div'); this.trRead.className = 'readout'; bd.appendChild(this.trRead);
    this.aim = [520, 120];
    const set = (e) => { const b = cv.getBoundingClientRect(); this.aim = [(e.clientX - b.left) / b.width * cv.width, (e.clientY - b.top) / b.height * cv.height]; };
    cv.addEventListener('pointerdown', (e) => { set(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (e.buttons) set(e); });
  },

  sdf2(x, y, t) {
    const c1 = Math.hypot(x - 330, y - 190) - 70;
    const bx = Math.abs(x - 470) - 40, by = Math.abs(y - (250 + Math.sin(t) * 40)) - 40;
    const box = Math.hypot(Math.max(bx, 0), Math.max(by, 0)) + Math.min(Math.max(bx, by), 0);
    const c2 = Math.hypot(x - 200, y - 90 - Math.cos(t * 0.8) * 20) - 34;
    const k = this.u.uK.value * 60, smin = (a, b) => { if (k <= 0) return Math.min(a, b); const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b * (1 - h) + a * h - k * h * (1 - h); };
    return smin(smin(c1, box), c2);
  },

  drawTracer(t) {
    const cv = this.cv; if (!cv) return; const x = cv.getContext('2d');
    x.fillStyle = '#07080f'; x.fillRect(0, 0, cv.width, cv.height);
    // shade the field
    const s = 10;
    for (let j = 0; j < cv.height; j += s) for (let i = 0; i < cv.width; i += s) {
      const d = this.sdf2(i + s / 2, j + s / 2, t);
      if (d < 0) x.fillStyle = 'rgba(255,120,80,0.75)';
      else { const b = 0.5 + 0.5 * Math.cos(d * 0.25); x.fillStyle = `rgba(80,140,255,${0.05 + b * 0.12})`; }
      x.fillRect(i, j, s, s);
    }
    const o = [24, 330];
    let dx = this.aim[0] - o[0], dy = this.aim[1] - o[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    let tt = 0, n = 0, hit = false;
    x.lineWidth = 1.5;
    for (; n < 64; n++) {
      const px = o[0] + dx * tt, py = o[1] + dy * tt, d = this.sdf2(px, py, t);
      x.strokeStyle = 'rgba(255,231,184,0.55)'; x.beginPath(); x.arc(px, py, Math.max(0, d), 0, 7); x.stroke();
      x.fillStyle = '#ffe7b8'; x.beginPath(); x.arc(px, py, 3, 0, 7); x.fill();
      if (d < 0.5) { hit = true; break; }
      tt += d; if (tt > 900) break;
    }
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(o[0], o[1]); x.lineTo(o[0] + dx * tt, o[1] + dy * tt); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(o[0], o[1], 6, 0, 7); x.fill();
    this.trRead.textContent = `${n + 1} steps · ${hit ? 'hit a surface' : 'escaped'}\neach circle = distance to the nearest surface`;
  },

  pointer(type, p, e) { this.orbit.handle(type, p, e); },

  update(dt, t) {
    this.orbit.update(dt);
    this.u.uTime.value = t;
    this.u.uCam.value.copy(this.cam.position);
    this.drawTracer(t);
  },

  render(renderer, target) {
    this.scale = this.app.adapt(this, this.scale, 0.3);
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const w = Math.max(32, Math.floor(W * this.scale)), h = Math.max(24, Math.floor(H * this.scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    this.u.uRes.value.set(w, h);
    renderer.setRenderTarget(this.rt); renderer.render(this.scene, this.qc);
    renderer.setRenderTarget(target); renderer.render(this.bs, this.qc);
  },
};
