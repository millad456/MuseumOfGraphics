import * as THREE from 'three';

// Shared furniture for the 3D rooms: a void with an infinite grid, a small
// orbit controller, the visitor's sprite as voxels, and text labels.

export const GRID_VERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const GRID_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uFade, uOpacity;
varying vec3 vW;
float line(float v, float w){ float d = fwidth(v); return 1.0 - smoothstep(0.0, d * w, abs(fract(v - 0.5) - 0.5)); }
void main(){
  float a = max(line(vW.x, 1.2), line(vW.z, 1.2)) * 0.5 + max(line(vW.x * 0.2, 1.5), line(vW.z * 0.2, 1.5)) * 0.6;
  float r = length(vW.xz);
  a *= exp(-r * uFade) * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

export function makeGrid(color = 0x3b5bff, fade = 0.06, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: fade }, uOpacity: { value: opacity } },
    vertexShader: GRID_VERT, fragmentShader: GRID_FRAG, transparent: true, depthWrite: false, extensions: { derivatives: true },
  }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function makeStars(n = 1500, r = 80, color = 0x8fa6ff) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(r * (0.6 + Math.random() * 0.4));
    v.y = Math.abs(v.y) * 0.8 + 2; pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false }));
}

export class Orbit {
  constructor(camera, { target = new THREE.Vector3(), dist = 8, theta = 0.6, phi = 1.1, minDist = 2, maxDist = 40, minPhi = 0.05, maxPhi = Math.PI - 0.05 } = {}) {
    Object.assign(this, { camera, target, dist, theta, phi, minDist, maxDist, minPhi, maxPhi });
    this.goal = { dist, theta, phi };
    this.enabled = true; this.auto = 0;
    this.drag = null;
  }
  handle(type, p, e) {
    if (!this.enabled) return false;
    if (type === 'down') { this.drag = { x: p.x, y: p.y, theta: this.goal.theta, phi: this.goal.phi }; return true; }
    if (type === 'move' && this.drag && e.buttons) {
      this.goal.theta = this.drag.theta - (p.x - this.drag.x) * 0.006;
      this.goal.phi = Math.min(this.maxPhi, Math.max(this.minPhi, this.drag.phi - (p.y - this.drag.y) * 0.006));
      return true;
    }
    if (type === 'up') { this.drag = null; }
    if (type === 'wheel') { this.goal.dist = Math.min(this.maxDist, Math.max(this.minDist, this.goal.dist * Math.pow(1.0015, e.deltaY))); return true; }
    return false;
  }
  update(dt) {
    if (this.auto && !this.drag) this.goal.theta += this.auto * dt;
    const k = 1 - Math.exp(-dt * 6);
    this.theta += (this.goal.theta - this.theta) * k;
    this.phi += (this.goal.phi - this.phi) * k;
    this.dist += (this.goal.dist - this.dist) * k;
    const c = this.camera;
    c.position.set(
      this.target.x + this.dist * Math.sin(this.phi) * Math.sin(this.theta),
      this.target.y + this.dist * Math.cos(this.phi),
      this.target.z + this.dist * Math.sin(this.phi) * Math.cos(this.theta),
    );
    c.lookAt(this.target);
  }
  get moving() { return Math.abs(this.goal.theta - this.theta) + Math.abs(this.goal.phi - this.phi) + Math.abs(this.goal.dist - this.dist) > 1e-4; }
}

// The visitor's 16x16 sprite as a voxel model, one cube per lit pixel.
export function voxelGeometry(sprite, size = 0.25, depth = 2) {
  const geos = [];
  const box = new THREE.BoxGeometry(size, size, size);
  const colors = [];
  for (let i = 0; i < 256; i++) {
    const v = sprite[i]; if (!v) continue;
    const x = (i & 15) - 7.5, y = 7.5 - (i >> 4);
    for (let d = 0; d < depth; d++) {
      const g = box.clone(); g.translate(x * size, y * size, (d - (depth - 1) / 2) * size);
      const n = g.attributes.position.count; const c = new Float32Array(n).fill(v);
      g.setAttribute('pal', new THREE.BufferAttribute(c, 1));
      geos.push(g);
    }
  }
  return mergeGeos(geos);
}

export function mergeGeos(geos) {
  let n = 0, ni = 0;
  for (const g of geos) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  const attrs = Object.keys(geos[0].attributes);
  for (const a of attrs) out.setAttribute(a, new THREE.BufferAttribute(new Float32Array(n * geos[0].attributes[a].itemSize), geos[0].attributes[a].itemSize));
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of geos) {
    for (const a of attrs) out.attributes[a].array.set(g.attributes[a].array, vo * g.attributes[a].itemSize);
    const gi = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export function textSprite(text, { size = 0.4, color = '#ffffff', font = '500 44px "JetBrains Mono", monospace', bg = null, pad = 14 } = {}) {
  const c = document.createElement('canvas'); const x = c.getContext('2d');
  x.font = font; const w = Math.ceil(x.measureText(text).width) + pad * 2; c.width = w; c.height = 64;
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, 64); }
  x.font = font; x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, pad, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * w / 64, size), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.userData.setText = (s) => { x.clearRect(0, 0, c.width, 64); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, 64); } x.fillStyle = color; x.fillText(s, pad, 34); t.needsUpdate = true; };
  return m;
}

