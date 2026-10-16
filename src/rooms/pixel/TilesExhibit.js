import { IndexedImage } from '../../gfx/Indexed.js';
import { text, bar, inRect, BG, INK, MUTED, ACCENT } from './frameUI.js';

// "Tiles": a circuit-board world built from eight 16 × 16 squares. Hover the
// map to see which tile each square uses; edit a tile and every copy of it
// changes, because the map only stores tile numbers.

const T = 16;
const MAP_W = 18, MAP_H = 10, MAP_S = 2;
const MAP = { x: 40, y: 50 };
const SHEET = { x: 660, y: 50, s: 4, gap: 10 };
const EDIT = { x: 660, y: 228, s: 10 };
const PALETTE = ['#08170f', '#14402a', '#2fbf71', '#e8b04a'];

function makeTiles() {
  const tiles = Array.from({ length: 8 }, () => new IndexedImage(T, T, PALETTE));
  const draw = (t, fn) => t.fill(fn);
  const dots = (x, y) => ((x % 8 === 3 && y % 8 === 3) ? 1 : 0);
  draw(tiles[0], dots);                                                            // empty board
  draw(tiles[1], (x, y) => (y >= 7 && y <= 8 ? 2 : dots(x, y)));                     // horizontal trace
  draw(tiles[2], (x, y) => (x >= 7 && x <= 8 ? 2 : dots(x, y)));                     // vertical trace
  draw(tiles[3], (x, y) => ((y >= 7 && y <= 8 && x <= 8) || (x >= 7 && x <= 8 && y <= 8) ? 2 : dots(x, y))); // corner up-left
  draw(tiles[4], (x, y) => ((y >= 7 && y <= 8 && x >= 7) || (x >= 7 && x <= 8 && y >= 7) ? 2 : dots(x, y))); // corner down-right
  draw(tiles[5], (x, y) => ((y >= 7 && y <= 8) || (x >= 7 && x <= 8) ? 2 : dots(x, y)));                      // junction
  draw(tiles[6], (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 3 ? 0 : d < 5.5 ? 3 : (y >= 7 && y <= 8 && x < 4) ? 2 : dots(x, y); }); // pad
  draw(tiles[7], (x, y) => (x < 1 || x > 14 ? ((y % 4 === 1) ? 3 : 0) : y === 0 || y === 15 ? 1 : (x === 3 && y === 3) ? 2 : 1)); // chip
  return tiles;
}

const LEVEL = [
  '000000006000000000',
  '014111150000771000',
  '020000020000771000',
  '020777020000002000',
  '051777511115111300',
  '020777020000200000',
  '020000020000611100',
  '031111130000000020',
  '000000000000611130',
  '000000000000000000',
].map((row) => [...row].map(Number));

export class TilesExhibit {
  constructor(frame, app) {
    this.frame = frame; this.app = app;
    this.reset();
  }

  reset() { this.tiles = makeTiles(); this.hover = null; this.selected = 1; this.memoryFocus = 0; }

  sheetRect(i) { const { x, y, s, gap } = SHEET; return { x: x + (i % 4) * (T * s + gap), y: y + Math.floor(i / 4) * (T * s + gap), w: T * s, h: T * s }; }

  /** Toggle a pixel of the selected tile (used by the visitor and by the demo). */
  editPixel(px, py) {
    const t = this.tiles[this.selected];
    t.set(px, py, (t.get(px, py) + 1) % 4);
    this.app.audio.blipUp(t.get(px, py) * 3);
  }

  pointer(e) {
    const { sx, sy } = e;
    const mx = Math.floor((sx - MAP.x) / (T * MAP_S)), my = Math.floor((sy - MAP.y) / (T * MAP_S));
    this.hover = e.inside && mx >= 0 && my >= 0 && mx < MAP_W && my < MAP_H ? { x: mx, y: my } : null;
    if (e.type !== 'down') return false;
    for (let i = 0; i < 8; i++) if (inRect(this.sheetRect(i), sx, sy)) { this.selected = i; this.app.audio.click(); return true; }
    if (this.hover) { this.selected = LEVEL[my][mx]; return true; }
    const ex = Math.floor((sx - EDIT.x) / EDIT.s), ey = Math.floor((sy - EDIT.y) / EDIT.s);
    if (ex >= 0 && ey >= 0 && ex < T && ey < T) { this.editPixel(ex, ey); return true; }
    return false;
  }

  draw(t) {
    const { ctx } = this.frame;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, 960, 600);
    const hoverTile = this.hover ? LEVEL[this.hover.y][this.hover.x] : -1;
    const focusTile = hoverTile >= 0 ? hoverTile : this.selected;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      this.tiles[LEVEL[y][x]].draw(ctx, MAP.x + x * T * MAP_S, MAP.y + y * T * MAP_S, MAP_S);
    }
    // every copy of the focused tile glows
    ctx.strokeStyle = `rgba(232,176,74,${0.55 + 0.35 * Math.sin(t * 6)})`; ctx.lineWidth = 2;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (LEVEL[y][x] === focusTile) ctx.strokeRect(MAP.x + x * T * MAP_S + 1, MAP.y + y * T * MAP_S + 1, T * MAP_S - 2, T * MAP_S - 2);
    if (this.hover) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(MAP.x + this.hover.x * T * MAP_S, MAP.y + this.hover.y * T * MAP_S, T * MAP_S, T * MAP_S); }
    text(ctx, 'The map stores only tile numbers', MAP.x, MAP.y + MAP_H * T * MAP_S + 26, { size: 18, color: MUTED, weight: 400 });

    for (let i = 0; i < 8; i++) {
      const r = this.sheetRect(i);
      this.tiles[i].draw(ctx, r.x, r.y, SHEET.s);
      ctx.lineWidth = i === focusTile ? 4 : 1; ctx.strokeStyle = i === focusTile ? ACCENT : 'rgba(236,230,218,0.25)';
      ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
      text(ctx, String(i), r.x + 4, r.y + 18, { size: 16, color: INK });
    }
    // zoomed editor for the selected tile
    this.tiles[this.selected].draw(ctx, EDIT.x, EDIT.y, EDIT.s);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i <= T; i++) {
      ctx.beginPath(); ctx.moveTo(EDIT.x + i * EDIT.s, EDIT.y); ctx.lineTo(EDIT.x + i * EDIT.s, EDIT.y + T * EDIT.s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(EDIT.x, EDIT.y + i * EDIT.s); ctx.lineTo(EDIT.x + T * EDIT.s, EDIT.y + i * EDIT.s); ctx.stroke();
    }
    text(ctx, `Edit tile ${this.selected}`, EDIT.x + T * EDIT.s + 16, EDIT.y + 24, { size: 18 });
    text(ctx, 'Click its dots', EDIT.x + T * EDIT.s + 16, EDIT.y + 50, { size: 16, color: MUTED, weight: 400 });

    ctx.globalAlpha = 0.65 + 0.35 * this.memoryFocus;
    bar(ctx, { x: 40, y: 480, w: 880, k: 1, label: 'The map drawn as dots', value: '46,080 bytes', color: '#c0392b' });
    bar(ctx, { x: 40, y: 548, w: 880, k: 692 / 46080, label: '8 tiles + one number per square', value: '692 bytes', color: '#7dffb0' });
    ctx.globalAlpha = 1;
    this.frame.commit();
  }
}
