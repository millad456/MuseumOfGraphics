// Rasterize a pixel typeface into per-glyph bitmaps once, so low-resolution
// framebuffers can draw text as actual pixels.
export function makeBitmapFont(css = '8px Silkscreen, monospace', cw = 6, ch = 8, baseline = 7) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d', { willReadFrequently: true });
  const glyphs = {};
  for (let code = 32; code < 127; code++) {
    x.clearRect(0, 0, cw, ch); x.fillStyle = '#000'; x.fillRect(0, 0, cw, ch);
    x.fillStyle = '#fff'; x.font = css; x.textBaseline = 'alphabetic';
    x.fillText(String.fromCharCode(code), 0, baseline);
    const d = x.getImageData(0, 0, cw, ch).data;
    const b = new Uint8Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) b[i] = d[i * 4] > 120 ? 1 : 0;
    glyphs[code] = b;
  }
  return {
    cw, ch, glyphs,
    // draw into an indexed buffer
    text(buf, bw, str, px, py, color) {
      let cx = px;
      for (const chr of str) {
        const g = glyphs[chr.charCodeAt(0)];
        if (g) for (let i = 0; i < cw * ch; i++) if (g[i]) {
          const xx = cx + (i % cw), yy = py + ((i / cw) | 0);
          if (xx >= 0 && xx < bw && yy >= 0) buf[yy * bw + xx] = color;
        }
        cx += cw;
      }
      return cx;
    },
  };
}
