import { HallRoom } from '../hall/HallRoom.js';
import { sunriseImage, SUNRISE_PALETTE } from '../gfx/Indexed.js';
import { makeCanvas } from '../gfx/three-utils.js';
import { lerp } from '../core/math.js';
import { PaletteExhibit } from './pixel/PaletteExhibit.js';
import { DitherExhibit } from './pixel/DitherExhibit.js';

// ROOM 03 · The pixel.
// A cutaway television shows the raster: the beam no longer follows
// shapes, it sweeps every row and switches on and off, so the computer
// keeps one number for every dot. Two framed works on the wall show what
// those numbers mean (the palette) and how artists got more out of two
// colours than two colours should allow (dithering).

const TV_W = 640, TV_H = 480;

export default (app) => new PixelRoom(app, {
  id: 'pixel', title: 'The Pixel', years: '1975 – 1990', music: 'chip',
  secrets: [
    { id: 'palette-night', title: 'Night shift', hint: 'Recolour the sky in the palette frame by hand.', desc: 'Change the list, not the picture.' },
  ],
  notes: [
    { title: 'Raster scanning', body: [
      'A television beam does not follow the shapes in a picture. It sweeps the same path every time: left to right along one row, then down to the next, top to bottom, about 60 times a second.',
      'To know when to switch the beam on, the computer keeps a block of memory with one number for every dot on the screen: the framebuffer. Each of those dots is a pixel, short for “picture element”.',
    ] },
    { title: 'The palette', body: [
      'Storing a full colour for every pixel took too much memory, so each pixel stored a small number instead, and a short list said which colour each number meant.',
      { eq: '64 × 48 pixels × 3 bytes of colour  = 9,216 bytes\n64 × 48 pixels × 4 bits + 16 colours = 1,584 bytes' },
    ] },
    { title: 'Dithering', body: [
      'With few colours, smooth shading turns into hard bands. Dithering mixes the available colours in a fine pattern so the eye blends them back into in-between shades. An ordered pattern gives a regular texture; spreading each dot’s error to its neighbours (error diffusion) gives a softer, grainier one.',
    ] },
  ],
}, { stations: ['tv', 'palette', 'dither'] });

class PixelRoom extends HallRoom {
  async load() {
    super.load();
    try { await document.fonts.load('700 20px "Atkinson Hyperlegible"'); } catch { /* fallback font */ }
    this.tv = this.hall.device('tv');
    this.screen = this.tv.screen;
    this.screen.resize(TV_W, TV_H);
    this.screen.setProfile({ tint: '#ffffff', mono: 0, scan: 0.45, mask: 0.35, glow: 0.3, curv: 0.2, noise: 0.02, bright: 1.2, res: [64 * 2, 48 * 2] });
    this.phos = makeCanvas(TV_W, TV_H);
    this.palette = new PaletteExhibit(this.hall.device('palette'), this.app);
    this.dither = new DitherExhibit(this.hall.device('dither'), this.app);
    this.beam = { row: 0, col: 0 };
    this.numbers = 0;
  }

  enter(scope, ctx) {
    this.arrive(ctx, 'tv');
    this.img = sunriseImage(this.app.state.glyph);
    this.source = this.img.resolve();
    this.palette.reset();
    this.dither.reset();
    this.screen.power(1);
    const knob = this.tv.controls.speed;
    const view = (id, name = 'main', opts) => this.look(id, name, opts);
    scope.add(() => { this.numbers = 0; this.timeOfDay = null; });

    this.tour = this.startTour(scope, [
      { caption: 'A TV beam doesn’t follow shapes. It sweeps every row, top to bottom.', duration: 9,
        enter: () => { view('tv'); knob.set(0.12); this.numbers = 0; } },
      { caption: 'At full speed the rows blur into one steady picture, 60 times a second.', duration: 6,
        enter: () => { view('tv'); this.numbers = 0; },
        update: (t) => knob.set(Math.min(1, 0.12 + t * 0.3)) },
      { caption: 'To know when to switch the beam on, the computer stores a number for every dot.', duration: 8,
        enter: () => { view('tv', 'face'); knob.set(1); this.numbers = 0; },
        update: (t) => { this.numbers = Math.min(1, t / 3); } },
      { caption: 'Each number points to a colour in a short list: the palette.', duration: 8,
        enter: () => { view('palette'); this.numbers = 0; this.palette.reset(); },
        update: (t) => { this.palette.hoverIndex = [6, 1, 10, 15][Math.floor(t / 2) % 4]; } },
      { caption: 'Change a colour in the list, and every dot that uses it changes at once.', duration: 8,
        enter: () => { view('palette'); this.palette.reset(); },
        update: (t) => { this.palette.hoverIndex = -1; this.palette.setTimeOfDay(0.5 - 0.5 * Math.cos(t * 0.9)); } },
      { caption: 'Small numbers instead of full colours: about six times less memory.', duration: 7,
        enter: () => { view('palette'); this.palette.reset(); this.palette.memoryFocus = 1; } },
      { caption: 'Only two colours? Mix them in a pattern and your eye blends the dots.', duration: 9,
        enter: () => { view('dither'); this.dither.reset(); },
        update: (t) => { this.dither.split = 480 + Math.sin(t * 0.8) * 380; } },
      { caption: 'Step back, and the pattern turns into smooth shades.', duration: 7,
        enter: () => { this.dither.split = 480; const v = this.hall.view('dither'); this.hall.goTo({ ...v, w: v.w * 3.4, h: v.h * 3.4 }, { duration: 3, lift: 0 }); } },
      { caption: 'Your turn: drag the line, hover to magnify, switch patterns in the corner.',
        enter: () => view('dither') },
    ]);
  }

