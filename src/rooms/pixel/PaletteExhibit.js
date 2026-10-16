import { sunriseImage, SUNRISE_PALETTE, hexRGB } from '../../gfx/Indexed.js';
import { text, bar, inRect, ACCENT, BG, INK } from './frameUI.js';
import { lerp } from '../../core/math.js';

// "Sixteen colours": the picture is stored as numbers 0–15. Hover the
// picture to see every pixel that shares a number; click a colour in the
// list to change it, and every pixel using it changes at once.

const IMG = { x: 40, y: 50, s: 8 };

/** Turn a colour around the colour wheel, keeping its brightness. */
function rotateHue([r, g, b], degrees) {
  const a = (degrees * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const k = 1 / 3, sq = Math.sqrt(k);
  const m = [
    cos + (1 - cos) * k, k * (1 - cos) - sq * sin, k * (1 - cos) + sq * sin,
    k * (1 - cos) + sq * sin, cos + k * (1 - cos), k * (1 - cos) - sq * sin,
    k * (1 - cos) - sq * sin, k * (1 - cos) + sq * sin, cos + k * (1 - cos),
  ];
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return [c(r * m[0] + g * m[1] + b * m[2]), c(r * m[3] + g * m[4] + b * m[5]), c(r * m[6] + g * m[7] + b * m[8])];
}
const SW = { x: 600, y: 50, size: 74, gap: 12 };
const NIGHT = ['#020208', '#04061a', '#081030', '#0e1a48', '#1a2a5a', '#2a3a6a', '#c8d4ff', '#ffffff', '#0a0a1a', '#05050c', '#3fd8ff', '#020208', '#2a2a6a', '#8ae0ff', '#3fd8ff', '#ffffff'];

export class PaletteExhibit {
  constructor(frame, app) {
    this.frame = frame; this.app = app;
    this.palette = SUNRISE_PALETTE.map(hexRGB);
    this.day = SUNRISE_PALETTE.map(hexRGB);
    this.night = NIGHT.map(hexRGB);
    this.hoverIndex = -1;
    this.selected = -1;
    this.memoryFocus = 0;
  }

  refreshImage() { this.img = sunriseImage(this.app.state.glyph); }

  reset() { this.palette = this.day.map((c) => c.slice()); this.hoverIndex = -1; this.selected = -1; this.memoryFocus = 0; this.refreshImage(); }

  /** 0 = day, 1 = night; blends every palette entry. */
  setTimeOfDay(k) { this.palette = this.day.map((c, i) => c.map((v, j) => Math.round(lerp(v, this.night[i][j], k)))); }

  swatchRect(i) {
    const { x, y, size, gap } = SW;
    return { x: x + (i % 4) * (size + gap), y: y + Math.floor(i / 4) * (size + gap), w: size, h: size };
  }

  pointer(e) {
    const { sx, sy } = e;
    const ix = Math.floor((sx - IMG.x) / IMG.s), iy = Math.floor((sy - IMG.y) / IMG.s);
    let hover = -1;
    if (ix >= 0 && iy >= 0 && ix < this.img.w && iy < this.img.h) hover = this.img.get(ix, iy);
    for (let i = 0; i < 16; i++) if (inRect(this.swatchRect(i), sx, sy)) hover = i;
    this.hoverIndex = e.inside ? hover : -1;
    if (e.type === 'down' && hover >= 0) {
      this.palette[hover] = rotateHue(this.palette[hover], 55);
      this.selected = hover;
      this.app.audio.blipUp(hover);
      return true;
    }
    return false;
  }

  draw(t) {
    const { ctx } = this.frame;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, 960, 600);
    this.img.draw(ctx, IMG.x, IMG.y, IMG.s, this.palette);
    // pixels that share the hovered number pulse
    if (this.hoverIndex >= 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(t * 8)})`;
      for (let y = 0; y < this.img.h; y++) for (let x = 0; x < this.img.w; x++) {
        if (this.img.get(x, y) === this.hoverIndex) ctx.fillRect(IMG.x + x * IMG.s, IMG.y + y * IMG.s, IMG.s, IMG.s);
      }
    }
    for (let i = 0; i < 16; i++) {
      const r = this.swatchRect(i), [cr, cg, cb] = this.palette[i];
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.lineWidth = i === this.hoverIndex ? 5 : 2;
      ctx.strokeStyle = i === this.hoverIndex ? ACCENT : 'rgba(236,230,218,0.25)';
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      const light = cr * 0.3 + cg * 0.59 + cb * 0.11 > 140;
      text(ctx, String(i), r.x + 8, r.y + 24, { size: 20, color: light ? '#111' : INK });
    }
    text(ctx, 'The list of 16 colours', SW.x, SW.y + 4 * (SW.size + SW.gap) + 22, { size: 20, color: INK, weight: 400 });
    const f = 0.65 + 0.35 * this.memoryFocus;
    ctx.globalAlpha = f;
    bar(ctx, { x: 40, y: 500, w: 880, k: 1, label: 'Every dot stores a full colour', value: '9,216 bytes', color: '#c0392b' });
    bar(ctx, { x: 40, y: 562, w: 880, k: (1536 + 48) / 9216, label: 'Every dot stores a number from 0 to 15, plus the list', value: '1,584 bytes', color: '#7dffb0' });
    ctx.globalAlpha = 1;
    this.frame.commit();
  }
}
