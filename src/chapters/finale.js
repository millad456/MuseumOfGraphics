import * as THREE from 'three';
import { openShare, drawSprite } from '../core/share.js';
import { PathTracer, TONEMAP_GLSL } from '../gfx/pathtracer.js';

// ROOM 17 — The end of the corridor. The opening image returns, earned.

const DISPLAY = /* glsl */`
uniform sampler2D tSrc; uniform float uT; varying vec2 vUv;
${TONEMAP_GLSL}
void main(){ vec2 uv = (vUv - 0.5) / (1.0 + uT * 0.004) + 0.5; vec3 c = aces(texture2D(tSrc, uv).rgb);
  vec2 v = vUv * (1.0 - vUv.yx); c *= pow(clamp(v.x * v.y * 18.0, 0.0, 1.0), 0.3);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export default {
  id: 'finale', title: 'From One Dot', year: 'Today', tagline: '', titleCard: false,
  mode: 'world', ui: 'museum', music: 'ambient',
  notes: [],

  init(app) {
    this.app = app;
    this.pt = new PathTracer(app.renderer);
    this.pt.scale = app.lowQuality ? 0.15 : Math.min(0.75, 1.1 / (window.devicePixelRatio || 1));
    this.mat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uT: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: DISPLAY });
    this.qs = new THREE.Scene(); this.qs.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.card = document.createElement('section');
    this.card.className = 'finale';
    document.getElementById('ui').insertBefore(this.card, document.getElementById('modal'));
    this.setAspect();
  },

  setAspect() { const r = this.app.renderer.domElement; this.pt.setSize(r.width, r.height); },

  enter(app) {
    app.unlockedAll = true;
    app.ui.hideControls(true);
    app.ui.setNotes([]);
    app.ui.showChrome(true);
    const st = app.state, all = app.allSecrets(), found = all.filter((s) => st.secrets.has(s.id)).length;
    const stats = [];
    if (st.stats.mazeTime !== undefined) stats.push(['Raycast maze', st.stats.mazeTime.toFixed(1) + ' s']);
    if (st.stats.magicErr !== undefined) stats.push(['Best magic constant', (st.stats.magicErr * 100).toFixed(4) + '% error']);
    if (st.stats.runBits !== undefined) stats.push(['Parallax run', st.stats.runBits + ' bits']);
    if (st.stats.optics !== undefined) stats.push(['Optics bench', st.stats.optics + ' of 5']);
    stats.push(['Secrets', `${found} of ${all.length}`]);
    const eras = app.chapters.slice(1, -1).map((c, i) => `<li><button class="era" data-i="${i + 1}"><span>${c.year}</span>${c.title}</button></li>`).join('');
    this.card.innerHTML = `
      <div class="eyebrow">Room ${app.chapters.length - 1} · the end of the corridor</div>
      <h1>From one dot<br>to a ray of light.</h1>
      <p>You started with a blinking cursor in a grid of 1,800 boxes. Each room added one idea: a beam, a grid of numbers, layers, rays, vertices, triangles, normals, textures, samples, shaders, distance fields, lenses, and finally light itself. Every one of them is still running inside every frame you see today.</p>
      <div class="made">
        <figure><canvas id="fin-glyph" width="40" height="60"></canvas><figcaption>your cursor</figcaption></figure>
        <figure><canvas id="fin-sprite" width="64" height="64"></canvas><figcaption>your sprite</figcaption></figure>
        <dl>${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      </div>
      <div class="acts"><button class="btn on" id="fin-share">Share a postcard</button><button class="btn" id="fin-again">Begin again ↺</button></div>
      <details><summary>Revisit any era</summary><ol>${eras}</ol></details>
      <p class="credits">Built with Three.js and the Web Audio API. There are no images, videos or recordings on this page: every pixel and every note is computed live in your browser.</p>`;
    const g = this.card.querySelector('#fin-glyph').getContext('2d');
    g.fillStyle = '#ffb547';
    st.glyph.forEach((b, i) => { if (b) g.fillRect((i % 8) * 5, Math.floor(i / 8) * 5, 5, 5); });
    drawSprite(this.card.querySelector('#fin-sprite').getContext('2d'), st.sprite, st.palette, 0, 0, 4);
    this.card.querySelector('#fin-share').onclick = () => openShare(app);
    this.card.querySelector('#fin-again').onclick = () => { app.go(1); };
    this.card.querySelectorAll('.era').forEach((b) => (b.onclick = () => app.go(+b.dataset.i)));
    this.card.classList.add('show');
    this.t = 0;
    app.audio.swell();
  },

  exit() { this.card.classList.remove('show'); },

  update(dt) { this.t += dt; this.mat.uniforms.uT.value = this.t; },

  render(renderer, target) {
    const ns = this.app.adapt(this, this.pt.scale, 0.25);
    if (ns !== this.pt.scale) { this.pt.scale = ns; const r = renderer.domElement; this.pt.setSize(r.width, r.height); }
    if (this.pt.frame < 3000) this.pt.step(this.app.lowQuality ? 1 : 2);
    this.mat.uniforms.tSrc.value = this.pt.texture;
    renderer.setRenderTarget(target); renderer.render(this.qs, this.qc);
  },
};
