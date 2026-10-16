// Persistent visitor state: secrets found, rooms seen, the cursor glyph the
// visitor designs in the terminal and their best scores. Storage failures
// (private windows, sandboxed frames) are tolerated silently, and anything
// read back from storage is validated before use.

const KEY = 'mog-v2';

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
};

export const GLYPH_W = 8;
export const GLYPH_H = 12;

export function defaultGlyph() {
  const g = new Uint8Array(GLYPH_W * GLYPH_H);
  for (let y = 1; y < 11; y++) for (let x = 1; x < 7; x++) g[y * GLYPH_W + x] = 1;
  return g;
}

export class State {
  constructor() {
    this.secrets = new Set();
    this.seen = new Set();
    this.glyph = defaultGlyph();
    this.glyphEdited = false;
    this.stats = {};
    this.muted = store.get('mog-muted') === '1';
    this._load();
  }

  _load() {
    const raw = store.get(KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      const strings = (a) => (Array.isArray(a) ? a.filter((s) => typeof s === 'string' && s.length < 64) : []);
      strings(d.secrets).forEach((s) => this.secrets.add(s));
      strings(d.seen).forEach((s) => this.seen.add(s));
      if (typeof d.glyph === 'string' && /^[01]{96}$/.test(d.glyph)) { this.glyph = Uint8Array.from(d.glyph, Number); this.glyphEdited = true; }
      if (d.stats && typeof d.stats === 'object') {
        for (const [k, v] of Object.entries(d.stats)) if (/^\w{1,32}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) this.stats[k] = v;
      }
    } catch { /* ignore corrupt state */ }
  }

  save() {
    store.set(KEY, JSON.stringify({
      secrets: [...this.secrets],
      seen: [...this.seen],
      glyph: this.glyphEdited ? Array.from(this.glyph).join('') : null,
      stats: this.stats,
    }));
  }

  setGlyph(bits) { this.glyph = Uint8Array.from(bits); this.glyphEdited = true; this.save(); }
  setMuted(m) { this.muted = m; store.set('mog-muted', m ? '1' : '0'); }

  /** Record a stat if it improves on the stored one. Returns true when it did. */
  record(key, value, lowerIsBetter = false) {
    const prev = this.stats[key];
    if (prev === undefined || (lowerIsBetter ? value < prev : value > prev)) {
      this.stats[key] = value;
      this.save();
      return true;
    }
    return false;
  }
}
