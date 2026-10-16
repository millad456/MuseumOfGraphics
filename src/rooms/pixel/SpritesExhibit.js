import { IndexedImage } from '../../gfx/Indexed.js';
import { text, button, inRect, BG, INK, MUTED, ACCENT } from './frameUI.js';

// "Sprites": small pictures drawn over the background by the video chip.
// Collisions were usually tested with rectangles (hitboxes), not pixels,
// so a near miss could still count. And the chip could only fetch so many
// sprites per row of the screen: past the limit, games took turns, and the
// sprites flickered.

const S = 4;
const PLAY = { x: 0, y: 0, w: 960, h: 470 };

const SHIP = [
  '.......11.......',
  '.......11.......',
  '......1221......',
  '......1221......',
  '.....122221.....',
  '.....123321.....',
  '....12333321....',
  '....12333321....',
  '...1223333221...',
  '..122233332221..',
  '.12222222222221.',
  '1222.112211.2221',
  '111...1111...111',
  '........ .......',
  '................',
  '................',
];
const ORB = [
  '................',
  '......1111......',
  '....11222211....',
  '...1222332221...',
  '..122333332221..',
  '..123333333221..',
  '.12233333333221.',
  '.12333333333321.',
  '.12333333333321.',
  '.12233333333221.',
  '..123333333221..',
  '..122333332221..',
  '...1222332221...',
  '....11222211....',
  '......1111......',
  '................',
];

function sprite(rows, palette) {
  const img = new IndexedImage(16, 16, ['#000000', ...palette]);
  img.fill((x, y) => { const c = rows[y][x]; return c >= '1' && c <= '9' ? +c : 0; });
  const canvas = img.resolve();
  // index 0 is transparent: knock it out of the resolved canvas
  const x = canvas.getContext('2d'), d = x.getImageData(0, 0, 16, 16);
  for (let i = 0; i < 256; i++) if (img.data[i] === 0) d.data[i * 4 + 3] = 0;
  x.putImageData(d, 0, 0);
  return { img, canvas };
}

export class SpritesExhibit {
  constructor(frame, app) {
    this.frame = frame; this.app = app;
    this.ship = sprite(SHIP, ['#1a4ad8', '#5ab4ff', '#eaf6ff']);
    this.orb = sprite(ORB, ['#7a1a3a', '#ff4f7a', '#ffd0dc']);
    this.stars = Array.from({ length: 90 }, (_, i) => [((i * 97) % 960), ((i * 53) % 460), (i % 3) + 1]);
    this.reset();
  }

  reset() {
    this.mode = 'hitbox';
    this.pixelCheck = false;
    this.p = { x: 300, y: 300 };
    this.o = { x: 560, y: 220, vx: -60, vy: 40 };
    this.dragging = false;
    this.flash = 0;
    this.result = null;
    this.frameNo = 0;
  }

  get checkBtn() { return { x: 610, y: 500, w: 150, h: 44 }; }
  get modeBtn() { return { x: 776, y: 500, w: 160, h: 44 }; }

  pointer(e) {
    if (e.type === 'down') {
      if (inRect(this.checkBtn, e.sx, e.sy)) { this.pixelCheck = !this.pixelCheck; this.app.audio.click(); return true; }
      if (inRect(this.modeBtn, e.sx, e.sy)) { this.mode = this.mode === 'hitbox' ? 'limit' : 'hitbox'; this.app.audio.click(); return true; }
      if (this.mode === 'hitbox' && e.sy < PLAY.h) { this.dragging = true; }
    }
    if (e.type === 'up') this.dragging = false;
    if (this.dragging) { this.p.x = Math.max(0, Math.min(960 - 64, e.sx - 32)); this.p.y = Math.max(0, Math.min(PLAY.h - 64, e.sy - 32)); return true; }
    return false;
  }

