import { HallRoom } from '../hall/HallRoom.js';
import { CyclingExhibit } from './pixel/CyclingExhibit.js';
import { TilesExhibit } from './pixel/TilesExhibit.js';
import { SpritesExhibit } from './pixel/SpritesExhibit.js';

// ROOM 04 · Working with less.
// Three framed works about tricks that made small machines look big:
// colour cycling, tiles and sprites.

export default (app) => new TricksRoom(app, {
  id: 'tricks', title: 'Working With Less', years: '1980 – 1995', music: 'chip2',
  secrets: [
    { id: 'flowing-sky', title: 'Flowing sky', hint: 'Paint on the waterfall picture.', desc: 'Your strokes flow too: they use the same six numbers.' },
    { id: 'near-miss', title: 'Unfair crash', hint: 'Find a crash where the pixels never touched.', desc: 'Box checks were fast, but not exact.' },
  ],
  notes: [
    { title: 'Colour cycling', body: [
      'Instead of redrawing water, artists painted it with a range of palette numbers and then rotated the colours stored in that range. The pixels never change; only the list does. It cost almost nothing, so it was used for waterfalls, fire and lights.',
      'The limit: everything painted with those numbers moves in the same direction at the same speed.',
    ] },
    { title: 'Tiles', body: [
      'A whole level was stored as a grid of numbers, each pointing to one small square picture. A few dozen squares, reused thousands of times, made worlds that would never have fitted in memory as plain pixels.',
    ] },
    { title: 'Sprites', body: [
      'Sprites are small images the video chip draws on top of the background as the beam passes. Games usually checked collisions with rectangles around each sprite, because comparing every pixel was too slow.',
      'The chip could only fetch a few sprites for each row of the screen. When more lined up, games drew different ones each frame, and they flickered.',
    ] },
  ],
}, { stations: ['cycling', 'tiles', 'sprites'] });

class TricksRoom extends HallRoom {
  async load() {
    super.load();
    this.cycling = new CyclingExhibit(this.hall.device('cycling'), this.app);
    this.tiles = new TilesExhibit(this.hall.device('tiles'), this.app);
    this.sprites = new SpritesExhibit(this.hall.device('sprites'), this.app);
    this.exhibits = [this.cycling, this.tiles, this.sprites];
  }

  enter(scope, ctx) {
    this.arrive(ctx, 'cycling');
    this.exhibits.forEach((x) => x.reset());
    const view = (id) => this.look(id);
    const near = { x: 494, y: 250 };   // a spot where the boxes overlap but the pixels don't
    scope.add(() => { this.sprites.demo = false; });

    this.tour = this.startTour(scope, [
      { caption: 'This water flows, but not a single pixel is being redrawn.', duration: 8,
        enter: () => { view('cycling'); this.cycling.reset(); } },
      { caption: 'Only the six colours in the list rotate. Watch the strip.', duration: 8,
        enter: () => { view('cycling'); this.cycling.focusStrip = 1; },
        exit: () => { this.cycling.focusStrip = 0; } },
      { caption: 'The catch: anything painted with those colours moves the same way.', duration: 9,
        enter: () => { view('cycling'); this.cycling.reset(); },
        update: (t) => { if (t < 4) { const k = t / 4; this.cycling.paint(120 + k * 300, 120 - Math.sin(k * Math.PI) * 60); } } },
      { caption: 'Worlds were built from a few small squares, used over and over.', duration: 8,
        enter: () => { view('tiles'); this.tiles.reset(); },
        update: (t) => { const k = Math.floor(t / 1.3); this.tiles.hover = [{ x: 3, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 3 }, { x: 13, y: 0 }, { x: 8, y: 4 }, { x: 14, y: 6 }][k % 6]; } },
      { caption: 'Change one square and every copy changes. The map takes 66× less memory.', duration: 9,
        enter: () => { view('tiles'); this.tiles.hover = null; this.tiles.selected = 1; this.tiles.memoryFocus = 1; },
        update: (t, dt) => { const k = Math.floor(t * 4); if (k !== Math.floor((t - dt) * 4) && k < 16) this.tiles.editPixel(k, 3); } },
      { caption: 'Sprites are small pictures that slide over the background.', duration: 6,
        enter: () => { view('sprites'); this.sprites.reset(); } },
      { caption: 'To check for crashes, games compared boxes, not pixels. So near misses counted.', duration: 9,
        enter: () => { view('sprites'); this.sprites.reset(); this.sprites.demo = true; this.sprites.o.x = 560; this.sprites.o.y = 220; },
        update: (t) => { const k = Math.min(1, t / 3); this.sprites.p.x = 200 + (near.x - 200) * k; this.sprites.p.y = 300 + (near.y - 300) * k; },
        exit: () => { this.sprites.demo = false; } },
      { caption: 'Chips could only draw 8 sprites on one row. Add more and they flicker.', duration: 8,
        enter: () => { view('sprites'); this.sprites.mode = 'limit'; },
        exit: () => { this.sprites.mode = 'hitbox'; } },
      { caption: 'Your turn: drag the ship, paint the waterfall, edit the tiles.',
        enter: () => view('sprites') },
    ]);
  }

  pointer(e) {
    if (!e.surface) return;
    const ex = this.exhibits.find((x) => x.frame.picture.userData.surface === e.surface);
    if (!ex || !ex.pointer(e)) return;
    this.tour?.pause();
    if (ex === this.cycling && e.type === 'down') this.app.secret('flowing-sky', 'Flowing sky', 'Your paint flows too: it uses the same six numbers as the water.');
    if (ex === this.sprites && this.sprites.wasHit && !this.sprites.pixelCheck && !this.sprites.pixelsTouch()) this.app.secret('near-miss', 'Unfair crash', 'Box checks were fast, but not exact.');
  }

  update(dt, t) { this.exhibits.forEach((x) => x.draw(t, dt)); }
}
