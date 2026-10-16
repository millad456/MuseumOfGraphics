import { IndexedImage } from '../../gfx/Indexed.js';
import { text, button, inRect, BG, INK, MUTED, ACCENT } from './frameUI.js';
import { seeded } from '../../core/math.js';

// "Colour cycling": a waterfall that flows although no pixel is ever
// redrawn. Six palette entries hold six shades of water; rotating those six
// colours makes the stripes appear to travel. The limit: anything painted
// with those numbers moves the same way, at the same speed.

const W = 160, H = 90, S = 5;
const OX = 80, OY = 20;
const CYCLE = [8, 9, 10, 11, 12, 13];
const PALETTE = [
  '#0d0b24', '#2b1b4f', '#7a3a6a', '#ffcf7a', '#140f12', '#2e2228', '#4a3a40', '#0f2418',
  '#0a2a5a', '#1a4a8a', '#3a7ac8', '#7ab8f0', '#c8e8ff', '#1a4a8a', '#24402a', '#f4fbff',
];

function scene() {
  const img = new IndexedImage(W, H, PALETTE);
  const R = seeded(11);
  const noise = Array.from({ length: W }, () => R());
  const cliffL = (y) => 58 + Math.sin(y * 0.15) * 4 + Math.sin(y * 0.41) * 2;
  const cliffR = (y) => 96 - Math.sin(y * 0.12 + 1) * 4 - Math.sin(y * 0.37) * 2;
  img.fill((x, y) => {
    // sky with dithered bands
    let c = y < 14 ? 0 : y < 28 ? ((x + y) % 2 ? 0 : 1) : y < 40 ? 1 : ((x + y) % 2 ? 1 : 2);
    if (Math.hypot(x - 128, y - 22) < 8) c = 3;
    const falls = y >= 30 && y < 70;
    if (y >= 26) {
      const l = cliffL(y), r = cliffR(y);
      if (x < l || x > r) {
        const edge = x < l ? l - x : x - r;
        c = edge < 2 ? 6 : edge < 6 ? ((x + y) % 2 ? 5 : 6) : edge < 14 ? 5 : 4;
        if (y > 60 && (x * 7 + y * 3) % 11 === 0) c = 14;
        if (y < 32 && (x < 20 || x > 140) && (x + y) % 3 === 0) c = 7;
      } else if (falls) {
        c = CYCLE[Math.floor(y * 0.6 + noise[x] * 6 + x * 0.05) % 6];
        if (y > 66) c = 15;
      }
    }
    if (y >= 70) {
      // the pool: ripples that travel outward
      const d = Math.hypot((x - 77) * 0.6, (y - 70) * 1.6);
      c = CYCLE[Math.floor(d * 0.45) % 6];
      if (y > 84 && (x < 30 || x > 130)) c = 4;
    }
    return c;
  });
  return img;
}

export class CyclingExhibit {
  constructor(frame, app) {
    this.frame = frame; this.app = app;
    this.palette = PALETTE.map((h) => [1, 3, 5].map((o) => parseInt(h.slice(o, o + 2), 16)));
    this.reset();
  }

  reset() { this.img = scene(); this.phase = 0; this.acc = 0; this.on = true; this.painting = false; this.focusStrip = 0; }

  get resetBtn() { return { x: 830, y: 492, w: 100, h: 40 }; }
  get toggleBtn() { return { x: 830, y: 544, w: 100, h: 40 }; }

  /** Paint with "water" numbers, so the stroke flows like the water does. */
  paint(sx, sy) {
    const x = Math.floor((sx - OX) / S), y = Math.floor((sy - OY) / S);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > 5) continue;
      const px = x + dx, py = y + dy;
      if (px >= 0 && py >= 0 && px < W && py < H) this.img.set(px, py, CYCLE[Math.floor(py * 0.6 + px * 0.05) % 6]);
    }
  }

  pointer(e) {
    if (e.type === 'down') {
      if (inRect(this.resetBtn, e.sx, e.sy)) { this.reset(); this.app.audio.click(); return true; }
      if (inRect(this.toggleBtn, e.sx, e.sy)) { this.on = !this.on; this.app.audio.click(); return true; }
      if (e.sy < OY + H * S) { this.painting = true; this.paint(e.sx, e.sy); return true; }
    }
    if (e.type === 'up') this.painting = false;
    if (this.painting && e.type === 'move') { this.paint(e.sx, e.sy); return true; }
    return false;
  }

  draw(t, dt) {
    const { ctx } = this.frame;
    if (this.on) { this.acc += dt * 9; while (this.acc >= 1) { this.acc -= 1; this.phase = (this.phase + 1) % 6; } }
    // rotate the six water colours: entry i shows the colour of entry i - phase
    const pal = this.palette.map((c) => c);
    CYCLE.forEach((idx, i) => { pal[idx] = this.palette[CYCLE[(i - this.phase + 6) % 6]]; });
    ctx.fillStyle = BG; ctx.fillRect(0, 0, 960, 600);
    this.img.draw(ctx, OX, OY, S, pal);
    // the palette strip, with the cycling range bracketed
    const sx = 80, sy = 492, sw = 40;
    for (let i = 0; i < 16; i++) {
      const [r, g, b] = pal[i];
      ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(sx + i * sw, sy, sw - 4, 40);
    }
    const a0 = sx + CYCLE[0] * sw - 4, a1 = sx + (CYCLE[5] + 1) * sw;
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 3 + this.focusStrip * 2;
    ctx.strokeRect(a0, sy - 6, a1 - a0, 52);
    // a little arrow travelling along the range
    const ax = a0 + 10 + ((this.phase + this.acc) / 6) * (a1 - a0 - 20);
    ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.moveTo(ax - 8, sy + 54); ctx.lineTo(ax + 8, sy + 54); ctx.lineTo(ax, sy + 46); ctx.fill();
    text(ctx, this.on ? 'These 6 colours rotate' : 'Cycling stopped', a0, sy + 82, { size: 18, color: MUTED, weight: 400 });
    text(ctx, 'Pixels redrawn: 0', 80, sy + 82 + 0, { size: 18, color: INK });
    button(ctx, this.resetBtn, 'Reset');
    button(ctx, this.toggleBtn, this.on ? 'Stop' : 'Start', !this.on);
    this.frame.commit();
  }
}
