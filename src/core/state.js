// Persistent visitor state: secrets found, eras visited, and the two things
// the visitor makes and carries through the museum (a glyph and a sprite).

const KEY = 'mog-state-v1';

// Default 16x16 sprite, 2 bits per pixel (0 = transparent). An abstract
// cursor-glyph: a notched diamond with a core. Original design.
const DEFAULT_SPRITE = [
  '................',
  '.......11.......',
  '......1221......',
  '.....122221.....',
  '....12233221....',
  '...1223333221...',
  '..122333333221..',
  '.12233322333221.',
  '.12233322333221.',
  '..122333333221..',
  '...1223333221...',
  '....12233221....',
  '.....122221.....',
  '......1221......',
  '.......11.......',
  '................',
];

export const DEFAULT_PALETTE = ['#000000', '#1d6bff', '#7ff3ff', '#ffffff'];

function spriteFromStrings(rows) {
  const a = new Uint8Array(256);
  rows.forEach((r, y) => { for (let x = 0; x < 16; x++) a[y * 16 + x] = r[x] === '.' ? 0 : +r[x]; });
  return a;
}

// 8x12 glyph bitmap for the cursor, default: a solid block with a notch.
const DEFAULT_GLYPH = (() => {
  const g = new Uint8Array(96);
  for (let y = 1; y < 11; y++) for (let x = 1; x < 7; x++) g[y * 8 + x] = 1;
  return g;
})();

export function encodeSprite(sp) {
  const bytes = new Uint8Array(64);
  for (let i = 0; i < 256; i++) bytes[i >> 2] |= (sp[i] & 3) << ((i & 3) * 2);
  let s = ''; bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeSprite(str) {
  try {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    if (s.length !== 64) return null;
    const sp = new Uint8Array(256);
    for (let i = 0; i < 256; i++) sp[i] = (s.charCodeAt(i >> 2) >> ((i & 3) * 2)) & 3;
    return sp;
  } catch (e) { return null; }
}

export class State {
  constructor() {
    this.secrets = new Set();
    this.visited = new Set();
    this.sprite = spriteFromStrings(DEFAULT_SPRITE);
    this.spriteEdited = false;
    this.palette = DEFAULT_PALETTE.slice();
    this.glyph = DEFAULT_GLYPH.slice();
    this.glyphEdited = false;
    this.stats = {};
    this.sharedSprite = null;
    this.sharedName = null;
    this.load();
    try {
      const q = new URLSearchParams(location.search);
      const s = q.get('s');
      if (s) { const sp = decodeSprite(s); if (sp) { this.sharedSprite = sp; this.sharedName = (q.get('n') || '').slice(0, 24); } }
    } catch (e) {}
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return;
      const d = JSON.parse(raw);
      (d.secrets || []).forEach((s) => this.secrets.add(s));
      (d.visited || []).forEach((s) => this.visited.add(s));
      if (d.sprite) { const sp = decodeSprite(d.sprite); if (sp) { this.sprite = sp; this.spriteEdited = true; } }
      if (d.glyph && d.glyph.length === 96) { this.glyph = Uint8Array.from(d.glyph.split('').map(Number)); this.glyphEdited = true; }
      if (d.palette) this.palette = d.palette;
      this.stats = d.stats || {};
    } catch (e) {}
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        secrets: [...this.secrets], visited: [...this.visited], sprite: this.spriteEdited ? encodeSprite(this.sprite) : null,
        glyph: this.glyphEdited ? Array.from(this.glyph).join('') : null, palette: this.palette, stats: this.stats,
      }));
    } catch (e) {}
  }
  stat(k, v, better = (a, b) => b > a) {
    if (this.stats[k] === undefined || better(this.stats[k], v)) { this.stats[k] = v; this.save(); return true; }
    return false;
  }
}
