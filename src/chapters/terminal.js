import * as THREE from 'three';

// ROOM 01 — The character terminal. The screen cannot draw lines; it can only
// place one of 95 tiny dot patterns into each cell of a 60x30 grid. The font
// "ROM" is built at runtime by rasterizing a typeface into 8x12 bitmaps, and
// everything on this screen is drawn from those bits.

const COLS = 60, ROWS = 30, CW = 16, CH = 24, GW = 8, GH = 12;
const W = COLS * CW, H = ROWS * CH; // 960 x 720

const PHOSPHORS = {
  P1: { tint: '#3dff7a', name: 'P1 green' },
  P3: { tint: '#ffb02e', name: 'P3 amber' },
  P4: { tint: '#dfe8ff', name: 'P4 white' },
};

function buildROM() {
  const c = document.createElement('canvas'); c.width = GW; c.height = GH;
  const x = c.getContext('2d', { willReadFrequently: true });
  const rom = {};
  for (let code = 32; code < 127; code++) {
    x.fillStyle = '#000'; x.fillRect(0, 0, GW, GH);
    x.fillStyle = '#fff'; x.font = '13px VT323, monospace'; x.textBaseline = 'alphabetic'; x.textAlign = 'center';
    x.fillText(String.fromCharCode(code), GW / 2, 10);
    const d = x.getImageData(0, 0, GW, GH).data;
    const bits = new Uint8Array(GW * GH);
    for (let i = 0; i < GW * GH; i++) bits[i] = d[i * 4] > 110 ? 1 : 0;
    rom[code] = bits;
  }
  // box drawing helpers we use for frames
  const mk = (fn) => { const b = new Uint8Array(GW * GH); for (let y = 0; y < GH; y++) for (let xx = 0; xx < GW; xx++) b[y * GW + xx] = fn(xx, y) ? 1 : 0; return b; };
  rom[1] = mk((x, y) => y === 5 || y === 6);           // ─
  rom[2] = mk((x, y) => x === 3 || x === 4);           // │
  rom[3] = mk(() => 1);                                // █
  rom[4] = mk((x, y) => (x + y) % 2 === 0);            // ▒
  return rom;
}

function glyphAtlas(rom) {
  const a = document.createElement('canvas'); a.width = 128 * CW; a.height = CH;
  const x = a.getContext('2d');
  x.fillStyle = '#fff';
  for (const k in rom) {
    const bits = rom[k];
    for (let i = 0; i < GW * GH; i++) if (bits[i]) {
      const gx = i % GW, gy = (i / GW) | 0;
      x.fillRect(k * CW + gx * 2, gy * 2, 2, 2);
    }
  }
  return a;
}

const BOOT = [
  'MUSEUM OF GRAPHICS                         ROOM 01 / 17',
  'CHARACTER TERMINAL  ·  1960s-70s',
  '',
  'BEFORE PICTURES, THERE WERE LETTERS.',
  '',
  'THIS SCREEN CANNOT DRAW A LINE, A CURVE OR A COLOUR.',
  'IT CAN ONLY PLACE ONE OF 95 SHAPES INTO EACH OF',
  '1,800 BOXES. EVERY SHAPE IS 96 DOTS: ON OR OFF.',
  '',
  'HOVER OVER ANY LETTER TO SEE THE DOTS IT IS MADE OF.',
  'TYPE  HELP  AND PRESS RETURN.',
  '',
];

const HELP = [
  'COMMANDS',
  '  GLYPH      DESIGN YOUR OWN CURSOR, DOT BY DOT',
  '  ROM        SHOW THE WHOLE CHARACTER ROM',
  '  MEMORY     WHY TEXT CAME BEFORE PICTURES',
  '  PHOSPHOR   CHANGE THE SCREEN CHEMISTRY',
  '  RENDER     3D... IN LETTERS',
  '  LS         LIST FILES',
  '  CLEAR      CLEAR THE SCREEN',
  '  NEXT       GO TO THE NEXT ERA',
  'SOME COMMANDS ARE NOT LISTED.',
  '',
];

