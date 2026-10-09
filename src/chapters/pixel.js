import { makeBitmapFont } from '../gfx/bitmapfont.js';

// ROOM 03 — The Pixel. A real indexed framebuffer: 256x192 numbers, each one
// an index into a 16-entry palette. Everything on this screen, including the
// editor, is drawn by writing numbers into that buffer.

const FW = 256, FH = 192, S = 4;
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const to4 = (v) => Math.round(v / 17);
const toHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

// editor geometry, in framebuffer pixels
const ED = { x: 8, y: 22, c: 6 };
const SW = { x: 8, y: 131, w: 14, h: 9 };
const PAL = { x: 8, y: 152, w: 12, h: 8 };
const PF = { x: 112, y: 22, w: 136, h: 158 };

export default {
  id: 'pixel', title: 'The Pixel', year: '1977–1990', tagline: 'Memory got cheap enough to remember every dot. Each dot is just a number.',
  mode: 'screen', ui: 'bit84', music: 'chip', journey: 'crt',
  monitorProfile: { tint: '#ffffff', mono: 0, scan: 0.45, mask: 0.35, glow: 0.35, curv: 0.2, noise: 0.02, flicker: 0.2, bright: 1.15, res: [256, 192] },
  secrets: [
    { id: 'hidden', title: 'Hidden in plain sight', hint: 'Two palette entries start out identical. Change the one nobody uses.', desc: 'Pixels drawn in a colour identical to the background are invisible until the palette changes.' },
    { id: 'blackout', title: 'Numbers without colour', hint: 'What if every palette entry were the same colour?', desc: 'The picture is still there. It is only numbers until the palette gives them colour.' },
  ],
  notes: [
    {
      title: 'The framebuffer', meta: 'Raster displays',
      body: `<p>Instead of steering the beam along lines, a raster display sweeps it across the whole screen in the same zig-zag every frame, and switches it on and off. To know when, the computer keeps a block of memory with one number per dot: the <b>framebuffer</b>.</p>
      <div class="eq">this screen   256 × 192 dots × 4 bits = 24,576 bytes
your sprite   16 × 16 dots × 2 bits   =     64 bytes</div><p>A "pixel" (picture element) is one of those numbers. Drawing anything means writing numbers into memory.</p>`,
    },
    {
      title: 'Indexed colour', meta: 'The palette',
      body: `<p>Storing a full colour for every pixel was too expensive. Instead each pixel holds a small <b>index</b> (here 0 to 15), and a 16-entry <b>palette</b> says which colour each index means. Each palette entry here uses 4 bits each of red, green and blue: 4,096 possible colours, 16 at once.</p><p>Change one palette entry and every pixel with that number changes instantly, without touching the pixels. Try it on the swatches.</p>`,
    },
    {
      title: 'Palette cycling', meta: 'Animation for free',
      body: `<p>The moving grid on the right is never redrawn. Its pixels were painted once with indices 8 to 13. Each frame, the colours stored in those six palette slots are rotated by one, so the bands appear to flow.</p><p>Artists in the late 1980s used this to make waterfalls, fire and rain move on machines too slow to redraw the screen.</p>`,
    },
    {
      title: 'Sprites', meta: 'Moving objects',
      body: `<p>A <b>sprite</b> is a small image drawn on top of the background. Index 0 means "transparent", so the background shows through. Many machines had hardware that overlaid sprites as the beam passed, without touching the framebuffer at all.</p><p>Games tested whether two sprites touched by comparing rectangles, called <b>hitboxes</b>. Turn them on to see them.</p>`,
    },
  ],

  async init(app) {
    try { await document.fonts.load('8px Silkscreen'); } catch (e) {}
    this.app = app;
    this.font = makeBitmapFont('8px Silkscreen, monospace', 6, 8, 7);
    this.fb = new Uint8Array(FW * FH);
    this.bg = new Uint8Array(FW * FH);
    this.small = document.createElement('canvas'); this.small.width = FW; this.small.height = FH;
    this.sx = this.small.getContext('2d');
    this.img = this.sx.createImageData(FW, FH);
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.selColor = 1; this.selPal = 1;
    this.cycling = true; this.hitboxes = false; this.gridOn = false;
    this.cyc = 0;
    const st = app.state;
    this.palette = [
      [0, 0, 0], hex(st.palette[1]), hex(st.palette[2]), hex(st.palette[3]),
      [10, 14, 40], [238, 238, 238], [102, 102, 119], [10, 14, 40],
      [0, 238, 255], [0, 153, 255], [68, 68, 255], [153, 34, 255], [255, 0, 204], [255, 51, 119],
      [34, 34, 68], [255, 170, 34],
    ].map((c) => c.map((v) => to4(v) * 17));
    this.buildBackground();
    this.sprites = Array.from({ length: 5 }, (_, i) => ({ x: PF.x + 10 + i * 22, y: PF.y + 20 + (i % 3) * 30, vx: (i % 2 ? 1 : -1) * (14 + i * 6), vy: 18 + i * 5 }));
  },

  buildBackground() {
    const b = this.bg; b.fill(4);
    // playfield: sky with a hidden message, then a perspective grid floor whose
    // depth bands use cycling indices 8..13
    const hz = PF.y + 70;
    for (let y = PF.y; y < PF.y + PF.h; y++) for (let x = PF.x; x < PF.x + PF.w; x++) {
      let c = 4;
      if (y >= hz) {
        const dy = y - hz + 1;
        const z = 320 / dy;                      // depth of this scanline
        const wx = (x - (PF.x + PF.w / 2)) * z / 40; // world x
        const band = Math.floor(z * 0.9) % 6;
        const gridLine = Math.abs(wx - Math.round(wx)) < 0.04 * z || (Math.floor(z * 2) % 4 === 0);
        c = gridLine ? 8 + band : 14;
      } else if (y > hz - 3) c = 8;
      b[y * FW + x] = c;
    }
    // a sun of concentric cycling rings
    const cx = PF.x + PF.w / 2, cy = hz - 6;
    for (let y = PF.y; y < hz - 2; y++) for (let x = PF.x; x < PF.x + PF.w; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.1);
      if (d < 30 && (y % 4 !== 0 || y < cy - 18)) b[y * FW + x] = 8 + (Math.floor(d / 3) % 6);
    }
    // the hidden message, painted in index 7 (same colour as the sky, for now)
    this.font.text(b, FW, 'NOTHING IS', PF.x + 8, PF.y + 6, 7);
    this.font.text(b, FW, 'HIDDEN FROM', PF.x + 8, PF.y + 16, 7);
    this.font.text(b, FW, 'THE PALETTE', PF.x + 8, PF.y + 26, 7);
    // frame
    for (let x = PF.x - 1; x <= PF.x + PF.w; x++) { b[(PF.y - 1) * FW + x] = 5; b[(PF.y + PF.h) * FW + x] = 5; }
    for (let y = PF.y - 1; y <= PF.y + PF.h; y++) { b[y * FW + PF.x - 1] = 5; b[y * FW + PF.x + PF.w] = 5; }
  },

  enter(app) {
    const m = app.monitor;
    m.resizeCanvas(FW * S, FH * S); m.setProfile(this.monitorProfile);
    m.uniforms.uPowerX.value = 1; m.uniforms.uPowerY.value = 1; m.setPowered(true);
    app.ui.showChrome(true);
    this.buildControls();
  },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Palette');
    this.obj = [ui.objective('Paint your sprite (left grid)'), ui.objective('Change a palette colour')];
    this.palLabel = ui.hint('');
    this.rgb = ['Red', 'Green', 'Blue'].map((n, k) => ui.slider(n, { min: 0, max: 15, step: 1, value: this.palette[this.selPal][k] / 17, fmt: (v) => v.toString(16).toUpperCase() }, (v) => this.setRGB(k, v)));
    const r = ui.row();
    this.cycT = ui.toggle('Palette cycling', this.cycling, (v) => (this.cycling = v), r);
    ui.toggle('Hitboxes', this.hitboxes, (v) => (this.hitboxes = v), r);
    ui.toggle('Pixel grid', this.gridOn, (v) => (this.gridOn = v), r);
    const r2 = ui.row();
    ui.button('Mirror', () => this.mirror(), r2);
    ui.button('Clear', () => { this.app.state.sprite.fill(0); this.app.state.spriteEdited = true; this.app.state.save(); }, r2);
    this.memo = ui.readout();
    this.selectPal(1);
  },

  selectPal(i) {
    this.selPal = i;
    const names = { 0: 'black / transparent', 1: 'sprite colour 1', 2: 'sprite colour 2', 3: 'sprite colour 3', 4: 'sky', 5: 'white', 6: 'grey', 7: 'unused?', 14: 'grid floor', 15: 'amber' };
    this.palLabel.innerHTML = `Editing palette index <b>${i}</b> (${names[i] || 'cycling band ' + (i - 7)}). Each channel is 4 bits: 0 to F.`;
    this.rgb.forEach((s, k) => s.set(this.palette[i][k] / 17));
  },

  setRGB(k, v) {
    const p = this.palette[this.selPal]; p[k] = v * 17;
    this.obj[1].done();
    this.app.ready(true);
    if (this.selPal >= 1 && this.selPal <= 3) { this.app.state.palette[this.selPal] = toHex(p); this.app.state.save(); }
    const a = this.palette[7], b = this.palette[4];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 60) this.app.secret('hidden', 'Hidden in plain sight', 'Index 7 was the same colour as the sky. The message was there all along.');
    if (this.palette.every((c) => c[0] === this.palette[0][0] && c[1] === this.palette[0][1] && c[2] === this.palette[0][2])) this.app.secret('blackout', 'Numbers without colour', 'The picture is still in memory. It is only numbers until the palette gives them colour.');
  },

  mirror() {
    const sp = this.app.state.sprite;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) sp[y * 16 + 15 - x] = sp[y * 16 + x];
    this.app.state.spriteEdited = true; this.app.state.save();
  },

  pointer(type, p, e, app) {
    const x = Math.floor(p.x / S), y = Math.floor(p.y / S);
    if (type === 'up') { this.painting = false; return; }
    const ex = Math.floor((x - ED.x) / ED.c), ey = Math.floor((y - ED.y) / ED.c);
    const inEd = ex >= 0 && ex < 16 && ey >= 0 && ey < 16;
    if (type === 'down') {
      if (inEd) { this.painting = true; this.paintVal = e.button === 2 ? 0 : this.selColor; }
      for (let i = 0; i < 4; i++) if (x >= SW.x + i * (SW.w + 3) && x < SW.x + i * (SW.w + 3) + SW.w && y >= SW.y && y < SW.y + SW.h) { this.selColor = i; app.audio.click('chip'); if (i) this.selectPal(i); }
      for (let i = 0; i < 16; i++) {
        const px = PAL.x + (i % 8) * (PAL.w + 1), py = PAL.y + Math.floor(i / 8) * (PAL.h + 1);
        if (x >= px && x < px + PAL.w && y >= py && y < py + PAL.h) { this.selectPal(i); app.audio.click('chip'); }
      }
      // grab a sprite in the playfield
      for (const s of this.sprites) if (x >= s.x && x < s.x + 16 && y >= s.y && y < s.y + 16) { s.vx *= -1.4; s.vy = -Math.abs(s.vy) * 1.3; app.audio.jump(); }
    }
    if (this.painting && inEd) {
      const sp = app.state.sprite, k = ey * 16 + ex;
      if (sp[k] !== this.paintVal) { sp[k] = this.paintVal; app.state.spriteEdited = true; app.audio.tone(400 + this.paintVal * 200, 0.03, { wave: 'pulse25', vel: 0.04 }); this.obj[0].done(); this.app.ready(true); this._dirtySave = true; }
    }
    this.hover = { x, y };
  },

  update(dt, t, app) {
    if (this._dirtySave && !this.painting) { this._dirtySave = false; app.state.save(); }
    if (this.cycling) {
      this.cyc += dt * 8;
      while (this.cyc >= 1) { this.cyc -= 1; const band = this.palette.slice(8, 14); band.unshift(band.pop()); for (let i = 0; i < 6; i++) this.palette[8 + i] = band[i]; }
    }
    for (const s of this.sprites) {
      s.vy += 60 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < PF.x) { s.x = PF.x; s.vx = Math.abs(s.vx); }
      if (s.x > PF.x + PF.w - 16) { s.x = PF.x + PF.w - 16; s.vx = -Math.abs(s.vx); }
      if (s.y > PF.y + PF.h - 16) { s.y = PF.y + PF.h - 16; s.vy = -Math.max(50, Math.abs(s.vy) * 0.95); }
      if (s.y < PF.y) { s.y = PF.y; s.vy = Math.abs(s.vy); }
      s.vx = Math.sign(s.vx) * Math.min(Math.abs(s.vx), 60);
    }
  },

  draw(ctx, dt, t, app) {
    const fb = this.fb, f = this.font, sp = app.state.sprite;
    fb.set(this.bg);
    // header
    f.text(fb, FW, 'FRAMEBUFFER 256X192  16 COLOURS', 10, 9, 5);
    // sprite editor
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = sp[y * 16 + x];
      for (let yy = 0; yy < ED.c; yy++) for (let xx = 0; xx < ED.c; xx++) {
        const edge = xx === ED.c - 1 || yy === ED.c - 1;
        fb[(ED.y + y * ED.c + yy) * FW + ED.x + x * ED.c + xx] = edge ? 14 : v ? v : 0;
      }
    }
    f.text(fb, FW, 'SPRITE 16X16', ED.x, ED.y + 98, 6);
    // sprite colour swatches
    for (let i = 0; i < 4; i++) {
      const x0 = SW.x + i * (SW.w + 3);
      for (let y = 0; y < SW.h; y++) for (let x = 0; x < SW.w; x++) {
        const border = this.selColor === i && (x === 0 || y === 0 || x === SW.w - 1 || y === SW.h - 1);
        fb[(SW.y + y) * FW + x0 + x] = border ? 5 : i === 0 ? ((x >> 1) + (y >> 1)) & 1 ? 6 : 0 : i;
      }
    }
    f.text(fb, FW, 'PALETTE', PAL.x, PAL.y - 9 + 0, 6);
    for (let i = 0; i < 16; i++) {
      const px = PAL.x + (i % 8) * (PAL.w + 1), py = PAL.y + Math.floor(i / 8) * (PAL.h + 1);
      for (let y = 0; y < PAL.h; y++) for (let x = 0; x < PAL.w; x++) {
        const border = this.selPal === i && (x === 0 || y === 0 || x === PAL.w - 1 || y === PAL.h - 1);
        fb[(py + y) * FW + px + x] = border ? (Math.floor(t * 4) % 2 ? 5 : 0) : i;
      }
    }
    f.text(fb, FW, this.cycling ? 'CYCLING ON' : 'CYCLING OFF', 8, 172, this.cycling ? 15 : 6);
    if (this.cycling) f.text(fb, FW, '0 PX REDRAWN', 8, 181, 6);
    // sprites in the playfield (index 0 = transparent)
    for (const s of this.sprites) {
      const sx = Math.round(s.x), sy = Math.round(s.y);
      for (let i = 0; i < 256; i++) { const v = sp[i]; if (!v) continue; const x = sx + (i & 15), y = sy + (i >> 4); if (x >= PF.x && x < PF.x + PF.w && y >= PF.y && y < PF.y + PF.h) fb[y * FW + x] = v; }
      if (this.hitboxes) {
        for (let k = 0; k < 16; k++) { fb[sy * FW + sx + k] = 15; fb[(sy + 15) * FW + sx + k] = 15; fb[(sy + k) * FW + sx] = 15; fb[(sy + k) * FW + sx + 15] = 15; }
      }
    }
    if (this.hitboxes) {
      for (let a = 0; a < this.sprites.length; a++) for (let b = a + 1; b < this.sprites.length; b++) {
        const A = this.sprites[a], B = this.sprites[b];
        if (Math.abs(A.x - B.x) < 16 && Math.abs(A.y - B.y) < 16) f.text(fb, FW, 'HIT', Math.round((A.x + B.x) / 2), Math.round(Math.min(A.y, B.y)) - 9, 15);
      }
    }
    // indices -> colours through the palette
    const lut = this.palette.map(([r, g, b]) => (255 << 24) | (b << 16) | (g << 8) | r);
    for (let i = 0; i < fb.length; i++) this.u32[i] = lut[fb[i]];
    this.sx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.small, 0, 0, FW * S, FH * S);
    if (this.gridOn) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let x = 0; x < FW; x++) ctx.fillRect(x * S, 0, 1, FH * S);
      for (let y = 0; y < FH; y++) ctx.fillRect(0, y * S, FW * S, 1);
    }
    // hover loupe readout
    if (this.hover && this.memo) {
      const { x, y } = this.hover;
      if (x >= 0 && x < FW && y >= 0 && y < FH) {
        const idx = fb[y * FW + x], c = this.palette[idx];
        this.memo.textContent = `pixel (${x}, ${y})\nstored value   ${idx}  (binary ${idx.toString(2).padStart(4, '0')})\npalette[${idx}]     #${c.map((v) => (v / 17).toString(16)).join('').toUpperCase()}\n\nframebuffer    24,576 bytes\npalette        16 × 12 bits\nyour sprite    64 bytes`;
      }
    }
  },
};
