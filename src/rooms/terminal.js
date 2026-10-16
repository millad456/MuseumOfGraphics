import { HallRoom } from '../hall/HallRoom.js';
import { makeCanvas } from '../gfx/three-utils.js';
import { GLYPH_W as GW, GLYPH_H as GH } from '../core/State.js';
import { h } from '../core/dom.js';

// ROOM 01 · The character terminal.
// The screen is a grid of boxes. It can only put one of 95 small dot
// pictures into each box. The "font ROM" is built at runtime by
// rasterising a typeface into 8×12 bitmaps, and everything on this screen
// is drawn from those bits, including the visitor's own cursor.

const COLS = 40, ROWS = 20, CW = 24, CH = 36, S = 3;
const W = COLS * CW, H = ROWS * CH; // 960 × 720
const BLOCK = 1, SHADE = 2;

function buildROM() {
  const c = makeCanvas(GW, GH);
  const x = c.getContext('2d', { willReadFrequently: true });
  const rom = new Map();
  for (let code = 32; code < 127; code++) {
    x.fillStyle = '#000'; x.fillRect(0, 0, GW, GH);
    x.fillStyle = '#fff'; x.font = '13px VT323, monospace'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.fillText(String.fromCharCode(code), GW / 2, 10);
    const d = x.getImageData(0, 0, GW, GH).data;
    const bits = new Uint8Array(GW * GH);
    for (let i = 0; i < GW * GH; i++) bits[i] = d[i * 4] > 110 ? 1 : 0;
    rom.set(code, bits);
  }
  const mk = (fn) => { const b = new Uint8Array(GW * GH); for (let y = 0; y < GH; y++) for (let xx = 0; xx < GW; xx++) b[y * GW + xx] = fn(xx, y) ? 1 : 0; return b; };
  rom.set(BLOCK, mk(() => 1));
  rom.set(SHADE, mk((xx, y) => (xx + y) % 2 === 0));
  return rom;
}

function atlasFrom(rom) {
  const a = makeCanvas(128 * CW, CH);
  const x = a.getContext('2d');
  x.fillStyle = '#fff';
  for (const [code, bits] of rom) {
    for (let i = 0; i < GW * GH; i++) if (bits[i]) x.fillRect(code * CW + (i % GW) * S, ((i / GW) | 0) * S, S, S);
  }
  return a;
}

const wrap = (text, width = COLS - 4) => {
  const out = []; let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > width) { out.push(line.trim()); line = word; } else line += ' ' + word;
  }
  if (line.trim()) out.push(line.trim());
  return out;
};

const HELP = ['TRY THESE:', '  GLYPH    DRAW YOUR OWN CURSOR', '  ROM      SEE EVERY LETTER', '  MEMORY   WHY LETTERS?', '  RENDER   3D, IN LETTERS', '  COLOR    CHANGE THE PHOSPHOR', '  LS       LIST FILES', '  CLEAR    WIPE THE SCREEN', 'SOME COMMANDS ARE NOT LISTED.', ''];
const PHOSPHORS = [['#3dff7a', 'GREEN'], ['#ffb02e', 'AMBER'], ['#dfe8ff', 'WHITE']];
const MEMORY = { text: COLS * ROWS, dots: (COLS * 8 * ROWS * 12) / 8 };

export default (app) => new TerminalRoom(app, {
  id: 'terminal', title: 'The Character', years: '1965 – 1980', music: 'terminal',
  secrets: [
    { id: 'xyzzy', title: 'The magic word', hint: 'Old text adventures had a word that did nothing. Try typing it.', desc: 'A nod to the text adventures of the 1970s.' },
    { id: 'adventure', title: 'Out of the machine room', hint: 'One unlisted command is a game.', desc: 'You finished the text adventure.' },
  ],
  notes: [
    { title: 'Why letters came first', body: [
      'In the 1960s and 70s memory was the most expensive part of a computer. A picture needs memory for every dot; a page of text only needs one number per letter.',
      { eq: `this screen as letters   ${MEMORY.text.toLocaleString()} bytes\nthe same screen as dots   ${MEMORY.dots.toLocaleString()} bytes` },
      'The shapes of the letters were stored once, on a small chip called a character generator.',
    ] },
    { title: 'How a letter reaches the glass', body: [
      'The beam paints the screen one thin line at a time. For each line it looks up which letter sits in each box, fetches one row of that letter’s dots, and switches on and off as it passes.',
    ] },
  ],
}, { stations: ['terminal'] });

