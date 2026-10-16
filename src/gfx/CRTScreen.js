import * as THREE from 'three';
import { makeCanvas, canvasTexture } from './three-utils.js';

// A curved phosphor screen. Its picture comes from a 2D canvas (or any
// texture) and is shown through barrel distortion, scanlines, an aperture
// grille, halation and a power-on/off squash. Pointer input is mapped back
// through the same curve so clicks land on exactly what the visitor sees.

const VERT = /* glsl */`
varying vec2 vUv;
uniform float uBulge;
void main(){
  vUv = uv;
  vec3 p = position;
  vec2 c = uv * 2.0 - 1.0;
  p.z += uBulge * (1.0 - 0.5 * (c.x * c.x + c.y * c.y));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScreen;
uniform vec2 uRes;
uniform float uTime, uCurv, uScan, uMask, uMono, uPowerX, uPowerY, uNoise, uBright, uGlow;
uniform vec3 uTint;

vec2 curve(vec2 uv){
  uv = uv * 2.0 - 1.0;
  vec2 o = abs(uv.yx) * uCurv;
  uv += uv * o * o;
  return uv * 0.5 + 0.5;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 uv = curve(vUv);
  vec2 sq = vec2(max(uPowerX, 0.002), max(uPowerY, 0.002));
  vec2 c = uv - 0.5;
  vec2 suv = c / sq + 0.5;
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  vec2 edge = smoothstep(0.0, 0.01, uv) * smoothstep(0.0, 0.01, 1.0 - uv);

  vec3 col = texture2D(tScreen, suv).rgb;
  vec3 halo = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472;
    halo += texture2D(tScreen, suv + vec2(cos(a), sin(a)) * 0.005).rgb;
  }
  col += halo / 6.0 * uGlow;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col * uTint, lum * uTint * 1.5, uMono);

  float sl = 0.5 + 0.5 * sin(suv.y * uRes.y * 3.14159);
  col *= mix(1.0, 0.6 + 0.4 * sl, uScan);
  float px = mod(gl_FragCoord.x, 3.0);
  vec3 mask = vec3(px < 1.0 ? 1.0 : 0.75, (px >= 1.0 && px < 2.0) ? 1.0 : 0.75, px >= 2.0 ? 1.0 : 0.75);
  col *= mix(vec3(1.0), mask, uMask);
  col += (hash(uv * 420.0 + uTime) - 0.5) * uNoise * (0.15 + lum);

  // the collapsing picture glows brighter as it squashes
  col *= inside * min(1.0 / mix(1.0, sq.x * sq.y, 0.85), 24.0) * uBright;
  float d = length(c / vec2(max(sq.x, 0.004), max(sq.y, 0.004)));
  col += uTint * exp(-d * 2.2) * 1.6 * step(uPowerY, 0.02) * step(0.0001, 1.0 - uPowerX) * step(0.0001, uPowerX);

  vec2 v = uv * (1.0 - uv.yx);
  col *= pow(clamp(v.x * v.y * 16.0, 0.0, 1.0), 0.25);
  col = col * edge.x * edge.y + vec3(0.006, 0.008, 0.008);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class CRTScreen {
  /** @param {{ width: number, height: number, canvasWidth?: number, canvasHeight?: number, bulge?: number }} opts */
  constructor({ width, height, canvasWidth = 1024, canvasHeight = 768, bulge = 0.04 }) {
    this.width = width; this.height = height;
    this.canvas = makeCanvas(canvasWidth, canvasHeight);
    this.ctx = this.canvas.getContext('2d');
    this.texture = canvasTexture(this.canvas, { anisotropy: 1 });
    this.uniforms = {
      tScreen: { value: this.texture }, uRes: { value: new THREE.Vector2(canvasWidth, canvasHeight) },
      uTime: { value: 0 }, uCurv: { value: 0.2 }, uScan: { value: 0.35 }, uMask: { value: 0.2 }, uMono: { value: 0 },
      uPowerX: { value: 0 }, uPowerY: { value: 0 }, uNoise: { value: 0.03 }, uBright: { value: 1.15 }, uGlow: { value: 0.4 },
      uBulge: { value: bulge }, uTint: { value: new THREE.Color(1, 1, 1) },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 24, 18), this.material);
    this.mesh.userData.surface = this;
    this.avgColor = new THREE.Color(0, 0, 0);
    this._avg = makeCanvas(1, 1).getContext('2d', { willReadFrequently: true });
    this._frame = 0;
    this.powered = false;
  }

  setProfile(p) {
    const u = this.uniforms;
    if (p.tint) u.uTint.value.set(p.tint);
    for (const [k, name] of [['mono', 'uMono'], ['scan', 'uScan'], ['mask', 'uMask'], ['glow', 'uGlow'], ['curv', 'uCurv'], ['noise', 'uNoise'], ['bright', 'uBright']]) {
      if (p[k] !== undefined) u[name].value = p[k];
    }
    if (p.res) u.uRes.value.set(p.res[0], p.res[1]);
  }

  resize(w, h) {
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w; this.canvas.height = h;
    this.texture.dispose();
    this.texture = canvasTexture(this.canvas, { anisotropy: 1 });
    this.uniforms.tScreen.value = this.texture;
  }

  power(x, y = x) { this.uniforms.uPowerX.value = x; this.uniforms.uPowerY.value = y; this.powered = x > 0; }
  useTexture(tex) { this.uniforms.tScreen.value = tex || this.texture; }

  /** Upload the canvas for this frame. */
  commit(time) {
    this.uniforms.uTime.value = time;
    if (this.uniforms.tScreen.value !== this.texture) return;
    this.texture.needsUpdate = true;
    if ((this._frame++ & 15) === 0) {
      this._avg.drawImage(this.canvas, 0, 0, 1, 1);
      const d = this._avg.getImageData(0, 0, 1, 1).data;
      this.avgColor.setRGB(d[0] / 255, d[1] / 255, d[2] / 255);
    }
  }

  /** Map a raycast uv on the screen mesh to canvas pixels, through the same curve the shader uses. */
  uvToCanvas(uv) {
    const k = this.uniforms.uCurv.value;
    let x = uv.x * 2 - 1, y = uv.y * 2 - 1;
    const ox = Math.abs(y) * k, oy = Math.abs(x) * k;
    x += x * ox * ox; y += y * oy * oy;
    const cx = x * 0.5 + 0.5, cy = y * 0.5 + 0.5;
    return { x: cx * this.canvas.width, y: (1 - cy) * this.canvas.height, inside: cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1 };
  }

  dispose() { this.texture.dispose(); this.material.dispose(); this.mesh.geometry.dispose(); }
}
