import { WorldRoom } from '../world/WorldRoom.js';

// ROOM 08 · The triangle.
// The gallery appears as a cloud of points, then as triangles, then filled
// one triangle at a time without a depth check (and gets it wrong), then
// with a depth buffer.

export default (app) => new TrianglesRoom(app, {
  id: 'triangles', title: 'The Triangle', years: '1963 – 1995', music: 'synth',
  secrets: [
    { id: 'depth-view', title: 'Seeing depth', hint: 'Look at the depth buffer itself.', desc: 'White is near, black is far: one number per pixel.' },
  ],
  notes: [
    { title: 'Why triangles', body: [
      'Any surface can be approximated with triangles, and a triangle is always flat and never folds over itself. So graphics hardware does one job extremely well: fill triangles.',
      'This room is made of about 30,000 of them.',
    ] },
    { title: 'Filling a triangle', body: [
      'For each pixel, the hardware tests whether its centre lies inside all three edges. Pixels inside get the triangle’s colour. The three distances to the edges also say how much of each corner the pixel is made of, which is how colours and textures are blended across the triangle.',
    ] },
    { title: 'The depth buffer', body: [
      'When two triangles cover the same pixel, which one wins? A depth buffer (also called a z-buffer), described in 1974, stores for every pixel the distance of the nearest thing drawn there so far. A new triangle is only drawn where it is closer. Triangles can then arrive in any order.',
    ] },
  ],
});

class TrianglesRoom extends WorldRoom {
  enter(scope, ctx) {
    const w = this.world;
    this.begin(scope, ctx, 'points', 'wide');
    const tray = this.app.chrome.tray(scope, 'Lab');
    this.depthBtn = tray.button('Show the depth buffer', (on) => {
      w.forceView = on ? 1 : 0; w.u.uView.value = on ? 1 : 0;
      if (on) this.app.secret('depth-view', 'Seeing depth', 'White is near, black is far: one number for every pixel.');
    }, { toggle: true });
    tray.button('Fill again, triangle by triangle', () => { this.tour.pause(); this.replay = 0; });
    this.readout = tray.readout();

    this.tour = this.startTour(scope, [
      { caption: 'Every 3D object starts as a cloud of points.', duration: 7,
        enter: () => { this.stage('points'); w.shot('wide', 2); } },
      { caption: 'Join the points in threes and you get triangles. Everything here is made of them.', duration: 8,
        enter: () => { this.stage('wire'); w.shot('overview', 4); } },
      { caption: 'Now fill each triangle with colour, one after another.', duration: 9,
        enter: () => { this.stage('fill', { duration: 0.8 }); this.replay = 0; } },
      { caption: 'With no depth check, whatever is drawn last ends up on top. The room hides everything.', duration: 8,
        enter: () => { this.stage('fill'); this.replay = null; w.revealTriangles(1); } },
      { caption: 'The fix: remember how far away each pixel is, and only draw what’s closer.', duration: 8,
        enter: () => { this.replay = null; w.revealTriangles(1); this.stage('zbuffer'); w.shot('overview', 3); } },
      { caption: 'That memory is the depth buffer. White is near, black is far.', duration: 7,
        enter: () => { this.stage('zbuffer'); w.forceView = 1; w.u.uView.value = 1; this.depthBtn.set(true); },
        exit: () => { w.forceView = 0; w.u.uView.value = 0; this.depthBtn.set(false); } },
      { caption: 'Drag to look around. Next, we light it.',
        enter: () => { this.stage('zbuffer'); } },
    ]);
  }

  update(dt, t) {
    super.update(dt, t);
    if (this.replay !== null && this.replay !== undefined) {
      this.replay = Math.min(1, this.replay + dt / 6.5);
      this.world.revealTriangles(this.replay ** 2.2);
      if (this.replay >= 1) this.replay = null;
    }
    const tri = this.world.triangleCount;
    if (this.readout) this.readout.textContent = `${this.world.pointCount.toLocaleString()} points · ${tri.toLocaleString()} triangles`;
  }
}