class TerminalRoom extends HallRoom {
  async load() {
    super.load();
    try { await document.fonts.load('13px VT323'); } catch { /* fall back to the system font */ }
    this.rom = buildROM();
    this.atlas = atlasFrom(this.rom);
    this.device = this.hall.device('terminal');
    this.screen = this.device.screen;
    this.screen.resize(W, H);
    this.screen.setProfile({ tint: PHOSPHORS[0][0], mono: 1, scan: 0.5, mask: 0.12, glow: 0.65, curv: 0.22, noise: 0.03, bright: 1.25, res: [W, H] });
    this.phosphor = 0;
    this.lines = [];
    this.queue = [];
    this.typing = null;
    this.input = '';
    this.mode = 'shell';
    this.adventure = null;
    this.hidden = h('input', { id: 'term-input', autocapitalize: 'characters', autocomplete: 'off', 'aria-label': 'Type into the terminal' });
  }

  transitionFrom(from) { return from?.id === 'opening' ? 'none' : super.transitionFrom(from); }

  enter(scope, ctx) {
    const fromOpening = ctx.fromId === 'opening';
    if (fromOpening) {
      // the opening ends on a single dot: it is this terminal's cursor, seen from very close
      this.hall.setActive(['terminal']);
      this.hall.goTo(this.hall.view('terminal', 'glass'), { duration: 0 });
      this.screen.power(0.003, 0);
      this._powerOn(scope).then((ok) => ok && this.hall.goTo(this.hall.view('terminal', 'main'), { duration: 4.2, lift: 0 }));
    } else this.arrive(ctx, 'terminal');
    this.device.setPowered(true);
    if (!fromOpening && !this.screen.powered) this._powerOn(scope);
    if (!this.lines.length) this.print(['MUSEUM OF GRAPHICS', 'TERMINAL READY.', '']);
    scope.mount(this.hidden, document.body);
    scope.listen(this.hidden, 'input', () => { const v = this.hidden.value; this.hidden.value = ''; for (const ch of v) this.typeChar(ch); });
    scope.listen(this.hidden, 'keydown', (e) => { if (e.key === 'Enter' || e.key === 'Backspace') { e.preventDefault(); this.key(e, true); } e.stopPropagation(); });
    scope.add(() => { this.mode = 'shell'; this.hover = null; this.hidden.blur(); });
    this.app.audio.hum(true);
    scope.add(() => this.app.audio.hum(false));

    this.tour = this.startTour(scope, [
      { caption: 'This screen can’t draw lines or shapes. It can only put letters into boxes.', duration: 6.5,
        enter: () => { this.mode = 'shell'; this.showGrid = 1; } },
      { caption: 'Each letter is a tiny picture made of dots.', duration: 6.5,
        enter: () => { this.mode = 'shell'; this.demoInspect = true; this.hall.goTo(this.hall.view('terminal', 'screen'), { duration: 1.4, lift: 0 }); },
        exit: () => { this.demoInspect = false; this.hover = null; } },
      { caption: 'All 95 of those pictures fit on one small memory chip.', duration: 6,
        enter: () => { this.mode = 'rom'; this.modeT = 0; } },
      { caption: `Storing letters instead of dots took ${Math.round(MEMORY.dots / MEMORY.text)}× less memory, and memory was expensive.`, duration: 7,
        enter: () => { this.mode = 'memory'; this.modeT = 0; } },
      { caption: 'Your turn: click dots to design your own cursor, then press Save.',
        enter: () => this.openGlyph() },
      { caption: 'Letters can even fake 3D: emptier letters for darker parts.', duration: 8,
        enter: () => { this.mode = 'render'; this.modeT = 0; this.hall.goTo(this.hall.view('terminal', 'main'), { duration: 1.2, lift: 0 }); } },
      { caption: 'It’s a working terminal. Click the screen, type HELP and press Return.',
        enter: () => { this.mode = 'shell'; } },
    ]);
  }

