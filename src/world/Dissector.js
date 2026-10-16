import * as THREE from 'three';
import { stage } from './stages.js';
import { shaderPass, textPlane } from '../gfx/three-utils.js';

// Pulls one finished frame of the gallery apart into the pictures it is
// made from, and hangs them in space one behind the other.

const PASSES = [
  { name: 'Triangles', render: (w, out) => w.renderStage({ ...stage('wire'), res: 0.4 }, out) },
  { name: 'Depth', view: 1 },
  { name: 'Normals', view: 2 },
  { name: 'Surface colour', view: 3 },
  { name: 'Shadows', view: 5 },
  { name: 'Direct light', view: 6 },
  { name: 'Highlights and reflections', view: 7 },
  { name: 'Glow (bloom)', bloom: true },
  { name: 'Final frame', final: true },
];

const BLOOM_VIEW = /* glsl */`
uniform sampler2D tSrc; varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){ gl_FragColor = vec4(aces(texture2D(tSrc, vUv).rgb * 2.0), 1.0); }`;

export class Dissector {
  constructor(world) {
    this.world = world;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0d11);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.targets = PASSES.map(() => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
    this.bloomView = shaderPass(BLOOM_VIEW, { tSrc: { value: null } });
    this.layers = PASSES.map((p, i) => {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.targets[i].texture, side: THREE.DoubleSide, toneMapped: false }));
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xe8b04a }));
      plane.add(frame);
      const label = textPlane(`${i + 1}  ${p.name}`, { height: 0.06, color: '#ece6da', font: '700 56px "Atkinson Hyperlegible", sans-serif' });
      label.position.set(-0.5, 0.56, 0);
      label.userData.baseX = label.scale.x;
      plane.add(label);
      this.scene.add(plane);
      return plane;
    });
    this.amount = 0;
    this.frame = 0;
  }

  resize(aspect) {
    this.aspect = aspect;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    this.layers.forEach((l) => {
      l.scale.set(aspect, 1, 1);
      const label = l.children[1];
      label.scale.x = label.userData.baseX / aspect;   // keep the text from stretching
    });
  }

  _renderPasses(renderer) {
    const w = this.world, W = Math.floor(w.W * 0.4), H = Math.floor(w.H * 0.4);
    this.targets.forEach((t) => { if (t.width !== W || t.height !== H) t.setSize(W, H); });
    const base = { ...stage('hdr'), res: 0.4, msaa: false };
    PASSES.forEach((p, i) => {
      const out = this.targets[i];
      if (p.render) { p.render(w, out); return; }
      if (p.view) {
        w.forceView = p.view;
        w.renderStage({ ...base, hdr: false }, out);
        w.forceView = 0;
        return;
      }
      w.forceView = 0;
      w.renderStage(base, out);
      if (p.bloom) { this.bloomView.material.uniforms.tSrc.value = w.bloomTexture; this.bloomView.render(renderer, out); }
    });
    w.forceView = undefined;
  }

  /** Render the exploded stack. `amount` 0..1 spreads the layers apart. */
  render(renderer, target, time) {
    if (this.aspect !== this.world.camera.aspect) this.resize(this.world.camera.aspect);
    // the passes are re-rendered every other frame to keep this affordable
    if ((this.frame++ & 1) === 0) this._renderPasses(renderer);
    const k = this.amount, n = this.layers.length;
    this.layers.forEach((l, i) => {
      const d = i - (n - 1);
      l.position.set(d * 0.08 * k, 0, d * 0.75 * k);
    });
    const a = -0.95 * k + Math.sin(time * 0.2) * 0.12 * k;
    const r = 1.35 + k * 6.5;
    this.camera.position.set(Math.sin(a) * r + k * 1.2, 0.3 + k * 1.6, Math.cos(a) * r);
    this.camera.lookAt(-k * 0.4, 0, -k * 3.4);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }
}
