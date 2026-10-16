// Drawing helpers shared by the framed exhibits on the gallery wall. The
// frames are a modern museum's own displays, so their labels use the
// museum typeface; the artwork inside them is period pixel art.

export const FONT = '"Atkinson Hyperlegible", Arial, sans-serif';
export const MONO = '"JetBrains Mono", Menlo, monospace';
export const INK = '#ece6da';
export const MUTED = '#a39d91';
export const ACCENT = '#e8b04a';
export const BG = '#0d0d0f';

export const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export function text(ctx, str, x, y, { size = 22, color = INK, weight = 700, align = 'left', font = FONT, baseline = 'alphabetic' } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

/** A labelled horizontal bar: memory, CPU, counts. `k` is 0..1 of the full width. */
export function bar(ctx, { x, y, w, h = 22, k, label, value, color = ACCENT }) {
  text(ctx, label, x, y - 8, { size: 18, color: MUTED, weight: 400 });
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, Math.max(3, w * Math.min(1, k)), h);
  if (value) text(ctx, value, x + w, y - 8, { size: 18, align: 'right', font: MONO, weight: 600 });
}

/** A rounded button drawn inside a frame. */
export function button(ctx, r, label, on = false) {
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 10);
  ctx.fillStyle = on ? ACCENT : 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.strokeStyle = on ? ACCENT : 'rgba(236,230,218,0.3)'; ctx.lineWidth = 2; ctx.stroke();
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 18, color: on ? '#1a1305' : INK, align: 'center', baseline: 'middle' });
}

/** A magnifying loupe: copies a region of `src` around (cx, cy) and draws it enlarged. */
export function loupe(ctx, src, cx, cy, { radius = 90, zoom = 4 } = {}) {
  const s = radius / zoom;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, cx - s, cy - s, s * 2, s * 2, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
}