  async _powerOn(scope) {
    this.screen.power(0.003, 0);
    if (!(await scope.wait(0.8))) return false;
    this.app.audio.powerOn();
    if (!(await scope.tween(0.22, (k) => this.screen.power(Math.max(0.003, k), 0.01)).promise)) return false;
    return scope.tween(0.38, (k) => this.screen.power(1, Math.max(0.01, k))).promise;
  }

  // ----------------------------------------------------------------- output
  print(lines, speed = 0.012) { for (const text of lines) this.queue.push({ text, speed }); }

  flush() {
    if (this.typing) { this.push(this.typing.full); this.typing = null; }
    while (this.queue.length) this.push(this.queue.shift().text);
  }

  push(text) {
    this.lines.push(text.slice(0, COLS - 2));
    while (this.lines.length > ROWS - 4) this.lines.shift();
  }

  // ----------------------------------------------------------------- input
  typeChar(ch) {
    if (this.mode === 'glyph') return;
    if (this.mode !== 'shell') this.mode = 'shell';
    this.tour?.pause();
    if (this.queue.length || this.typing) this.flush();
    const code = ch.charCodeAt(0);
    if (ch.length === 1 && code >= 32 && code < 127 && this.input.length < COLS - 6) {
      this.input += ch.toUpperCase();
      this.device.pressKey(ch);
      this.app.audio.key();
    }
  }

  key(e, down) {
    if (!down) return false;
    if (this.mode === 'glyph') {
      if (e.key === 'Enter') { this.saveGlyph(); return true; }
      if (e.key === 'Escape') { this.mode = 'shell'; return true; }
      return false;
    }
    if (e.key === 'Enter') {
      if (this.mode !== 'shell') this.mode = 'shell';
      this.flush();
      const cmd = this.input.trim(); this.input = '';
      this.app.audio.key(); this.device.pressKey(' ');
      this.push('> ' + cmd);
      if (cmd) this.run(cmd);
      this.tour?.pause();
      return true;
    }
    if (e.key === 'Backspace') { this.input = this.input.slice(0, -1); this.app.audio.key(); return true; }
    if (e.key.length === 1) { this.typeChar(e.key); return true; }
    return false;
  }

  pointer(e) {
    if (e.type === 'down' && e.surface === this.screen && e.pointerType === 'touch' && this.mode === 'shell') this.hidden.focus({ preventScroll: true });
    if (this.mode === 'glyph') { this.glyphPointer(e); return; }
    if (e.type === 'down' && e.surface === this.screen) this.tour?.pause();
    if ((e.type === 'move' || e.type === 'down') && e.surface === this.screen && e.inside && this.mode === 'shell') {
      this.hover = { col: Math.floor(e.sx / CW), row: Math.floor(e.sy / CH) };
    } else if (e.type === 'move' && !e.surface) this.hover = null;
  }

