import { makeCanvas } from './three-utils.js';

/** Parse '#rrggbb' into [r, g, b]. */
export const hexRGB = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/**
 * An indexed-colour image: one small number per pixel, plus a palette that
 * says what colour each number means. Drawing goes through a 1:1 offscreen
 * canvas and is scaled up with nearest-neighbour sampling.
 */
export class IndexedImage {
  constructor(w, h, palette) {
    this.w = w; this.h = h;
    this.data = new Uint8Array(w * h);
    this.palette = palette.map((c) => (typeof c === 'string' ? hexRGB(c) : c.slice()));
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas.getContext('2d');
    this.image = this.ctx.createImageData(w, h);
    this.u32 = new Uint32Array(this.image.data.buffer);
  }

  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : 0; }
  set(x, y, v) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = v; }
  fill(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.data[y * this.w + x] = fn(x, y); }

  /** Resolve indices through the palette into the offscreen canvas. */
  resolve(palette = this.palette) {
    const lut = palette.map(([r, g, b]) => (255 << 24) | (b << 16) | (g << 8) | r);
    const d = this.data, u = this.u32;
    for (let i = 0; i < d.length; i++) u[i] = lut[d[i]] ?? 0xff000000;
    this.ctx.putImageData(this.image, 0, 0);
    return this.canvas;
  }

  /** Draw scaled into another context. */
  draw(ctx, x, y, scale, palette) {
    this.resolve(palette);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, x, y, this.w * scale, this.h * scale);
  }
}

/** Shared scenery for the pixel rooms: a sunrise over a grid, 64 × 48, 16 colours. */
export const SUNRISE_PALETTE = [
  '#0b0820', '#1a1146', '#3a1a66', '#7a2a7a', '#c8487a', '#ff8a5a',
  '#ffd27a', '#fff3c4', '#2a1a4a', '#140c2c', '#ff4fa8', '#0e0a22',
  '#5a3a9a', '#8ae0ff', '#3fd8ff', '#ffffff',
];

export function sunriseImage(glyph) {
  const img = new IndexedImage(64, 48, SUNRISE_PALETTE);
  const horizon = 28;
  img.fill((x, y) => {
    if (y < horizon) {
      const band = Math.min(5, Math.floor((y / horizon) * 6));
      let c = band;
      const d = Math.hypot(x - 32, (y - horizon) * 1.15);
      if (d < 11) c = d < 7 ? 7 : 6;
      if (d < 11 && y > horizon - 9 && y % 3 === 0) c = band;
      const ridge = horizon - 4 - Math.round(3 * Math.sin(x * 0.35) + 2 * Math.sin(x * 0.9 + 1));
      if (y > ridge && Math.abs(x - 32) > 6) c = 8;
      return c;
    }
    const dy = y - horizon + 0.5;
    const z = 40 / dy;                      // distance of this row of floor
    const wx = ((x - 31.5) * z) / 16;       // floor position across
    const vertical = Math.abs(wx - Math.round(wx)) < 0.06 * z;
    const across = Math.abs(z - Math.round(z)) < 0.03 * z * z;
    return vertical || across ? 10 : 11;
  });
  // the visitor's cursor, standing on the grid
  if (glyph) for (let i = 0; i < 96; i++) if (glyph[i]) img.set(29 + (i % 8), 30 + Math.floor(i / 8), 15);
  return img;
}