  pointer(e) {
    if (!e.surface) return;
    const exhibit = e.surface === this.palette.frame.picture.userData.surface ? this.palette
      : e.surface === this.dither.frame.picture.userData.surface ? this.dither : null;
    if (!exhibit) return;
    if (exhibit.pointer(e)) {
      this.tour?.pause();
      if (exhibit === this.palette && [0, 1, 2, 3].includes(this.palette.selected)) this.app.secret('palette-night', 'Night shift', 'You changed the sky without touching a single pixel.');
    }
  }

  update(dt, t) {
    this.drawTV(dt, t);
    this.palette.draw(t);
    this.dither.draw(t);
  }

  /** The raster: paint rows of the source image as the beam passes, with fading phosphor. */
  drawTV(dt, t) {
    const k = this.tv.controls.speed.normalized;
    const rowsPerSec = lerp(1.2, 2880, k ** 3);
    const px = this.phos.getContext('2d');
    px.imageSmoothingEnabled = false;
    const decay = lerp(2.2, 0.02, Math.sqrt(k));
    px.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt / decay)})`;
    px.fillRect(0, 0, TV_W, TV_H);
    const rows = 48, cell = TV_W / 64;
    const before = this.beam.row;
    this.beam.row += rowsPerSec * dt;
    const scanned = this.beam.row - before;
    if (scanned >= rows) px.drawImage(this.source, 0, 0, 64, 48, 0, 0, TV_W, TV_H);
    else {
      for (let r = Math.floor(before); r <= Math.floor(this.beam.row); r++) {
        const row = ((r % rows) + rows) % rows;
        const x0 = r === Math.floor(before) ? before - Math.floor(before) : 0;
        const x1 = r === Math.floor(this.beam.row) ? this.beam.row - Math.floor(this.beam.row) : 1;
        if (x1 <= x0) continue;
        const sx = Math.floor(x0 * 64), ex = Math.ceil(x1 * 64);
        px.drawImage(this.source, sx, row, ex - sx, 1, sx * cell, row * cell, (ex - sx) * cell, cell);
      }
    }
    this.beam.row %= rows * 1000;
    const v = (this.beam.row % rows) / rows, u = this.beam.row - Math.floor(this.beam.row);
    this.tv.aim(u, v, k < 0.97);

    const ctx = this.screen.ctx;
    ctx.drawImage(this.phos, 0, 0);
    if (this.numbers > 0) this.drawNumbers(ctx, this.numbers);
    this.screen.commit(t);
  }

  /** Zoom into the picture until every pixel shows its stored number. */
  drawNumbers(ctx, k) {
    const img = this.img;
    const z = lerp(1, 5, k * k);
    const cx = 32, cy = 32, cell = (TV_W / 64) * z;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, TV_W, TV_H);
    ctx.save();
    ctx.translate(TV_W / 2 - cx * cell, TV_H / 2 - cy * cell);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.source, 0, 0, 64 * cell, 48 * cell);
    if (k > 0.5) {
      const a = Math.min(1, (k - 0.5) * 2);
      ctx.strokeStyle = `rgba(0,0,0,${0.6 * a})`; ctx.lineWidth = 2;
      ctx.font = `700 ${Math.round(cell * 0.42)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let y = cy - 7; y < cy + 7; y++) for (let x = cx - 9; x < cx + 9; x++) {
        ctx.strokeRect(x * cell, y * cell, cell, cell);
        const idx = img.get(x, y);
        const [r, g, b] = [1, 3, 5].map((o) => parseInt(SUNRISE_PALETTE[idx].slice(o, o + 2), 16));
        ctx.fillStyle = r * 0.3 + g * 0.59 + b * 0.11 > 140 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
        ctx.fillText(String(idx), x * cell + cell / 2, y * cell + cell / 2);
      }
    }
    ctx.restore();
  }
}