  run(raw) {
    const app = this.app;
    const [cmd, ...args] = raw.toUpperCase().split(/\s+/);
    if (this.adventure) { this.adventureStep(raw.toUpperCase()); return; }
    switch (cmd) {
      case 'HELP': this.print(HELP); break;
      case 'GLYPH': this.openGlyph(); break;
      case 'ROM': this.mode = 'rom'; this.modeT = 0; break;
      case 'MEMORY': this.mode = 'memory'; this.modeT = 0; break;
      case 'RENDER': this.mode = 'render'; this.modeT = 0; break;
      case 'COLOR': case 'COLOUR': case 'PHOSPHOR': {
        this.phosphor = (this.phosphor + 1) % PHOSPHORS.length;
        this.screen.setProfile({ tint: PHOSPHORS[this.phosphor][0] });
        this.print([`PHOSPHOR: ${PHOSPHORS[this.phosphor][1]}`, '']);
        break;
      }
      case 'LS': case 'DIR': this.print(['README.TXT  CURSOR.ROM  ADVENTURE', '']); break;
      case 'CAT': case 'TYPE':
        if ((args[0] || '').startsWith('README')) this.print([...wrap('EVERYTHING IN THIS MUSEUM IS NUMBERS DECIDING WHERE LIGHT GOES. WE START WITH THE SMALLEST PICTURE THERE IS: A LETTER.'), '']);
        else this.print(['TRY: CAT README.TXT', '']);
        break;
      case 'CLEAR': case 'CLS': this.lines = []; this.queue = []; break;
      case 'ADVENTURE': this.adventureStart(); break;
      case 'XYZZY': this.print(['NOTHING HAPPENS.', '']); app.secret('xyzzy', 'The magic word', 'A nod to the text adventures of the 1970s.'); break;
      case 'HELLO': case 'HI': this.print(['HELLO. I ONLY KNOW 95 SHAPES,', 'BUT I MEAN IT.', '']); break;
      default: this.print([`? ${cmd.slice(0, 20)}: UNKNOWN. TYPE HELP.`, '']); app.audio.bell();
    }
  }

  // ----------------------------------------------------------------- glyph editor
  openGlyph() {
    this.mode = 'glyph';
    this.edit = this.app.state.glyph.slice();
    this.app.audio.bell();
  }

  glyphLayout() { const s = 40; return { x: 90, y: 130, s, save: { x: 600, y: 520, w: 240, h: 70 } }; }

  glyphPointer(e) {
    if (e.surface !== this.screen) { if (e.type === 'up') this.paint = undefined; return; }
    const g = this.glyphLayout();
    const gx = Math.floor((e.sx - g.x) / g.s), gy = Math.floor((e.sy - g.y) / g.s);
    const inside = gx >= 0 && gx < GW && gy >= 0 && gy < GH;
    if (e.type === 'down') {
      this.tour?.pause();
      const b = g.save;
      if (e.sx >= b.x && e.sx <= b.x + b.w && e.sy >= b.y && e.sy <= b.y + b.h) { this.saveGlyph(); return; }
      if (inside) this.paint = this.edit[gy * GW + gx] ? 0 : 1;
    }
    if (e.type === 'up') this.paint = undefined;
    if ((e.type === 'down' || e.type === 'move') && inside && this.paint !== undefined && this.edit[gy * GW + gx] !== this.paint) {
      this.edit[gy * GW + gx] = this.paint;
      this.app.audio.key();
    }
  }

  saveGlyph() {
    this.app.state.setGlyph(this.edit);
    this.mode = 'shell';
    this.print(['YOUR CURSOR IS SAVED.', 'IT WILL FOLLOW YOU THROUGH', 'THE MUSEUM.', '']);
    this.app.audio.chime([79, 84, 88], 'pulse50', 0.06);
    if (this.tour?.index === 4) this.tour.next();
  }

  // ----------------------------------------------------------------- adventure
  adventureStart() {
    this.adventure = { room: 'machine', inv: new Set(), card: true, open: false };
    this.print(['', 'ADVENTURE  (QUIT TO LEAVE)', '']);
    this.adventureLook();
  }

  adventureLook() {
    const a = this.adventure;
    const R = {
      machine: 'A DARK MACHINE ROOM. A PRINTER CHATTERS TO THE NORTH. A NARROW DOOR LEADS EAST.',
      printer: `THE PRINTER REPEATS: "THE KEY IS IN THE ROM."${a.card ? ' A PUNCHED CARD LIES HERE.' : ''} SOUTH LEADS BACK.`,
      vault: 'SHELVES OF TINY DOT GRIDS: EVERY LETTER LIVES HERE. ONE GRID IS EMPTY. A HEAVY DOOR LIES SOUTH.',
      door: `A DOOR MARKED "BEAM". ${a.open ? 'IT STANDS OPEN.' : 'IT IS LOCKED.'} NORTH LEADS BACK.`,
    };
    this.print([...wrap(R[a.room]), '']);
  }