  /** Pixel-accurate overlap between the two sprites. */
  pixelsTouch() {
    const ax = Math.round(this.p.x / S), ay = Math.round(this.p.y / S), bx = Math.round(this.o.x / S), by = Math.round(this.o.y / S);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (!this.ship.img.get(x, y)) continue;
      const ox = ax + x - bx, oy = ay + y - by;
      if (ox >= 0 && oy >= 0 && ox < 16 && oy < 16 && this.orb.img.get(ox, oy)) return true;
    }
    return false;
  }

  draw(t, dt) {
    const { ctx } = this.frame;
    this.frameNo++;
    ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, 960, 600);
    for (const [x, y, s] of this.stars) { ctx.fillStyle = s === 3 ? '#8aa0ff' : '#3a4a8a'; ctx.fillRect(x, (y + t * 20 * s) % PLAY.h, s, s); }
    ctx.imageSmoothingEnabled = false;
    if (this.mode === 'hitbox') this.drawHitbox(ctx, t, dt); else this.drawLimit(ctx, t);
    ctx.fillStyle = BG; ctx.fillRect(0, PLAY.h, 960, 600 - PLAY.h);
    button(ctx, this.checkBtn, this.pixelCheck ? 'Check pixels' : 'Check boxes', this.pixelCheck);
    button(ctx, this.modeBtn, this.mode === 'hitbox' ? 'Sprite limit →' : '← Hitboxes', false);
    this.frame.commit();
  }

  drawHitbox(ctx, t, dt) {
    const o = this.o;
    if (!this.dragging && !this.demo) {
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < 0 || o.x > 960 - 64) o.vx *= -1;
      if (o.y < 0 || o.y > PLAY.h - 64) o.vy *= -1;
    }
    ctx.drawImage(this.orb.canvas, o.x, o.y, 64, 64);
    ctx.drawImage(this.ship.canvas, this.p.x, this.p.y, 64, 64);
    const boxes = Math.abs(this.p.x - o.x) < 64 && Math.abs(this.p.y - o.y) < 64;
    const pixels = boxes && this.pixelsTouch();
    const hit = this.pixelCheck ? pixels : boxes;
    if (hit && !this.wasHit) { this.flash = 1; this.app.audio.hurt(); }
    this.wasHit = hit;
    this.flash = Math.max(0, this.flash - dt * 2);
    ctx.lineWidth = 3;
    for (const [p, col] of [[this.p, '#5ab4ff'], [o, '#ff4f7a']]) { ctx.strokeStyle = hit ? '#ff3b30' : col; ctx.strokeRect(p.x + 1.5, p.y + 1.5, 61, 61); }
    if (boxes) {
      const x0 = Math.max(this.p.x, o.x), y0 = Math.max(this.p.y, o.y), x1 = Math.min(this.p.x, o.x) + 64, y1 = Math.min(this.p.y, o.y) + 64;
      ctx.fillStyle = 'rgba(255,59,48,0.25)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    let msg = 'Drag the ship', col = MUTED;
    if (boxes && !pixels) { msg = this.pixelCheck ? 'Boxes overlap, pixels don’t: no crash' : 'CRASH! The boxes touched, though the pixels didn’t'; col = this.pixelCheck ? '#7dffb0' : '#ff6a5a'; }
    else if (pixels) { msg = 'CRASH! The pixels really touched'; col = '#ff6a5a'; }
    text(ctx, msg, 24, 532, { size: 24, color: col });
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,59,48,${this.flash * 0.25})`; ctx.fillRect(0, 0, 960, PLAY.h); }
  }

  drawLimit(ctx, t) {
    // ten sprites cross one row of the screen; the chip can fetch eight
    const n = 10, rowY = 200;
    ctx.fillStyle = 'rgba(232,176,74,0.12)'; ctx.fillRect(0, rowY, 960, 64);
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.strokeRect(1, rowY, 958, 64); ctx.setLineDash([]);
    const tick = Math.floor(t * 12);
    for (let i = 0; i < n; i++) {
      const x = 30 + i * 92 + Math.sin(t + i) * 6;
      // take turns: each frame a different two are skipped
      const skipped = (i - tick * 2 + n * 100) % n >= 8;
      if (!skipped) ctx.drawImage(this.orb.canvas, x, rowY, 64, 64);
    }
    ctx.drawImage(this.ship.canvas, 448, 340, 64, 64);
    text(ctx, `Sprites on this row: ${n}. The chip can draw 8.`, 24, 532, { size: 24, color: INK });
  }
}
