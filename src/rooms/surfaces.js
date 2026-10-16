import { WorldRoom } from '../world/WorldRoom.js';

// ROOM 11 · Wallpaper for triangles.
// Pictures glued onto triangles: what texture coordinates are, the wobble
// of skipping perspective correction, the sparkle of distant textures, and
// mipmaps, the pre-shrunk copies that fix it.

export default (app) => new SurfacesRoom(app, {
  id: 'surfaces', title: 'Wallpaper for Triangles', years: '1974 – 1995', music: 'fm',
  secrets: [
    { id: 'wobble', title: 'Console wobble', hint: 'Switch off perspective correction and look around.', desc: 'Skipping one division per pixel made textures swim.' },
  ],
  notes: [
    { title: 'Coordinates on a picture', body: [
      'Each corner of a triangle gets two more numbers, u and v: a position on a picture, from 0 to 1 across and down. Every pixel inside the triangle blends those numbers and looks up its colour in the picture, called a texture.',
    ] },
    { title: 'The wobble', body: [
      'Blending u and v straight across the screen is wrong in perspective: textures on a tilted floor should squeeze in the distance. The correct method needs one division per pixel. Some mid-1990s consoles skipped it to save time, and also rounded corners to whole pixels, so textures warped and swam as the camera moved.',
    ] },
    { title: 'Mipmaps', body: [
      'Far away, one pixel covers many texels, and picking just one of them makes the floor sparkle. A 1983 paper proposed storing each texture again at ½, ¼, ⅛ … the size and picking the copy whose texels match the pixel size. The whole pyramid costs only a third more memory.',
    ] },
  ],
});

class SurfacesRoom extends WorldRoom {
  enter(scope, ctx) {
    const w = this.world, u = w.u;
    this.begin(scope, ctx, 'phong', 'floor');
    const reset = () => { u.uAffine.value = 0; u.uSnap.value = 0; u.uMipViz.value = 0; w.forceView = undefined; u.uView.value = 0; };
    scope.add(reset);
    const tray = this.app.chrome.tray(scope, 'Lab');
    this.wobbleBtn = tray.button('Skip perspective correction', (on) => { u.uAffine.value = on ? 1 : 0; u.uSnap.value = on ? 1 : 0; this.tour.pause(); if (on) this.app.secret('wobble', 'Console wobble', 'Skipping one division per pixel made textures swim.'); }, { toggle: true });
    this.filterSeg = tray.segmented('Far away', [{ value: 'texture', label: 'Nearest' }, { value: 'mipmap', label: 'Mipmaps' }], 'texture', (v) => { this.tour.pause(); this.stage(v, { duration: 1.4 }); });
    this.uvBtn = tray.button('Show texture coordinates', (on) => { w.forceView = on ? 4 : 0; u.uView.value = on ? 4 : 0; }, { toggle: true });
    this.mipBtn = tray.button('Colour each copy size', (on) => { u.uMipViz.value = on ? 1 : 0; }, { toggle: true });

    this.tour = this.startTour(scope, [
      { caption: 'Glue pictures onto the triangles: textures.', duration: 8,
        enter: () => { reset(); this.stage('texture'); this.filterSeg.set('texture'); w.shot('floor', 3); } },
      { caption: 'Each corner says which spot of the picture it uses. Red is across, green is down.', duration: 7,
        enter: () => { reset(); this.stage('texture'); w.forceView = 4; u.uView.value = 4; this.uvBtn.set(true); },
        exit: () => { w.forceView = 0; u.uView.value = 0; this.uvBtn.set(false); } },
      { caption: 'Skip one division per pixel and the textures wobble. Mid-90s consoles did.', duration: 9,
        enter: () => { reset(); this.stage('texture'); u.uAffine.value = 1; u.uSnap.value = 1; this.wobbleBtn.set(true); w.shot('overview', 7); },
        exit: () => { u.uAffine.value = 0; u.uSnap.value = 0; this.wobbleBtn.set(false); } },
      { caption: 'Far away, a single pixel stands for a whole patch of picture, and the floor sparkles.', duration: 8,
        enter: () => { reset(); this.stage('texture'); this.filterSeg.set('texture'); w.shot('floor', 3); } },
      { caption: 'The fix: keep smaller, pre-blended copies of every picture. Mipmaps.', duration: 8,
        enter: () => { reset(); this.stage('mipmap'); this.filterSeg.set('mipmap'); } },
      { caption: 'Each colour here is a different size of copy, chosen by distance.', duration: 7,
        enter: () => { reset(); this.stage('mipmap'); u.uMipViz.value = 1; this.mipBtn.set(true); },
        exit: () => { u.uMipViz.value = 0; this.mipBtn.set(false); } },
      { caption: 'Your turn: try the switches, and drag to look around.',
        enter: () => { reset(); this.stage('mipmap'); this.filterSeg.set('mipmap'); } },
    ]);
  }
}