  adventureStep(c) {
    const a = this.adventure;
    const map = { machine: { N: 'printer', E: 'vault' }, printer: { S: 'machine' }, vault: { W: 'machine', S: 'door' }, door: { N: 'vault' } };
    const dir = c.replace(/^GO /, '');
    if (/^(N|S|E|W|NORTH|SOUTH|EAST|WEST)$/.test(dir)) {
      const next = map[a.room][dir[0]];
      if (next) { a.room = next; this.app.audio.footstep(); this.adventureLook(); } else this.print(['YOU CAN’T GO THAT WAY.', '']);
      return;
    }
    if (c === 'LOOK' || c === 'L') return this.adventureLook();
    if (c === 'QUIT' || c === 'Q') { this.adventure = null; this.print(['YOU LEAVE THE ADVENTURE.', '']); return; }
    if (/^(I|INV|INVENTORY)$/.test(c)) return this.print([a.inv.size ? `YOU CARRY: ${[...a.inv].join(', ')}` : 'YOU CARRY NOTHING.', '']);
    if (/^(TAKE|GET) CARD/.test(c) && a.room === 'printer' && a.card) { a.card = false; a.inv.add('CARD'); return this.print(['TAKEN. IT IS PUNCHED IN A GRID,', '8 HOLES WIDE AND 12 TALL.', '']); }
    if (/^(USE|INSERT|PUT) CARD/.test(c) && a.room === 'vault' && a.inv.has('CARD')) {
      a.inv.delete('CARD'); a.inv.add('KEY'); this.app.audio.chime([67, 72, 76], 'pulse50');
      return this.print([...wrap('YOU SLIDE THE CARD INTO THE EMPTY GRID. LIGHT THROUGH ITS HOLES FORMS A NEW LETTER: A KEY.'), '']);
    }
    if (/^(USE KEY|UNLOCK|OPEN)/.test(c) && a.room === 'door') {
      if (!a.inv.has('KEY')) return this.print(['THE DOOR IS LOCKED.', '']);
      a.open = true; this.adventure = null;
      this.print([...wrap('THE DOOR SWINGS OPEN. BEYOND IT, ONE ELECTRON WAITS TO BE AIMED.'), '', '*** YOU WIN ***', '']);
      this.app.secret('adventure', 'Out of the machine room', 'You finished the text adventure.');
      return;
    }
    if (c === 'XYZZY') { this.app.secret('xyzzy', 'The magic word', 'A nod to the text adventures of the 1970s.'); return this.print(['A HOLLOW VOICE SAYS "WRONG GAME."', '']); }
    this.print(['TRY: LOOK, N/S/E/W, TAKE, USE,', 'INV OR QUIT.', '']);
  }

  // ----------------------------------------------------------------- frame
  update(dt, t) {
    if (!this.typing && this.queue.length) { const q = this.queue.shift(); this.typing = { full: q.text, shown: '', speed: q.speed, acc: 0 }; }
    if (this.typing) {
      const ty = this.typing;
      ty.acc += dt;
      while (ty.acc > ty.speed && ty.shown.length < ty.full.length) {
        ty.acc -= ty.speed;
        ty.shown += ty.full[ty.shown.length];
        if (ty.shown.length % 3 === 0) this.app.audio.tone(2200 + Math.random() * 300, 0.012, { wave: 'square', vel: 0.01 });
      }
      if (ty.shown.length >= ty.full.length) { this.push(ty.full); this.typing = null; }
    }
    this.modeT = (this.modeT || 0) + dt;
    this.showGrid = Math.max(0, (this.showGrid || 0) - dt * 0.25);
    if (this.demoInspect) {
      // a guided hover that visits a few letters on the first line
      const k = Math.floor(this.tour.time / 1.6) % 4;
      this.hover = { row: 2, col: 2 + [0, 2, 6, 9][k] };
    }
    this.draw(t);
    this.screen.commit(t);
  }

