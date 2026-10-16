import * as THREE from 'three';

export const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** A full-screen pass: one quad, its own scene and camera. */
export class FullscreenPass {
  constructor(material) {
    this.material = material;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  render(renderer, target = null, material = null) {
    if (material) this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
    if (material) this.mesh.material = this.material;
  }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

export function shaderMaterial(fragmentShader, uniforms = {}, extra = {}) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader, depthTest: false, depthWrite: false, ...extra });
}

export function shaderPass(fragmentShader, uniforms = {}, extra = {}) {
  return new FullscreenPass(shaderMaterial(fragmentShader, uniforms, extra));
}

/** Dispose every geometry, material and texture under an object. */
export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose?.();
    }
  });
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(canvas, { srgb = true, nearest = false, mipmaps = false, anisotropy = 4, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = mipmaps;
  t.minFilter = nearest ? THREE.NearestFilter : mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let glowCache = null;
/** Soft radial dot, shared by every sprite that needs a glow. */
export function glowTexture() {
  if (glowCache) return glowCache;
  const c = makeCanvas(64, 64), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowCache = new THREE.CanvasTexture(c);
  return glowCache;
}

/** Copy a render target's pixels into a 2D canvas (flipping Y). Used for small thumbnails. */
export function readTargetToCanvas(renderer, target, canvas, buffer) {
  const w = target.width, h = target.height;
  const px = buffer && buffer.length === w * h * 4 ? buffer : new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const x = canvas.getContext('2d');
  const img = x.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  x.putImageData(img, 0, 0);
  return px;
}

/** A flat, left-aligned text label `height` units tall. */
export function textPlane(text, { height = 0.1, color = '#ffffff', font = '700 56px sans-serif' } = {}) {
  const probe = makeCanvas(8, 8).getContext('2d');
  probe.font = font;
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] || '56');
  const c = makeCanvas(Math.ceil(probe.measureText(text).width + px * 0.4), Math.ceil(px * 1.4));
  const x = c.getContext('2d');
  x.font = font; x.fillStyle = color; x.textBaseline = 'middle';
  x.fillText(text, px * 0.2, c.height / 2);
  const w = (c.width / c.height) * height;
  const g = new THREE.PlaneGeometry(w, height).translate(w / 2, 0, 0);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: canvasTexture(c, { mipmaps: true }), transparent: true, depthWrite: false, toneMapped: false }));
  m.renderOrder = 3;
  return m;
}