export default {
  id: 'terminal', title: 'The Character', year: '1960s–70s', tagline: 'Before pictures, there were letters.',
  mode: 'screen', ui: 'tui', music: 'terminal',
  monitorProfile: { tint: '#3dff7a', mono: 1, scan: 0.55, mask: 0.15, glow: 0.7, curv: 0.24, noise: 0.035, flicker: 0.5, bright: 1.25, res: [960, 720] },
  secrets: [
    { id: 'xyzzy', title: 'Magic word', hint: 'An old adventure game had a word that did nothing. Try typing it.', desc: 'A nod to 1970s text adventures.' },
    { id: 'adventure', title: 'Out of the machine room', hint: 'Some commands are not listed. One of them is an adventure.', desc: 'You escaped the text adventure.' },
    { id: 'ascii3d', title: 'Polygons in letters', hint: 'Ask the terminal to RENDER.', desc: 'Brightness, faked with ink density.' },
  ],
  notes: [
    {
      title: 'Why letters came first', meta: 'Memory, 1960s',
      body: `<p>Memory was the most expensive part of a computer. To remember a full picture, a machine has to store every dot. To remember a page of text, it only stores which letter goes in each box.</p>
      <div class="eq">THIS SCREEN AS TEXT     60 × 30 cells × 1 byte   =   1,800 bytes
THIS SCREEN AS DOTS     480 × 360 dots × 1 bit  =  21,600 bytes</div>
      <p>Twelve times cheaper. The picture of each letter is stored only once, in a read-only chip called the <b>character generator</b>. That is a tiny font that never changes.</p>`,
    },
    {
      title: 'How the beam draws a letter', meta: 'Character generator',
      body: `<p>The screen is painted one horizontal line at a time. For each line, the hardware looks up which letter sits in each box, fetches <i>one row</i> of that letter's dots from the ROM, and switches the beam on and off as it sweeps past.</p><p>Below, the beam paints one letter row by row. A real terminal does this for every box, 60 times a second.</p>`,
      diagram(cv) {
        const x = cv.getContext('2d'); let raf, t = 0;
        const rom = this._rom || (this._rom = buildROM());
        const bits = rom[71];
        const loop = () => {
          t += 0.6; x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, cv.width, cv.height);
          const s = 15, ox = 200, oy = 20; const pos = Math.floor(t) % (GW * GH + 30); const row = Math.floor(pos / GW), col = pos % GW;
          for (let i = 0; i < Math.min(pos, GW * GH); i++) if (bits[i]) { x.fillStyle = '#5dff8f'; x.fillRect(ox + (i % GW) * s, oy + ((i / GW) | 0) * s, s - 3, s - 3); }
          if (pos < GW * GH) {
            x.fillStyle = 'rgba(93,255,143,0.25)'; x.fillRect(ox - 20, oy + row * s, GW * s + 40, s - 3);
            x.fillStyle = '#fff'; x.beginPath(); x.arc(ox + col * s + 6, oy + row * s + 6, 5, 0, 7); x.fill();
            x.fillStyle = '#5dff8f'; x.font = '14px "JetBrains Mono"'; x.fillText('row ' + row + ': ' + Array.from(bits.slice(row * GW, row * GW + GW)).join(''), 20, 210);
          }
          raf = requestAnimationFrame(loop);
        };
        loop(); return () => cancelAnimationFrame(raf);
      },
    },
    {
      title: 'ASCII: letters as numbers', meta: '1963',
      body: `<p>Inside the machine, a letter is just a number. The American Standard Code for Information Interchange fixed which number means which letter, so different machines could talk.</p>
      <div class="eq">'A' = 65 = 1000001 (binary)
'a' = 97 = 1100001   ← only one bit differs from 'A'</div><p>Hover over letters on the screen to see their codes and the dots stored for them.</p>`,
    },
    {
      title: 'Phosphor', meta: 'Screen chemistry',
      body: `<p>The glow comes from a chemical coating on the inside of the glass. When the electron beam hits it, it lights up and then fades. Different coatings glow in different colours and fade at different speeds: green P1, amber P3, white P4.</p><p>Type <code>PHOSPHOR</code> to switch between them.</p>`,
    },
  ],

  async init(app) {
    try { await document.fonts.load('13px VT323'); } catch (e) {}
    this.rom = buildROM();
    this.atlas = glyphAtlas(this.rom);
    this.app = app;
    this.lines = [];
    this.queue = [];
    this.input = '';
    this.tmode = 'shell';
    this.used = new Set();
    this.hover = null;
    this.phosphor = 'P1';
    this.glyphEdit = null;
    this.adv = null;
    // hidden input for touch keyboards
    const hi = (this.hiddenInput = document.createElement('input'));
    hi.id = 'term-input'; hi.autocapitalize = 'characters'; hi.autocomplete = 'off'; hi.setAttribute('aria-label', 'Terminal input');
    Object.assign(hi.style, { position: 'fixed', left: '-100px', top: '50%', width: '10px', height: '10px', opacity: 0 });
    document.body.appendChild(hi);
    hi.addEventListener('input', () => { const v = hi.value; hi.value = ''; for (const ch of v) this.typeChar(ch); });
    hi.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Backspace') { this.key(e, true, app); e.preventDefault(); } e.stopPropagation(); });
  },

  enter(app, { kind }) {
    const m = app.monitor;
    m.resizeCanvas(W, H);
    m.setProfile(this.monitorProfile);
    m.uniforms.uTint.value.set(PHOSPHORS[this.phosphor].tint);
    this.buildControls(app);
    if (kind === 'boot') {
      // start nose-to-glass on the dot, power the tube, pull back into the room
      m.uniforms.uPowerX.value = 0; m.uniforms.uPowerY.value = 0;
      app.setRoomCamera(new THREE.Vector3(0, 0, 1.25), new THREE.Vector3(0, 0, 0));
      app.freeCam = true;
      app.audio.hum(true);
      setTimeout(() => {
        app.audio.powerOn(); m.setPowered(true);
        app.tween(0.22, (k) => { m.uniforms.uPowerX.value = k; }).then(() => app.tween(0.4, (k) => { m.uniforms.uPowerY.value = k; }));
        this.print(BOOT, 0.02);
      }, 900);
      setTimeout(() => {
        const f = app.framing(1);
        app.animateCam(f, 4.5);
        app.camAnim.done = () => { app.freeCam = false; };
        app.ui.showChrome(true);
      }, 2200);
      setTimeout(() => app.ui.titleCard(this.year, this.title, this.tagline), 4200);
    } else {
      m.uniforms.uPowerX.value = 1; m.uniforms.uPowerY.value = 1; m.setPowered(true);
      app.audio.hum(true);
      app.ui.showChrome(true);
      if (!this.lines.length) this.print(BOOT, 0.01);
    }
  },

  exit(app) {
    this.tmode = 'shell';
    this.hiddenInput.blur();
    app.audio.hum(false);
  },

  buildControls(app) {
    const ui = app.ui;
    ui.clearControls('Quick keys');
    this.obj = [ui.objective('Type HELP'), ui.objective('Design your cursor with GLYPH'), ui.objective('Try two more commands')];
    const r = ui.row();
    ['HELP', 'GLYPH', 'ROM', 'MEMORY', 'RENDER', 'LS'].forEach((c) => ui.button(c, () => this.run(c), r));
    this.phosSeg = ui.segmented('Phosphor', Object.keys(PHOSPHORS).map((k) => ({ v: k, l: k })), this.phosphor, (v) => this.setPhosphor(v));
    ui.hint('Click the screen to type on a touch device. Hover letters to inspect them.');
    this.refreshObjectives();
  },

  refreshObjectives() {
    if (!this.obj) return;
    this.obj[0].done(this.used.has('HELP'));
    this.obj[1].done(this.app.state.glyphEdited);
    const others = [...this.used].filter((c) => c !== 'HELP' && c !== 'GLYPH').length;
    this.obj[2].done(others >= 2);
    const ready = this.app.state.glyphEdited || this.used.size >= 3;
    this.app.ready(ready);
  },

  setPhosphor(p) {
    this.phosphor = p;
    this.app.monitor.uniforms.uTint.value.set(PHOSPHORS[p].tint);
    this.phosSeg?.set(p);
  },

  // ------------------------------------------------------------ output
  print(lines, speed = 0.012) {
    for (const l of lines) this.queue.push({ text: l, speed });
  },
  flush() {
    while (this.queue.length) { const q = this.queue.shift(); this.pushLine(q.partial !== undefined ? q.text : q.text); }
    this._typing = null;
  },
  pushLine(t) {
    this.lines.push(t);
    while (this.lines.length > ROWS - 5) this.lines.shift();
  },

  typeChar(ch) {
    if (this.tmode === 'render' || this.tmode === 'rom') { this.tmode = 'shell'; return; }
    if (this.tmode === 'glyph') return;
    if (this.queue.length) this.flush();
    if (this.input.length < COLS - 4 && ch.length === 1 && ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 127) {
      this.input += ch.toUpperCase();
      this.app.audio.key();
    }
  },

  key(e, down, app) {
    if (!down) return false;
    if (e.metaKey || e.ctrlKey) return false;
    if (this.tmode === 'render' || this.tmode === 'rom') { this.tmode = 'shell'; return true; }
    if (this.tmode === 'glyph') {
      if (e.key === 'Enter') { this.saveGlyph(); return true; }
      if (e.key === 'Escape') { this.tmode = 'shell'; this.print(['GLYPH EDITOR CLOSED.', '']); return true; }
      if (e.key.toLowerCase() === 'c') { this.glyphEdit.fill(0); app.audio.key(); return true; }
      if (e.key.toLowerCase() === 'i') { for (let i = 0; i < 96; i++) this.glyphEdit[i] ^= 1; app.audio.key(); return true; }
      return false;
    }
    if (e.key === 'Enter') {
      if (this.queue.length) this.flush();
      const cmd = this.input.trim(); this.input = '';
      app.audio.key();
      this.pushLine('> ' + cmd);
      if (cmd) this.run(cmd, true);
      return true;
    }
    if (e.key === 'Backspace') { this.input = this.input.slice(0, -1); app.audio.key(); return true; }
    if (e.key.length === 1) { this.typeChar(e.key); return true; }
    return false;
  },

  run(raw, typed = false) {
    const app = this.app;
    if (!typed) { this.pushLine('> ' + raw); app.audio.key(); }
    const [cmd, ...args] = raw.toUpperCase().split(/\s+/);
    if (this.adv) { this.advRun(raw.toUpperCase()); return; }
    const known = ['HELP', 'GLYPH', 'ROM', 'MEMORY', 'PHOSPHOR', 'RENDER', 'LS', 'CAT', 'CLEAR', 'NEXT', 'XYZZY', 'ADVENTURE', 'HELLO', 'HI', 'SUDO', 'DATE', 'WHO', 'WHOAMI', 'ABOUT'];
    if (known.includes(cmd)) this.used.add(cmd);
    switch (cmd) {
      case 'HELP': this.print(HELP); break;
      case 'ABOUT': this.print(['A CHARACTER TERMINAL. KEYBOARD IN, LETTERS OUT.', 'FOR TWO DECADES THIS WAS WHAT "USING A COMPUTER" MEANT.', '']); break;
      case 'GLYPH':
        this.tmode = 'glyph';
        this.glyphEdit = app.state.glyph.slice();
        app.audio.bell();
        break;
      case 'ROM': this.tmode = 'rom'; this.romT = 0; this.print(['THE CHARACTER ROM: 95 GLYPHS × 12 BYTES = 1,140 BYTES.', 'PRESS ANY KEY.', '']); break;
      case 'MEMORY':
        this.print([
          'THIS SCREEN, STORED AS TEXT:',
          '  60 × 30 CELLS × 1 BYTE ................. 1,800 BYTES',
          'THE SAME SCREEN, STORED AS DOTS:',
          '  480 × 360 DOTS × 1 BIT ................ 21,600 BYTES',
          '',
          'IN 1970 A KILOBYTE OF MEMORY COST AS MUCH AS A CAR.',
          'SO WE STORED LETTERS, AND KEPT THE PICTURES OF THE',
          'LETTERS IN ONE SMALL CHIP.',
          '',
        ]); break;
      case 'PHOSPHOR': {
        const keys = Object.keys(PHOSPHORS); const n = keys[(keys.indexOf(this.phosphor) + 1) % keys.length];
        this.setPhosphor(n);
        this.print([`PHOSPHOR SET TO ${PHOSPHORS[n].name.toUpperCase()}.`, '']); break;
      }
      case 'RENDER':
        this.tmode = 'render'; this.renderT = 0;
        app.secret('ascii3d', 'Polygons in letters', 'Brightness faked with ink density: " .:-=+*#%@".');
        break;
      case 'LS': this.print(['README.TXT    GLYPH.ROM    RENDER.BAS    ADVENTURE    NEXT.ERA', '']); break;
      case 'CAT':
        if ((args[0] || '').startsWith('README')) this.print(['README.TXT', 'EVERYTHING YOU WILL SEE IN THIS MUSEUM IS NUMBERS', 'DECIDING WHERE LIGHT GOES. WE START WITH THE', 'SMALLEST POSSIBLE PICTURE: A LETTER.', '']);
        else if ((args[0] || '').startsWith('ADVENTURE')) this.print(['ADVENTURE IS A PROGRAM. TYPE ITS NAME TO RUN IT.', '']);
        else this.print(['CAT WHAT? TRY  CAT README.TXT', '']);
        break;
      case 'CLEAR': this.lines = []; this.queue = []; break;
      case 'NEXT': case 'NEXT.ERA': this.print(['WARMING UP THE ELECTRON GUN...', '']); setTimeout(() => app.next(), 600); break;
      case 'XYZZY':
        this.print(['NOTHING HAPPENS.', '...', 'EXCEPT THAT YOU FOUND A SECRET.', '']);
        app.secret('xyzzy', 'Magic word', 'A nod to the text adventures of the 1970s.');
        break;
      case 'ADVENTURE': this.advStart(); break;
      case 'HELLO': case 'HI': this.print(['HELLO. I CAN ONLY SPEAK IN 95 SHAPES, BUT I MEAN IT.', '']); break;
      case 'SUDO': this.print(['THIS TERMINAL PREDATES SUDO. PERMISSION GRANTED ANYWAY.', '']); break;
      case 'DATE': this.print([new Date().toDateString().toUpperCase() + '  (THIS MACHINE THINKS IT IS 1974)', '']); break;
      case 'WHO': case 'WHOAMI': this.print(['YOU ARE A VISITOR. I AM A GRID OF 1,800 BOXES.', '']); break;
      case '': break;
      default: this.print([`? UNKNOWN COMMAND "${cmd.slice(0, 20)}". TYPE HELP.`, '']); app.audio.bell();
    }
    this.refreshObjectives();
  },

  saveGlyph() {
    const app = this.app;
    app.state.glyph = this.glyphEdit.slice();
    app.state.glyphEdited = true; app.state.save();
    this.tmode = 'shell';
    let hex = [];
    for (let y = 0; y < GH; y++) { let b = 0; for (let x = 0; x < GW; x++) b = (b << 1) | this.glyphEdit[y * GW + x]; hex.push(b.toString(16).padStart(2, '0').toUpperCase()); }
    this.print(['YOUR CURSOR IS NOW 12 BYTES OF YOUR OWN DESIGN:', '  ' + hex.join(' '), 'IT WILL FOLLOW YOU THROUGH THE MUSEUM.', '']);
    app.audio.chime([79, 84, 88], 'pulse50', 0.06);
    this.refreshObjectives();
  },

  // ------------------------------------------------------------ text adventure
  advStart() {
    this.adv = { room: 'machine', inv: new Set(), card: true, keyMade: false };
    this.print(['', 'ADVENTURE  (TYPE QUIT TO LEAVE)', '']);
    this.advLook();
  },
  advLook() {
    const R = {
      machine: 'A DARK MACHINE ROOM. RACKS HUM. A TELETYPE CHATTERS TO THE NORTH. A NARROW DOOR LEADS EAST.',
      teletype: 'THE TELETYPE PRINTS THE SAME LINE FOREVER: "THE KEY IS IN THE ROM." ' + (this.adv.card ? 'A PUNCHED CARD LIES HERE.' : '') + ' SOUTH LEADS BACK.',
      vault: 'THE ROM VAULT. SHELVES OF TINY GRIDS: EVERY LETTER LIVES HERE AS DOTS. ONE GRID IS EMPTY. A HEAVY DOOR IS TO THE SOUTH. WEST LEADS BACK.',
      door: 'A HEAVY DOOR STENCILLED "BEAM". ' + (this.adv.open ? 'IT STANDS OPEN.' : 'IT IS LOCKED.') + ' NORTH LEADS BACK.',
    };
    this.print(this.wrap(R[this.adv.room]).concat(['']));
  },
  wrap(s, w = COLS - 2) {
    const out = []; let line = '';
    s.split(' ').forEach((wd) => { if ((line + ' ' + wd).trim().length > w) { out.push(line.trim()); line = wd; } else line += ' ' + wd; });
    if (line.trim()) out.push(line.trim()); return out;
  },
  advRun(c) {
    const a = this.adv, app = this.app;
    const go = (d) => {
      const map = { machine: { N: 'teletype', E: 'vault' }, teletype: { S: 'machine' }, vault: { W: 'machine', S: 'door' }, door: { N: 'vault' } };
      const nx = map[a.room][d];
      if (nx) { a.room = nx; app.audio.footstep(); this.advLook(); } else this.print(['YOU CANNOT GO THAT WAY.', '']);
    };
    const w = c.replace(/^GO /, '');
    if (['N', 'NORTH', 'S', 'SOUTH', 'E', 'EAST', 'W', 'WEST'].includes(w)) return go(w[0]);
    if (c === 'LOOK' || c === 'L') return this.advLook();
    if (c === 'QUIT' || c === 'Q') { this.adv = null; this.print(['YOU LEAVE THE ADVENTURE.', '']); return; }
    if (c === 'INV' || c === 'I' || c === 'INVENTORY') return this.print([a.inv.size ? 'YOU CARRY: ' + [...a.inv].join(', ') : 'YOU CARRY NOTHING.', '']);
    if (/^(TAKE|GET) CARD/.test(c) && a.room === 'teletype' && a.card) { a.card = false; a.inv.add('CARD'); return this.print(['TAKEN. IT IS PUNCHED IN A GRID: 8 HOLES WIDE, 12 TALL.', '']); }
    if (/^(USE|INSERT|PUT) CARD/.test(c) && a.room === 'vault' && a.inv.has('CARD')) {
      a.inv.delete('CARD'); a.inv.add('KEY'); app.audio.chime([67, 72, 76], 'pulse50');
      return this.print(this.wrap('YOU SLIDE THE CARD INTO THE EMPTY GRID. LIGHT SHINES THROUGH ITS HOLES AND THE DOTS FORM A NEW GLYPH: A KEY. YOU TAKE IT.').concat(['']));
    }
    if (/^(USE KEY|UNLOCK|OPEN)/.test(c) && a.room === 'door') {
      if (!a.inv.has('KEY')) return this.print(['THE DOOR IS LOCKED.', '']);
      a.open = true; this.adv = null;
      this.print(this.wrap('THE DOOR SWINGS OPEN. BEYOND IT, IN THE DARK, A SINGLE ELECTRON WAITS TO BE AIMED. THE NEXT ROOM IS NOT MADE OF LETTERS.').concat(['', '*** YOU WIN ***  TYPE NEXT WHEN YOU ARE READY.', '']));
      app.secret('adventure', 'Out of the machine room', 'You finished the text adventure.');
      return;
    }
    if (c === 'XYZZY') { app.secret('xyzzy', 'Magic word', 'A nod to the text adventures of the 1970s.'); return this.print(['A HOLLOW VOICE SAYS "WRONG GAME."', '']); }
    this.print(['I DO NOT UNDERSTAND THAT. TRY LOOK, N/S/E/W, TAKE, USE, INV, QUIT.', '']);
  },

  // ------------------------------------------------------------ pointer
  pointer(type, p, e, app) {
    if (type === 'down' && e.pointerType === 'touch' && this.tmode === 'shell') this.hiddenInput.focus({ preventScroll: true });
    if (this.tmode === 'glyph') {
      const g = this.glyphGrid(); if (!g) return;
      const gx = Math.floor((p.x - g.x) / g.s), gy = Math.floor((p.y - g.y) / g.s);
      const inside = gx >= 0 && gx < GW && gy >= 0 && gy < GH;
      if (type === 'down' && inside) { this.paint = this.glyphEdit[gy * GW + gx] ? 0 : 1; }
      if (type === 'up') this.paint = undefined;
      if ((type === 'down' || type === 'move') && inside && this.paint !== undefined) {
        if (this.glyphEdit[gy * GW + gx] !== this.paint) { this.glyphEdit[gy * GW + gx] = this.paint; app.audio.key(); }
      }
      this.hover = null;
      return;
    }
    if (this.tmode === 'rom' && type === 'down') { this.tmode = 'shell'; return; }
    if (type === 'move' || type === 'down') {
      if (!p.inside) { this.hover = null; return; }
      this.hover = { col: Math.floor(p.x / CW), row: Math.floor(p.y / CH) };
    }
  },

  glyphGrid() { const s = 36; return { x: 80, y: (H - GH * s) / 2 + 10, s }; },

  // ------------------------------------------------------------ drawing
  cellText() {
    // build the visible grid of characters
    const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(32));
    const put = (r, c, s) => { for (let i = 0; i < s.length && c + i < COLS; i++) grid[r][c + i] = s.charCodeAt(i); };
    const all = this.lines.slice();
    if (this._typing) all.push(this._typing.shown);
    const vis = all.slice(-(ROWS - 5));
    vis.forEach((l, i) => put(i + 2, 3, l));
    const inRow = Math.min(vis.length + 2, ROWS - 2);
    if (!this.queue.length && !this._typing && this.tmode === 'shell') { put(inRow, 3, '> ' + this.input); this.cursorAt = [inRow, 5 + this.input.length]; }
    else this.cursorAt = null;
    return grid;
  },

  update(dt, t, app) {
    // teletype output
    if (!this._typing && this.queue.length) { const q = this.queue.shift(); this._typing = { full: q.text, shown: '', speed: q.speed, acc: 0 }; }
    if (this._typing) {
      const ty = this._typing; ty.acc += dt;
      while (ty.acc > ty.speed && ty.shown.length < ty.full.length) { ty.acc -= ty.speed; ty.shown += ty.full[ty.shown.length]; if (ty.shown.length % 3 === 0 && ty.full[ty.shown.length - 1] !== ' ') app.audio.tone(2200 + Math.random() * 400, 0.012, { wave: 'square', vel: 0.012 }); }
      if (ty.shown.length >= ty.full.length) { this.pushLine(ty.full); this._typing = null; }
    }
    this.renderT = (this.renderT || 0) + dt;
  },

  draw(ctx, dt, t, app) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (this.tmode === 'render') return this.drawRender(ctx, t);
    if (this.tmode === 'rom') return this.drawROM(ctx, t);
    const grid = this.cellText();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const code = grid[r][c]; if (code === 32) continue;
      ctx.drawImage(this.atlas, code * CW, 0, CW, CH, c * CW, r * CH, CW, CH);
    }
    // cursor: the visitor's own glyph
    if (this.cursorAt && Math.floor(t * 1.9) % 2 === 0) this.drawBits(ctx, this.app.state.glyph, this.cursorAt[1] * CW, this.cursorAt[0] * CH, 2);
    if (this.tmode === 'glyph') this.drawGlyphEditor(ctx, t);
    else if (this.hover) this.drawInspector(ctx, grid);
  },

  drawBits(ctx, bits, x, y, s) {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < GW * GH; i++) if (bits[i]) ctx.fillRect(x + (i % GW) * s, y + ((i / GW) | 0) * s, s, s);
  },

  drawInspector(ctx, grid) {
    const { col, row } = this.hover;
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    const code = grid[row][col];
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(col * CW + 0.5, row * CH + 0.5, CW - 1, CH - 1);
    if (code === 32 || code < 32) return;
    const bits = this.rom[code];
    const s = 9, bw = GW * s + 230, bh = GH * s + 24;
    let bx = col * CW + 24, by = row * CH - bh / 2;
    if (bx + bw > W - 8) bx = col * CW - bw - 10;
    by = Math.max(8, Math.min(H - bh - 8, by));
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    ctx.strokeStyle = '#fff'; ctx.strokeRect(bx - 4.5, by - 4.5, bw + 9, bh + 9);
    for (let i = 0; i < GW * GH; i++) {
      const x = bx + 8 + (i % GW) * s, y = by + 12 + ((i / GW) | 0) * s;
      ctx.fillStyle = bits[i] ? '#fff' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, s - 2, s - 2);
    }
    ctx.fillStyle = '#fff'; ctx.font = '20px VT323, monospace'; ctx.textBaseline = 'top';
    const tx = bx + GW * s + 22;
    const ch = String.fromCharCode(code);
    ctx.fillText(`'${ch}'  CODE ${code}`, tx, by + 10);
    ctx.fillText('BINARY ' + code.toString(2).padStart(7, '0'), tx, by + 34);
    ctx.fillText('HEX    ' + code.toString(16).toUpperCase(), tx, by + 58);
    let on = 0; bits.forEach((b) => (on += b));
    ctx.fillText(`${on} OF 96 DOTS LIT`, tx, by + 82);
  },

  drawGlyphEditor(ctx, t) {
    const g = this.glyphGrid();
    ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(40, 40, W - 80, H - 80);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(40, 40, W - 80, H - 80);
    ctx.fillStyle = '#fff'; ctx.font = '24px VT323, monospace'; ctx.textBaseline = 'top';
    ctx.fillText('GLYPH EDITOR  ·  8 × 12 DOTS  ·  CLICK OR DRAG TO PAINT', 80, 60);
    for (let i = 0; i < GW * GH; i++) {
      const x = g.x + (i % GW) * g.s, y = g.y + ((i / GW) | 0) * g.s;
      ctx.fillStyle = this.glyphEdit[i] ? '#fff' : 'rgba(255,255,255,0.1)';
      ctx.fillRect(x + 2, y + 2, g.s - 4, g.s - 4);
    }
    // byte column
    ctx.font = '22px VT323, monospace';
    for (let y = 0; y < GH; y++) {
      let b = 0; for (let x = 0; x < GW; x++) b = (b << 1) | this.glyphEdit[y * GW + x];
      ctx.fillText(b.toString(2).padStart(8, '0') + '  ' + b.toString(16).padStart(2, '0').toUpperCase(), g.x + GW * g.s + 30, g.y + y * g.s + 8);
    }
    // previews at 1x and 2x
    const px = 720, py = 200;
    ctx.fillText('ACTUAL SIZE', px, py - 34);
    this.drawBits(ctx, this.glyphEdit, px, py, 2);
    this.drawBits(ctx, this.glyphEdit, px + 40, py, 2);
    ctx.fillText('IN A LINE', px, py + 50);
    for (let k = 0; k < 5; k++) this.drawBits(ctx, this.glyphEdit, px + k * CW, py + 84, 2);
    ctx.fillText('RETURN  SAVE', px, 500);
    ctx.fillText('C       CLEAR', px, 526);
    ctx.fillText('I       INVERT', px, 552);
    ctx.fillText('ESC     CANCEL', px, 578);
    if (Math.floor(t * 2) % 2) ctx.fillText('_', px + 140, 500);
  },

  drawROM(ctx, t) {
    ctx.fillStyle = '#fff'; ctx.font = '22px VT323, monospace'; ctx.textBaseline = 'top';
    ctx.fillText('CHARACTER ROM  ·  95 GLYPHS  ·  1,140 BYTES  ·  CLICK OR PRESS A KEY TO CLOSE', 24, 16);
    const s = 3, cw = GW * s + 12, ch = GH * s + 22;
    let i = 0;
    for (let code = 32; code < 127; code++, i++) {
      const cx = 24 + (i % 19) * (cw + 8), cy = 56 + Math.floor(i / 19) * (ch + 12);
      const bits = this.rom[code];
      const reveal = Math.min(1, (t * 6 - i * 0.03) % 30);
      for (let k = 0; k < GW * GH; k++) {
        ctx.fillStyle = bits[k] ? '#fff' : 'rgba(255,255,255,0.07)';
        ctx.fillRect(cx + (k % GW) * s, cy + ((k / GW) | 0) * s, s - 1, s - 1);
      }
      ctx.font = '16px VT323, monospace';
      ctx.fillText(code.toString(16).toUpperCase(), cx + 2, cy + GH * s + 3);
    }
  },

  // ASCII 3D: a lit, rotating octahedron rasterized at character resolution.
  drawRender(ctx, t) {
    const cols = COLS, rows = ROWS - 3;
    const ramp = ' .:-=+*#%@';
    const zbuf = new Float32Array(cols * rows).fill(-1e9);
    const out = new Array(cols * rows).fill(32);
    const a = t * 0.9, b = t * 0.55;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const rot = ([x, y, z]) => { let y1 = y * cb - z * sb, z1 = y * sb + z * cb; let x2 = x * ca + z1 * sa, z2 = -x * sa + z1 * ca; return [x2, y1, z2]; };
    const V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => rot(v.map((q) => q * 1.15)));
    const F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
    const L = (() => { const l = [Math.cos(t * 0.7), 0.7, 0.8]; const n = Math.hypot(...l); return l.map((q) => q / n); })();
    const proj = ([x, y, z]) => { const d = 3.4 / (3.4 - z); return [cols / 2 + x * d * 18, rows / 2 - y * d * 10, z]; };
    for (const f of F) {
      const [A, B, C] = f.map((i) => V[i]);
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const nl = Math.hypot(...n); n = n.map((q) => q / nl);
      if (n[2] < 0) continue;
      const lum = Math.max(0.05, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      const P = [A, B, C].map(proj);
      const minx = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), maxx = Math.min(cols - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const miny = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), maxy = Math.min(rows - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
        const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2];
        const k = y * cols + x;
        if (z > zbuf[k]) { zbuf[k] = z; out[k] = ramp.charCodeAt(Math.min(9, Math.floor(lum * 9.99))); }
      }
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const code = out[y * cols + x]; if (code !== 32) ctx.drawImage(this.atlas, code * CW, 0, CW, CH, x * CW, (y + 1) * CH, CW, CH);
    }
    const msg = 'RENDER.BAS  ·  8 TRIANGLES  ·  BRIGHTNESS = " .:-=+*#%@"  ·  ANY KEY TO STOP';
    for (let i = 0; i < msg.length; i++) ctx.drawImage(this.atlas, msg.charCodeAt(i) * CW, 0, CW, CH, (1 + i) * CW, (ROWS - 1) * CH, CW, CH);
  },
};
