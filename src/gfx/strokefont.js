// A tiny stroke font on a 4x6 grid, so text on vector displays is drawn by
// the beam like everything else. Each glyph: polylines separated by '|',
// points as "xy" digit pairs. Original design.
const G = {
  A: '06 01 10 30 41 46|03 43', B: '06 00 30 41 42 33 03|33 44 45 36 06', C: '41 30 10 01 05 16 36 45', D: '06 00 20 42 44 26 06',
  E: '40 00 06 46|03 33', F: '40 00 06|03 33', G: '41 30 10 01 05 16 36 45 43 23', H: '00 06|40 46|03 43', I: '10 30|20 26|16 36',
  J: '40 45 36 16 05', K: '00 06|40 03|13 46', L: '00 06 46', M: '06 00 23 40 46', N: '06 00 46 40', O: '10 30 41 45 36 16 05 01 10',
  P: '06 00 30 41 42 33 03', Q: '10 30 41 45 36 16 05 01 10|24 46', R: '06 00 30 41 42 33 03|23 46', S: '41 30 10 01 02 13 33 44 45 36 16 05',
  T: '00 40|20 26', U: '00 05 16 36 45 40', V: '00 26 40', W: '00 16 23 36 40', X: '00 46|40 06', Y: '00 23 40|23 26', Z: '00 40 06 46',
  0: '10 30 41 45 36 16 05 01 10|05 41', 1: '11 20 26|16 36', 2: '01 10 30 41 42 06 46', 3: '01 10 30 41 42 33 13|33 44 45 36 16 05',
  4: '36 30 04 44', 5: '40 00 03 33 44 45 36 06', 6: '41 30 10 01 05 16 36 45 44 33 03', 7: '00 40 26',
  8: '10 30 41 42 33 13 02 01 10|13 04 05 16 36 45 44 33', 9: '43 13 02 01 10 30 41 45 36 16',
  '.': '16 26', ':': '22 23|25 26', '-': '03 43', '/': '06 40', '%': '00 11|35 46|06 40', '=': '02 42|04 44', '(': '30 12 14 36', ')': '10 32 34 16',
  '+': '03 43|21 25', '>': '00 43 06', '<': '40 03 46', '?': '01 10 30 41 42 23 24|26 26', '*': '13 33|22 24|11 35|31 15', "'": '20 22', ',': '25 16',
};
const P = {};
for (const k in G) P[k] = G[k].split('|').map((pl) => pl.trim().split(/\s+/).map((p) => [+p[0], +p[1]]));

// returns an array of polylines (arrays of [x,y]) in pixel space
export function strokeText(str, x, y, size = 12, spacing = 1.5) {
  const s = size / 6, out = [];
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const g = P[ch];
    if (g) for (const pl of g) out.push(pl.map(([gx, gy]) => [cx + gx * s, y + gy * s]));
    cx += (4 + spacing * 2) * s;
  }
  return out;
}
export function strokeWidth(str, size = 12, spacing = 1.5) { return str.length * (4 + spacing * 2) * (size / 6); }
