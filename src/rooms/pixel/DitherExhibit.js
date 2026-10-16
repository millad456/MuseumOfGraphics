import { IndexedImage } from '../../gfx/Indexed.js';
import { text, button, inRect, loupe, INK } from './frameUI.js';

// "Dithering": a soft picture shown with only two colours. On the left the
// nearest colour is picked for every dot (hard bands); on the right the
// error is spread out as a pattern that the eye blends back into shades.

const W = 240, H = 150, S = 4;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function sourceImage() {
  const g = new Float32Array(W * H);
  const L = [-0.5, 0.65, 0.58];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v;
    if (y < 92) v = 0.15 + 0.75 * (y / 92) ** 1.4;                         // sky
    else { const z = 40 / (y - 88); v = 0.2 + 0.35 * ((Math.floor(x / (z * 9 + 2) * 2) + Math.floor(z * 3)) % 2) / (1 + z * 0.3); } // floor
    const dx = (x - 150) / 44, dy = (y - 70) / 44, r2 = dx * dx + dy * dy;
    if (r2 < 1) { const nz = Math.sqrt(1 - r2); v = Math.max(0.03, dx * L[0] + -dy * L[1] + nz * L[2]) ** 1.1 * 0.95 + 0.04; }
    const sx = (x - 150) / 60, sy = (y - 118) / 10;                         // shadow under the ball
    if (y > 92 && sx * sx + sy * sy < 1) v *= 0.45;
    g[y * W + x] = Math.min(1, Math.max(0, v));
  }
  return g;
}

function quantise(src, method) {
  const img = new IndexedImage(W, H, ['#121216', '#ece6da']);
  if (method === 'none') { img.fill((x, y) => (src[y * W + x] > 0.5 ? 1 : 0)); return img; }
  if (method === 'pattern') { img.fill((x, y) => (src[y * W + x] > (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16 ? 1 : 0)); return img; }
  const e = Float32Array.from(src);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = e[i] > 0.5 ? 1 : 0, err = e[i] - v;
    img.data[i] = v;
    if (x + 1 < W) e[i + 1] += err * 7 / 16;
    if (y + 1 < H) {
      if (x > 0) e[i + W - 1] += err * 3 / 16;
      e[i + W] += err * 5 / 16;
      if (x + 1 < W) e[i + W + 1] += err * 1 / 16;
    }
  }
  return img;
}

export class DitherExhibit {
  constructor(frame, app) {
    this.frame = frame; this.app = app;
    const src = sourceImage();
    this.images = { none: quantise(src, 'none'), pattern: quantise(src, 'pattern'), scatter: quantise(src, 'scatter') };
    this.layers = Object.fromEntries(Object.entries(this.images).map(([k, img]) => [k, img.resolve()]));
    this.full = document.createElement('canvas'); this.full.width = 960; this.full.height = 600;
    this.reset();
  }

  reset() { this.split = 480; this.method = 'scatter'; this.hover = null; this.dragging = false; }

  buttons() { return [{ x: 760, y: 18, w: 90, h: 40, m: 'pattern', l: 'Pattern' }, { x: 856, y: 18, w: 90, h: 40, m: 'scatter', l: 'Scatter' }]; }

  pointer(e) {
    const { sx, sy } = e;
    if (e.type === 'down') {
      for (const b of this.buttons()) if (inRect(b, sx, sy)) { this.method = b.m; this.app.audio.click(); return true; }
      if (Math.abs(sx - this.split) < 60) { this.dragging = true; return true; }
    }
    if (e.type === 'up') this.dragging = false;
    if (this.dragging) this.split = Math.max(0, Math.min(960, sx));
    this.hover = e.inside && !this.dragging ? { x: sx, y: sy } : null;
    return this.dragging;
  }

  draw() {
    const { ctx } = this.frame;
    const f = this.full.getContext('2d');
    f.imageSmoothingEnabled = false;
    f.drawImage(this.layers.none, 0, 0, W * S, H * S);
    f.save(); f.beginPath(); f.rect(this.split, 0, 960 - this.split, 600); f.clip();
    f.drawImage(this.layers[this.method], 0, 0, W * S, H * S);
    f.restore();
    ctx.drawImage(this.full, 0, 0);
    // divider
    ctx.fillStyle = '#e8b04a'; ctx.fillRect(this.split - 2, 0, 4, 600);
    ctx.beginPath(); ctx.arc(this.split, 300, 22, 0, Math.PI * 2); ctx.fill();
    text(ctx, '‹›', this.split, 308, { size: 24, color: '#1a1305', align: 'center' });
    const pill = (str, x, align) => {
      ctx.font = '700 20px "Atkinson Hyperlegible", sans-serif';
      const w = ctx.measureText(str).width + 24, px = align === 'right' ? x - w : x;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.beginPath(); ctx.roundRect(px, 556, w, 32, 8); ctx.fill();
      text(ctx, str, px + 12, 579, { size: 20, color: INK });
    };
    if (this.split > 140) pill('Nearest colour', this.split - 16, 'right');
    if (this.split < 820) pill('Dithered', this.split + 16, 'left');
    for (const b of this.buttons()) button(ctx, b, b.l, this.method === b.m);
    if (this.hover && this.hover.y > 70) loupe(ctx, this.full, this.hover.x, this.hover.y, { radius: 96, zoom: 4 });
    this.frame.commit();
  }
}