  grid() {
    const g = Array.from({ length: ROWS }, () => new Array(COLS).fill(32));
    const put = (r, c, s) => { for (let i = 0; i < s.length && c + i < COLS; i++) g[r][c + i] = s.charCodeAt(i); };
    const all = this.typing ? [...this.lines, this.typing.shown] : this.lines;
    const vis = all.slice(-(ROWS - 4));
    vis.forEach((l, i) => put(i + 2, 2, l));
    this.cursorAt = null;
    if (!this.queue.length && !this.typing) {
      const row = Math.min(vis.length + 2, ROWS - 2);
      put(row, 2, '> ' + this.input);
      this.cursorAt = [row, 4 + this.input.length];
    }
    return g;
  }

  blit(ctx, code, col, row) { ctx.drawImage(this.atlas, code * CW, 0, CW, CH, col * CW, row * CH, CW, CH); }

  drawBits(ctx, bits, x, y, s) {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < GW * GH; i++) if (bits[i]) ctx.fillRect(x + (i % GW) * s, y + ((i / GW) | 0) * s, s, s);
  }

  text(ctx, str, col, row) { for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); if (c !== 32) this.blit(ctx, c, col + i, row); } }

  draw(t) {
    const ctx = this.screen.ctx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    switch (this.mode) {
      case 'rom': this.drawROM(ctx); return;
      case 'memory': this.drawMemory(ctx); return;
      case 'render': this.drawRender(ctx, t); return;
      case 'glyph': this.drawGlyph(ctx, t); return;
      default: break;
    }
    const g = this.grid();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r][c] !== 32) this.blit(ctx, g[r][c], c, r);
    if (this.cursorAt && Math.floor(t * 1.9) % 2 === 0) this.drawBits(ctx, this.app.state.glyph, this.cursorAt[1] * CW, this.cursorAt[0] * CH, S);
    if (this.showGrid > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * Math.min(1, this.showGrid * 2)})`; ctx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CW + 0.5, 0); ctx.lineTo(c * CW + 0.5, H); ctx.stroke(); }
      for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CH + 0.5); ctx.lineTo(W, r * CH + 0.5); ctx.stroke(); }
    }
    if (this.hover) this.drawInspector(ctx, g);
  }

  drawInspector(ctx, g) {
    const { col, row } = this.hover;
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(col * CW + 1, row * CH + 1, CW - 2, CH - 2);
    const code = g[row][col];
    const bits = this.rom.get(code);
    if (!bits || code === 32) return;
    const s = 26, bw = GW * s + 32, bh = GH * s + 32;
    const right = col * CW < W / 2;
    const bx = right ? W - bw - 40 : 40;
    const by = Math.max(20, Math.min(H - bh - 20, (row + 2) * CH));
    ctx.fillStyle = '#000'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
    ctx.beginPath(); ctx.moveTo(col * CW + CW / 2, (row + 1) * CH); ctx.lineTo(right ? bx : bx + bw, by + 20); ctx.stroke();
    for (let i = 0; i < GW * GH; i++) {
      ctx.fillStyle = bits[i] ? '#fff' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx + 16 + (i % GW) * s, by + 16 + ((i / GW) | 0) * s, s - 3, s - 3);
    }
  }

  drawROM(ctx) {
    this.text(ctx, 'THE CHARACTER CHIP: 95 LETTERS', 2, 1);
    const s = 3, cw = GW * s + 14, ch = GH * s + 14;
    const shown = Math.min(95, Math.floor(this.modeT * 40));
    let i = 0;
    for (let code = 32; code < 127 && i < shown; code++, i++) {
      const cx = 40 + (i % 19) * (cw + 8), cy = 110 + Math.floor(i / 19) * (ch + 16);
      const bits = this.rom.get(code);
      for (let k = 0; k < GW * GH; k++) {
        ctx.fillStyle = bits[k] ? '#fff' : 'rgba(255,255,255,0.08)';
        ctx.fillRect(cx + (k % GW) * s, cy + ((k / GW) | 0) * s, s - 1, s - 1);
      }
    }
    this.text(ctx, `${(95 * 12).toLocaleString()} BYTES IN TOTAL`, 2, ROWS - 2);
  }

  drawMemory(ctx) {
    const k = Math.min(1, this.modeT / 2.5);
    this.text(ctx, 'ONE SCREENFUL, STORED TWO WAYS', 2, 2);
    this.text(ctx, 'AS LETTERS', 2, 6);
    this.text(ctx, `${MEMORY.text.toLocaleString()} BYTES`, 2, 7);
    const unit = 34 / (MEMORY.dots / MEMORY.text);
    const textBlocks = Math.max(1, Math.round(unit * Math.min(1, k * 6)));
    for (let i = 0; i < textBlocks; i++) this.blit(ctx, BLOCK, 2 + i, 8);
    this.text(ctx, 'AS DOTS', 2, 12);
    this.text(ctx, `${MEMORY.dots.toLocaleString()} BYTES`, 2, 13);
    const dotBlocks = Math.round(34 * k);
    for (let i = 0; i < dotBlocks; i++) this.blit(ctx, BLOCK, 2 + i, 14);
    if (k >= 1) this.text(ctx, `${Math.round(MEMORY.dots / MEMORY.text)} TIMES MORE`, 2, 17);
  }

  drawGlyph(ctx, t) {
    const g = this.glyphLayout();
    this.text(ctx, 'DRAW YOUR CURSOR', 2, 1);
    for (let i = 0; i < GW * GH; i++) {
      ctx.fillStyle = this.edit[i] ? '#fff' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(g.x + (i % GW) * g.s + 2, g.y + ((i / GW) | 0) * g.s + 2, g.s - 4, g.s - 4);
    }
    // the bytes it costs, one per row
    for (let y = 0; y < GH; y++) {
      let b = 0;
      for (let x = 0; x < GW; x++) b = (b << 1) | this.edit[y * GW + x];
      this.text(ctx, b.toString(2).padStart(8, '0'), 17, 4 + y);
    }
    this.text(ctx, 'ACTUAL SIZE', 27, 4);
    if (Math.floor(t * 1.9) % 2 === 0) this.drawBits(ctx, this.edit, 27 * CW, 6 * CH, S);
    const b = g.save;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(b.x, b.y, b.w, b.h);
    this.text(ctx, 'SAVE', 27, 15);
  }

  // 3D in letters: a lit, spinning octahedron rasterised at character resolution
  drawRender(ctx, t) {
    const cols = COLS, rows = ROWS - 2;
    const ramp = ' .:-=+*#%@';
    const zbuf = new Float32Array(cols * rows).fill(-1e9);
    const out = new Uint8Array(cols * rows).fill(32);
    const a = t * 0.9, b = t * 0.55;
    const rot = ([x, y, z]) => {
      const y1 = y * Math.cos(b) - z * Math.sin(b), z1 = y * Math.sin(b) + z * Math.cos(b);
      return [x * Math.cos(a) + z1 * Math.sin(a), y1, -x * Math.sin(a) + z1 * Math.cos(a)];
    };
    const V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => rot(v.map((q) => q * 1.15)));
    const F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
    const L = [Math.cos(t * 0.7) * 0.6, 0.55, 0.6];
    const proj = ([x, y, z]) => { const d = 3.4 / (3.4 - z); return [cols / 2 + x * d * 11, rows / 2 - y * d * 7, z]; };
    for (const f of F) {
      const [A, B, C] = f.map((i) => V[i]);
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const nl = Math.hypot(...n); n = n.map((q) => q / nl);
      if (n[2] < 0) continue;
      const lum = Math.max(0.05, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      const P = [A, B, C].map(proj);
      const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
      const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(cols - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(rows - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
        const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2], k = y * cols + x;
        if (z > zbuf[k]) { zbuf[k] = z; out[k] = ramp.charCodeAt(Math.min(9, Math.floor(lum * 9.99))); }
      }
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const c = out[y * cols + x]; if (c !== 32) this.blit(ctx, c, x, y + 1); }
    this.text(ctx, ramp.trim(), 2, ROWS - 1);
  }
}
