import * as THREE from 'three';
import { WorldRoom } from '../world/WorldRoom.js';
import { STAGES, STAGE_YEARS } from '../world/stages.js';
import { GLYPH_W, GLYPH_H } from '../core/State.js';
import { h } from '../core/dom.js';

// ROOM 17 · From one dot.
// The opening ran the history backwards into a single dot. Here it runs
// forwards, every idea arriving in a wave, until the room is lit by
// simulated light again: the picture from the start, now understood.

const CENTRE = new THREE.Vector3(0, 1.4, 0);

export default (app) => new FinaleRoom(app, { id: 'finale', title: 'From One Dot', years: 'Today', music: 'ambient' });

class FinaleRoom extends WorldRoom {
  enter(scope, ctx) {
    const w = this.world;
    this.begin(scope, ctx, 'points', 'final');
    this.odometer = h('div', { class: 'odometer', 'aria-hidden': 'true' });
    this.card = this.buildCard();
    scope.mount(this.odometer, this.app.chrome.overlay);
    scope.mount(this.card, this.app.chrome.overlay);
    this.scope = scope;

    this.tour = this.startTour(scope, [
      { caption: 'Sixty years, one idea at a time.', duration: 19,
        enter: () => this.replay() },
      { caption: 'Thank you for walking through.',
        enter: () => { this.run = (this.run || 0) + 1; this.showCard(true); w.setStage('path', { duration: 1.2 }); w.shot('final', 1.5); } },
    ]);
  }

  /** Play every stage forwards, quickly, with the year counting up. */
  async replay() {
    const w = this.world, run = (this.run = (this.run || 0) + 1);
    this.showCard(false);
    w.setStage('points', { sweep: false });
    w.shot('wide', 0);
    w.shot('final', 16);
    this.odometer.classList.add('show');
    for (const s of STAGES) {
      if (this.run !== run) return;
      this.odometer.textContent = String(STAGE_YEARS[s.key]);
      this.app.audio.tick(STAGES.indexOf(s), 0.06);
      const ok = await w.setStage(s, { duration: s.key === 'path' ? 2.2 : 0.9, origin: CENTRE });
      if (!ok || this.scope.disposed || this.run !== run) return;
      if (!(await this.scope.wait(0.25))) return;
    }
    this.app.audio.swell();
    if (!(await this.scope.wait(2.5)) || this.run !== run) return;
    this.tour.next();
  }

  showCard(on) {
    this.card.classList.toggle('show', on);
    if (on) this.odometer.classList.remove('show');
  }

  buildCard() {
    const app = this.app, st = app.state;
    const all = app.allSecrets(), found = all.filter((s) => st.secrets.has(s.id)).length;
    const stats = [];
    if (st.stats.mazeTime !== undefined) stats.push(['Maze', `${st.stats.mazeTime.toFixed(1)} s`]);
    if (st.stats.runBits !== undefined) stats.push(['Parallax run', `${st.stats.runBits} bits`]);
    if (st.stats.magicErr !== undefined) stats.push(['Your magic number', `${(st.stats.magicErr * 100).toFixed(4)}% off`]);
    if (st.stats.optics !== undefined) stats.push(['Optics bench', `${st.stats.optics} of 5`]);
    stats.push(['Secrets found', `${found} of ${all.length}`]);

    const glyph = h('canvas', { width: GLYPH_W * 6, height: GLYPH_H * 6, class: 'fin-glyph' });
    const g = glyph.getContext('2d');
    g.fillStyle = '#e8b04a';
    st.glyph.forEach((b, i) => { if (b) g.fillRect((i % GLYPH_W) * 6, Math.floor(i / GLYPH_W) * 6, 6, 6); });

    return h('section', { class: 'finale', 'aria-live': 'polite' },
      h('h1', {}, 'From one dot', h('br'), 'to a ray of light.'),
      h('p', {}, 'Every idea you walked through is still running, inside every frame you see.'),
      h('div', { class: 'fin-made' },
        h('figure', {}, glyph, h('figcaption', {}, 'your cursor')),
        h('dl', {}, stats.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))))),
      h('div', { class: 'fin-acts' },
        h('button', { class: 'ctl-btn on', onclick: () => app.showShare() }, 'Share'),
        h('button', { class: 'ctl-btn', onclick: () => this.tour.go(0) }, 'Replay'),
        h('button', { class: 'ctl-btn', onclick: () => app.go(0) }, 'Begin again')),
      h('p', { class: 'fin-credits' }, 'No images, videos or recordings: every pixel and every note on this page is computed live in your browser.'));
  }

  // the camera stays put while the light converges
  pointer() {}
}
