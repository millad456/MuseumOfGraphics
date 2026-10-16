import * as THREE from 'three';
import { WorldRoom } from '../world/WorldRoom.js';
import { Dissector } from '../world/Dissector.js';
import { shaderPass } from '../gfx/three-utils.js';
import { h } from '../core/dom.js';
import { damp } from '../core/math.js';

// ROOM 13 · Shadow and glow.
// Programmable graphics chips made multi-pass rendering normal: draw the
// room from the light to get shadows, keep light brighter than white and
// let it bloom, then pull a finished frame apart into its hidden pictures.

const DEPTH_VIEW = /* glsl */`
uniform sampler2D tDepth; uniform float uNear, uFar; varying vec2 vUv;
void main(){
  float d = texture2D(tDepth, vUv).r;
  float z = (2.0 * uNear * uFar) / (uFar + uNear - (2.0 * d - 1.0) * (uFar - uNear));
  float v = 1.0 - clamp((z - uNear) / (uFar - uNear) * 1.25, 0.0, 1.0);
  gl_FragColor = vec4(vec3(v), 1.0);
}`;

export default (app) => new GlowRoom(app, {
  id: 'glow', title: 'Shadow and Glow', years: '2001 – 2013', music: 'pulse',
  secrets: [
    { id: 'explode', title: 'Under the hood', hint: 'Pull the finished frame apart.', desc: 'Nine pictures, one frame.' },
  ],
  notes: [
    { title: 'Shadow maps', body: [
      'To know whether a point is in shadow, first draw the room from the light’s point of view and keep only the distances. Later, for every pixel, ask: is this point farther from the light than what the light could see? Then something is in the way. The idea dates from 1978 and is still the most common shadow technique in games.',
    ] },
    { title: 'Brighter than white', body: [
      'A screen tops out at full white, but real light does not. Keeping values far above 1.0 while rendering (high dynamic range) preserves the difference between a white wall and the light itself. Bloom keeps only the brightest parts, blurs them by shrinking and enlarging the image several times, and adds the glow back. A tone-mapping curve then squeezes everything into what the screen can show, the way film does.',
    ] },
    { title: 'Shaders', body: [
      'From around 2001, graphics chips could run small programs, called shaders, for every corner and every pixel, thousands at a time. Every picture in the exploded frame is the output of one such program.',
    ] },
  ],
});

class GlowRoom extends WorldRoom {
  async load() {
    await super.load();
    this.dissector = new Dissector(this.world);
    this.depthPass = shaderPass(DEPTH_VIEW, { tDepth: { value: null }, uNear: { value: 0.3 }, uFar: { value: 16 } });
    this.insetRT = new THREE.WebGLRenderTarget(192, 192);
    this.insetPixels = new Uint8Array(192 * 192 * 4);
  }

  enter(scope, ctx) {
    const w = this.world;
    this.begin(scope, ctx, 'aa', 'glow');
    this.explode = 0; this.exploded = false; this.showInset = false;
    this.inset = h('figure', { class: 'inset', hidden: true }, h('canvas', { width: 192, height: 192 }), h('figcaption', {}, 'What the light sees (white is near)'));
    scope.mount(this.inset, this.app.chrome.overlay);
    scope.add(() => { w.tonemap.material.uniforms.uExposure.value = 1; w.tonemap.material.uniforms.uBloom.value = 0.8; });
    const tray = this.app.chrome.tray(scope, 'Lab');
    this.explodeBtn = tray.button('Pull the frame apart', (on) => this.setExplode(on), { toggle: true });
    tray.slider('Glow', { min: 0, max: 3, step: 0.01, value: 0.8 }, (v) => (w.tonemap.material.uniforms.uBloom.value = v));
    tray.slider('Exposure', { min: 0.2, max: 4, step: 0.01, value: 1 }, (v) => (w.tonemap.material.uniforms.uExposure.value = v));

    this.tour = this.startTour(scope, [
      { caption: 'Draw the room again from the light’s point of view. Whatever it can’t see is in shadow.', duration: 9,
        enter: () => { this.setExplode(false); this.stage('shadow'); w.shot('glow', 3); this.showInset = true; },
        exit: () => { this.showInset = false; } },
      { caption: 'Let light be brighter than white, then let the brightest parts glow.', duration: 8,
        enter: () => { this.setExplode(false); this.stage('hdr'); } },
      { caption: 'A finished frame is built from many hidden pictures. Here they are, pulled apart.', duration: 11,
        enter: () => { this.stage('hdr'); this.setExplode(true); },
        exit: () => this.setExplode(false) },
      { caption: 'Your turn: pull the frame apart, or play with glow and exposure.',
        enter: () => this.stage('hdr') },
    ]);
  }

  setExplode(on) {
    this.exploded = on;
    this.explodeBtn?.set(on);
    if (on) { this.app.secret('explode', 'Under the hood', 'Nine pictures, one frame.'); this.app.audio.whoosh(1, true, 0.15); }
  }

  update(dt, t) {
    super.update(dt, t);
    this.explode = damp(this.explode, this.exploded ? 1 : 0, 3, dt);
    this.dissector.amount = this.explode;
    this.inset.hidden = !this.showInset;
  }

  render(renderer, target) {
    if (this.explode > 0.01) {
      this.dissector.render(renderer, target, this.world.time);
      return;
    }
    super.render(renderer, target);
    if (this.showInset && (this._f = (this._f || 0) + 1) % 10 === 1) this.drawInset(renderer);
  }

  drawInset(renderer) {
    const w = this.world;
    this.depthPass.material.uniforms.tDepth.value = w.shadowRT.depthTexture;
    this.depthPass.render(renderer, this.insetRT);
    renderer.readRenderTargetPixels(this.insetRT, 0, 0, 192, 192, this.insetPixels);
    renderer.setRenderTarget(null);
    const c = this.inset.querySelector('canvas'), x = c.getContext('2d');
    const img = x.createImageData(192, 192);
    for (let y = 0; y < 192; y++) img.data.set(this.insetPixels.subarray((191 - y) * 768, (192 - y) * 768), y * 768);
    x.putImageData(img, 0, 0);
  }
}
