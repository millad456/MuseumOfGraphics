import { HallRoom } from '../hall/HallRoom.js';
import { makeCanvas } from '../gfx/three-utils.js';
import { seeded } from '../core/math.js';

// ROOM 06 · The illusion of a world.
// A flat grid map, one ray per column of the screen. Each ray walks from
// square to square until it hits a wall; the closer the wall, the taller
// the slice. The guided tour slows this down until every step is visible:
// the ray on the map, the slice it becomes, the strip of texture stretched
// onto it, and how flat sprites are hidden column by column.

const RW = 256, RH = 192;            // the 3D view, in game pixels
const SW = 1024, SH = 768;           // the PC screen canvas
const TEX = 32;
const FOV = 0.66;                    // camera plane length (about 66°)

// # wall · = floor · S start · E exit · P push wall (secret) · G gold wall
const MAP_ROWS = [
  '#############',
  '#S..#.....#GG',
  '#.#.#.###.#G.',
  '#.#...#...P..',
  '#.#####.#.#G.',
  '#.....#.#.#GG',
  '###.#.#.#.###',
  '#...#...#..E#',
  '#############',
];

const TILE = { '#': 1, P: 2, G: 3 };

function buildTextures() {
  const R = seeded(5);
  const mk = (fn) => {
    const c = makeCanvas(TEX, TEX), x = c.getContext('2d');
    fn(x);
    const d = x.getImageData(0, 0, TEX, TEX).data, u = new Uint32Array(TEX * TEX);
    for (let i = 0; i < TEX * TEX; i++) u[i] = (255 << 24) | (d[i * 4 + 2] << 16) | (d[i * 4 + 1] << 8) | d[i * 4];
    return { canvas: c, data: u };
  };
  const circuit = (x, base, line, dot) => {
    x.fillStyle = base; x.fillRect(0, 0, TEX, TEX);
    x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, 0, TEX, 1); x.fillRect(0, 0, 1, TEX);
    x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(0, TEX - 1, TEX, 1); x.fillRect(TEX - 1, 0, 1, TEX);
    for (let i = 0; i < 5; i++) {
      let px = 3 + Math.floor(R() * 26), py = 3 + Math.floor(R() * 26);
      x.fillStyle = line;
      for (let k = 0; k < 3; k++) {
        const len = 4 + Math.floor(R() * 10);
        if (R() > 0.5) { x.fillRect(px, py, len, 1); px = Math.min(29, px + len); } else { x.fillRect(px, py, 1, len); py = Math.min(29, py + len); }
      }
      x.fillStyle = dot; x.fillRect(px - 1, py - 1, 3, 3);
    }
  };
  return {
    1: mk((x) => circuit(x, '#16245a', '#33d6ff', '#ff4fa8')),
    2: mk((x) => { circuit(x, '#16245a', '#33d6ff', '#ff4fa8'); x.fillStyle = '#ffd27a'; x.fillRect(15, 15, 2, 2); }),
    3: mk((x) => circuit(x, '#3a2a08', '#ffd27a', '#fff3c4')),
  };
}

export default (app) => new RaycastRoom(app, {
  id: 'raycast', title: 'The Illusion of a World', years: '1991 – 1994', music: 'dark',
  secrets: [
    { id: 'maze-out', title: 'Out of the maze', hint: 'Find the exit in the raycast maze.', desc: 'Escaped the maze.' },
    { id: 'golden-room', title: 'The golden room', hint: 'One wall is not like the others. Face it and press E or Space.', desc: 'Secret rooms behind sliding walls were a staple of early-90s games.' },
  ],
  notes: [
    { title: 'One ray per column', body: [
      'The world is a flat grid of squares, each one wall or floor. For each of the 256 columns of the screen, the program sends one ray across the map from the player until it hits a wall.',
      { eq: 'height of the wall slice = screen height ÷ distance to the wall' },
    ] },
    { title: 'Walking the grid', body: [
      'A ray does not test every wall. It jumps from one grid line to the next, whichever is closer, and checks only the square it lands in. That is what made this fast enough for early-90s PCs.',
    ] },
    { title: 'The fisheye bug', body: [
      'Using the straight-line distance makes walls bulge, because rays at the edge of the screen travel further to reach the same flat wall. The fix is to measure distance along the viewing direction instead. Press FISHEYE on the monitor to see the bug.',
    ] },
    { title: 'What it cannot do', body: [
      'Every wall is the same height, floors are flat and you cannot look up or down. Objects are flat pictures, scaled by distance. To go further, the world has to be made of real 3D shapes, which is where we go next: through the screen.',
    ] },
  ],
}, { stations: ['pc'] });

class RaycastRoom extends HallRoom {
  async load() {
    super.load();
    this.device = this.hall.device('pc');
    this.screen = this.device.screen;
    this.screen.resize(SW, SH);
    this.screen.setProfile({ tint: '#ffffff', mono: 0, scan: 0.28, mask: 0.25, glow: 0.25, curv: 0.16, noise: 0.012, bright: 1.15, res: [RW * 2, RH * 2] });
    this.tex = buildTextures();
    this.view = makeCanvas(RW, RH);
    this.vctx = this.view.getContext('2d');
    this.img = this.vctx.createImageData(RW, RH);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(RW);
    this.rays = Array.from({ length: RW }, () => ({}));
    this.keys = {};
  }

  resetMaze() {
    this.grid = MAP_ROWS.map((r) => [...r].map((ch) => TILE[ch] || 0));
    this.mapW = MAP_ROWS[0].length; this.mapH = MAP_ROWS.length;
    for (let y = 0; y < this.mapH; y++) for (let x = 0; x < this.mapW; x++) {
      if (MAP_ROWS[y][x] === 'S') this.start = { x: x + 0.5, y: y + 0.5 };
      if (MAP_ROWS[y][x] === 'E') this.exit = { x: x + 0.5, y: y + 0.5 };
    }
    this.p = { x: this.start.x, y: this.start.y, a: 0 };
    this.push = -1;          // push wall progress: -1 closed, 0..1 sliding
    this.timer = 0; this.started = false; this.won = false; this.gold = false;
    this.scanCol = 0;
  }

  enter(scope, ctx) {
    this.arrive(ctx, 'pc');
    this.device.controls.fisheye.setState(false);
    this.device.controls.slow.setState(false);
    this.device.controls.map.setState(true);
    this.screen.power(1);
    this.resetMaze();
    this.mode = 'play';
    this.focusCol = null;
    const c = this.device.controls;
    scope.on(c.fisheye, 'change', () => this.tour?.pause());
    scope.on(c.slow, 'change', (on) => { this.scanCol = 0; if (on) this.tour?.pause(); });
    scope.add(() => { this.keys = {}; });
    const setMode = (m) => { this.mode = m; this.scanCol = 0; this.resetMaze(); };

    this.tour = this.startTour(scope, [
      { caption: 'From above, this world is just a flat grid of squares.', duration: 7,
        enter: () => { setMode('map'); this.look('pc', 'screen'); },
        update: (t) => { this.p.a = Math.sin(t * 0.6) * 0.8; } },
      { caption: 'For each column of the screen, send one ray out until it hits a wall.', duration: 11,
        enter: () => { setMode('scan'); this.p = { x: 1.5, y: 5.5, a: 0.18 }; this.look('pc', 'screen'); } },
      { caption: 'Near walls are drawn tall, far walls short. That one rule makes the corridor.', duration: 9,
        enter: () => { setMode('compare'); this.p = { x: 1.5, y: 5.5, a: 0.18 }; } },
      { caption: 'Each slice of wall is one thin stripe of a picture, stretched to fit.', duration: 10,
        enter: () => { setMode('texture'); this.p = { x: 1.5, y: 5.5, a: 0.18 }; } },
      { caption: 'Objects are flat pictures, hidden column by column behind closer walls.', duration: 10,
        enter: () => { setMode('sprite'); this.p = { x: 1.5, y: 2.5, a: 1.0 }; } },
      { caption: 'Your turn: find the exit. Arrow keys or WASD to move.',
        enter: () => { setMode('play'); this.look('pc', 'screen'); } },
    ]);
  }

  key(e, down) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd', 'q', 'e', ' '].includes(k)) return false;
    if (this.mode !== 'play') {
      if (!down) return false;
      this.tour?.go(this.tour.steps.length - 1);
    }
    this.keys[k] = down;
    if (down && (k === 'e' || k === ' ')) this.use();
    this.tour?.pause();
    return true;
  }

  pointer(e) {
    if (e.type === 'down' && e.surface === this.screen && this.mode !== 'play') { this.tour?.pause(); }
  }

  use() {
    const p = this.p;
    const fx = Math.floor(p.x + Math.cos(p.a) * 0.9), fy = Math.floor(p.y + Math.sin(p.a) * 0.9);
    if (this.grid[fy]?.[fx] === 2 && this.push < 0) { this.push = 0; this.app.audio.noiseBurst(1.2, { type: 'lowpass', freq: 400, vel: 0.3 }); }
  }

  solid(x, y) {
    const c = this.grid[Math.floor(y)]?.[Math.floor(x)];
    if (c === undefined) return true;
    if (c === 2) return this.push < 1;
    return c !== 0;
  }

  // ----------------------------------------------------------------- the raycaster
  castColumn(col, out, record = false) {
    const p = this.p;
    const dirX = Math.cos(p.a), dirY = Math.sin(p.a);
    const planeX = -dirY * FOV, planeY = dirX * FOV;
    const camX = (2 * col) / RW - 1;
    const rx = dirX + planeX * camX, ry = dirY + planeY * camX;
    let mx = Math.floor(p.x), my = Math.floor(p.y);
    const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
    const sx = rx < 0 ? -1 : 1, sy = ry < 0 ? -1 : 1;
    let sdx = (rx < 0 ? p.x - mx : mx + 1 - p.x) * ddx, sdy = (ry < 0 ? p.y - my : my + 1 - p.y) * ddy;
    let side = 0, hit = 1, dist = 0, steps = 0;
    out.cells = record ? [] : null;
    while (steps++ < 64) {
      if (sdx < sdy) { dist = sdx; sdx += ddx; mx += sx; side = 0; } else { dist = sdy; sdy += ddy; my += sy; side = 1; }
      if (record) out.cells.push([mx, my, dist]);
      const c = this.grid[my]?.[mx];
      if (c === undefined) break;
      if (c === 2) {
        if (this.push >= 1) continue;
        if (this.push > 0) {
          // the push wall slides back into its square
          const inset = side === 0 ? ddx : ddy;
          const d2 = dist + this.push * inset;
          if (d2 < Math.min(sdx, sdy)) { dist = d2; hit = 2; break; }
          continue;
        }
        hit = 2; break;
      }
      if (c) { hit = c; break; }
    }
    const euclid = dist * Math.hypot(rx, ry);
    const fisheye = this.device.controls.fisheye.state;
    out.dist = fisheye ? euclid : dist;
    out.hit = hit; out.side = side; out.steps = steps;
    let wx = side === 0 ? p.y + dist * ry : p.x + dist * rx;
    wx -= Math.floor(wx);
    out.wx = wx;
    out.hx = p.x + rx * dist; out.hy = p.y + ry * dist;
    return out;
  }

  renderColumn(col) {
    const r = this.castColumn(col, this.rays[col]);
    this.zbuf[col] = r.dist;
    const buf = this.buf;
    const h = Math.min(RH * 8, RH / Math.max(r.dist, 0.01));
    const top = Math.floor(RH / 2 - h / 2), bot = Math.floor(RH / 2 + h / 2);
    for (let y = 0; y < RH; y++) {
      if (y >= top && y < bot) continue;
      const k = Math.abs(y - RH / 2) / (RH / 2);
      const c = y < RH / 2 ? [8 + k * 14, 6 + k * 10, 22 + k * 36] : [10 + k * 34, 8 + k * 16, 30 + k * 44];
      buf[y * RW + col] = (255 << 24) | (Math.floor(c[2]) << 16) | (Math.floor(c[1]) << 8) | Math.floor(c[0]);
    }
    const tex = this.tex[r.hit] || this.tex[1];
    const tx = Math.floor(r.wx * TEX) & (TEX - 1);
    const fog = Math.max(0.15, 1 - r.dist / 9) * (r.side ? 0.72 : 1);
    for (let y = Math.max(0, top); y < Math.min(RH, bot); y++) {
      const c = tex.data[(Math.floor(((y - top) / h) * TEX) & (TEX - 1)) * TEX + tx];
      buf[y * RW + col] = (255 << 24) | (((c >> 16) & 255) * fog << 16) | (((c >> 8) & 255) * fog << 8) | ((c & 255) * fog);
    }
  }

  /** Flat pictures standing in the world, clipped against the wall depths. */
  renderSprites(upto = RW) {
    const p = this.p, dirX = Math.cos(p.a), dirY = Math.sin(p.a);
    const planeX = -dirY * FOV, planeY = dirX * FOV;
    const inv = 1 / (planeX * dirY - dirX * planeY);
    const glyph = this.app.state.glyph;
    const items = [{ x: this.exit.x, y: this.exit.y, kind: 'portal' }, { x: 3.5, y: 5.5, kind: 'statue' }];
    if (!this.gold) items.push({ x: 11.5, y: 3.5, kind: 'gold' });
    items.sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
    this.spriteCols = [];
    for (const it of items) {
      const sx = it.x - p.x, sy = it.y - p.y;
      const tX = inv * (dirY * sx - dirX * sy), tY = inv * (-planeY * sx + planeX * sy);
      if (tY < 0.15) continue;
      const scx = Math.floor((RW / 2) * (1 + tX / tY));
      const size = Math.abs(Math.floor(RH / tY)) * 0.7;
      const x0 = Math.floor(scx - size / 2), y0 = Math.floor(RH / 2 - size / 2 + (it.kind === 'statue' ? size * 0.2 : 0));
      for (let col = Math.max(0, x0); col < Math.min(upto, x0 + size); col++) {
        const hidden = this.zbuf[col] < tY;
        if (it.kind === 'statue') this.spriteCols.push([col, hidden]);
        if (hidden) continue;
        const u = (col - x0) / size;
        for (let row = Math.max(0, y0); row < Math.min(RH, y0 + size); row++) {
          const v = (row - y0) / size;
          let rgb = null;
          if (it.kind === 'statue') { const gx = Math.floor(u * 10) - 1, gy = Math.floor(v * 13) - 1; if (gx >= 0 && gx < 8 && gy >= 0 && gy < 12 && glyph[gy * 8 + gx]) rgb = [255, 210, 122]; else if (v > 0.92 && Math.abs(u - 0.5) < 0.3) rgb = [90, 80, 110]; }
          else if (it.kind === 'portal') { const d = Math.hypot(u - 0.5, v - 0.5); if (Math.abs(d - 0.34) < 0.05) rgb = [120, 255, 210]; else if (d < 0.3 && ((Math.atan2(v - 0.5, u - 0.5) * 3 + this.t * 4 + d * 20) % 6.28 + 6.28) % 6.28 < 1.4) rgb = [60, 180, 255]; }
          else if (Math.abs(u - 0.5) < 0.16 && Math.abs(v - 0.5) < 0.16) rgb = [255, 210, 90];
          if (rgb) { const f = Math.max(0.3, 1 - tY / 9); this.buf[row * RW + col] = (255 << 24) | ((rgb[2] * f) << 16) | ((rgb[1] * f) << 8) | (rgb[0] * f); }
        }
      }
    }
  }

  // ----------------------------------------------------------------- frame
  update(dt, t) {
    this.t = t;
    if (this.mode === 'play') this.movePlayer(dt);
    if (this.push >= 0 && this.push < 1) this.push = Math.min(1, this.push + dt * 0.8);
    const ctx = this.screen.ctx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SW, SH);
    ctx.imageSmoothingEnabled = false;
    switch (this.mode) {
      case 'map': this.drawMapMode(ctx, t); break;
      case 'scan': this.drawScanMode(ctx, dt); break;
      case 'compare': this.drawCompareMode(ctx, t); break;
      case 'texture': this.drawTextureMode(ctx, t); break;
      case 'sprite': this.drawSpriteMode(ctx, t); break;
      default: this.drawPlayMode(ctx, dt);
    }
    this.screen.commit(t);
  }

  movePlayer(dt) {
    const p = this.p, k = this.keys;
    const turn = (k.ArrowLeft || k.a ? -1 : 0) + (k.ArrowRight || k.d ? 1 : 0);
    const mv = (k.ArrowUp || k.w ? 1 : 0) - (k.ArrowDown || k.s ? 1 : 0);
    p.a += turn * 2.4 * dt;
    if (mv) {
      this.started = true;
      const sp = 2.4 * dt * mv, dx = Math.cos(p.a) * sp, dy = Math.sin(p.a) * sp, r = 0.22;
      if (!this.solid(p.x + dx + Math.sign(dx) * r, p.y)) p.x += dx;
      if (!this.solid(p.x, p.y + dy + Math.sign(dy) * r)) p.y += dy;
      this._stepAcc = (this._stepAcc || 0) + Math.abs(sp);
      if (this._stepAcc > 0.7) { this._stepAcc = 0; this.app.audio.footstep(this._steps = (this._steps || 0) + 1); }
    }
    if (this.started && !this.won) this.timer += dt;
    if (!this.won && Math.hypot(p.x - this.exit.x, p.y - this.exit.y) < 0.5) {
      this.won = true;
      this.app.state.record('mazeTime', this.timer, true);
      this.app.secret('maze-out', 'Out of the maze', `Escaped in ${this.timer.toFixed(1)} seconds.`);
      this.app.audio.chime([62, 66, 69, 74, 78], 'sawtooth');
      this.app.markReady();
    }
    if (!this.gold && Math.hypot(p.x - 11.5, p.y - 3.5) < 0.6) { this.gold = true; this.app.secret('golden-room', 'The golden room', 'Secret rooms behind sliding walls were a staple of early-90s games.'); }
  }

  renderView(upto = RW) {
    for (let c = 0; c < upto; c++) this.renderColumn(c);
    this.renderSprites(upto);
    this.vctx.putImageData(this.img, 0, 0);
  }

  // map drawing, shared by every mode
  drawMap(ctx, ox, oy, cell, { rays = null, center = null } = {}) {
    const g = this.grid;
    ctx.save();
    if (center) { ctx.beginPath(); ctx.rect(ox, oy, center.w, center.h); ctx.clip(); ox += center.w / 2 - this.p.x * cell; oy += center.h / 2 - this.p.y * cell; }
    for (let y = 0; y < this.mapH; y++) for (let x = 0; x < this.mapW; x++) {
      const c = g[y][x];
      const secret = x > 10 && this.push < 0;
      ctx.fillStyle = c === 0 ? '#0b0d1a' : secret ? '#101018' : c === 3 ? '#8a6a20' : c === 2 ? '#2a3a8a' : '#24407a';
      ctx.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
    }
    ctx.fillStyle = '#5effc8'; ctx.fillRect(ox + (this.exit.x - 0.35) * cell, oy + (this.exit.y - 0.35) * cell, cell * 0.7, cell * 0.7);
    const px = ox + this.p.x * cell, py = oy + this.p.y * cell;
    if (rays) {
      ctx.strokeStyle = 'rgba(255,210,121,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c < rays.upto; c += rays.every) { const r = this.rays[c]; ctx.moveTo(px, py); ctx.lineTo(ox + r.hx * cell, oy + r.hy * cell); }
      ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, Math.max(4, cell * 0.22), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(this.p.a) * cell * 0.6, py + Math.sin(this.p.a) * cell * 0.6); ctx.stroke();
    ctx.restore();
    return { px, py, ox, oy };
  }

  drawRay(ctx, m, cell, col, color = '#ff4fa8', steps = true) {
    const r = this.castColumn(col, {}, true);
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(m.px, m.py); ctx.lineTo(m.ox + r.hx * cell, m.oy + r.hy * cell); ctx.stroke();
    if (steps) {
      const p = this.p, dirX = Math.cos(p.a), dirY = Math.sin(p.a), camX = (2 * col) / RW - 1;
      const rx = dirX - dirY * FOV * camX, ry = dirY + dirX * FOV * camX;
      ctx.fillStyle = '#fff';
      for (const [, , d] of r.cells) { ctx.beginPath(); ctx.arc(m.px + rx * d * cell, m.py + ry * d * cell, 4, 0, Math.PI * 2); ctx.fill(); }
    }
    return r;
  }

  label(ctx, str, x, y, size = 30, color = '#fff') {
    ctx.font = `700 ${size}px "Atkinson Hyperlegible", sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  drawMapMode(ctx) {
    const cell = 72;
    const m = this.drawMap(ctx, (SW - this.mapW * cell) / 2, (SH - this.mapH * cell) / 2, cell);
    // the field of view as a soft wedge
    ctx.fillStyle = 'rgba(255,210,121,0.18)';
    ctx.beginPath(); ctx.moveTo(m.px, m.py);
    const a = this.p.a, half = Math.atan(FOV);
    ctx.lineTo(m.px + Math.cos(a - half) * cell * 3, m.py + Math.sin(a - half) * cell * 3);
    ctx.lineTo(m.px + Math.cos(a + half) * cell * 3, m.py + Math.sin(a + half) * cell * 3);
    ctx.fill();
  }

  /** Map on the left, the view on the right, filled one ray at a time. */
  splitLayout() { return { cell: 40, mx: 20, my: 200, vx: 548, vy: 60, vs: 1.8 }; }

  drawScanMode(ctx, dt) {
    const L = this.splitLayout();
    this.scanCol = Math.min(RW, this.scanCol + dt * (this.scanCol < 24 ? 4 : this.scanCol < 64 ? 18 : 60));
    const upto = Math.floor(this.scanCol);
    // only fill columns up to the scan line; the rest stays black
    this.buf.fill(0xff000000);
    for (let c = 0; c < upto; c++) this.renderColumn(c);
    this.vctx.putImageData(this.img, 0, 0);
    const m = this.drawMap(ctx, L.mx, L.my, L.cell, { rays: { upto, every: 4 } });
    ctx.drawImage(this.view, L.vx, L.vy, RW * L.vs, RH * L.vs);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(L.vx, L.vy, RW * L.vs, RH * L.vs);
    if (upto < RW) {
      const col = upto;
      const r = this.drawRay(ctx, m, L.cell, col, '#ff4fa8', upto < 64);
      const x = L.vx + (col + 0.5) * L.vs;
      ctx.fillStyle = '#ff4fa8'; ctx.fillRect(x - 2, L.vy, 4, RH * L.vs);
      this.label(ctx, `column ${col}`, L.vx, L.vy + RH * L.vs + 50, 28);
      this.label(ctx, `${r.steps} squares checked`, L.vx, L.vy + RH * L.vs + 92, 28, '#ffd27a');
    } else this.label(ctx, `${RW} rays, one picture`, L.vx, L.vy + RH * L.vs + 50, 28);
  }

  drawCompareMode(ctx, t) {
    const L = this.splitLayout();
    this.renderView();
    const m = this.drawMap(ctx, L.mx, L.my, L.cell);
    ctx.drawImage(this.view, L.vx, L.vy, RW * L.vs, RH * L.vs);
    // the nearest and farthest columns, side by side
    let near = 0, far = 0;
    for (let c = 0; c < RW; c++) { if (this.zbuf[c] < this.zbuf[near]) near = c; if (this.zbuf[c] > this.zbuf[far]) far = c; }
    for (const [col, color] of [[near, '#7dffb0'], [far, '#ff4fa8']]) {
      const r = this.drawRay(ctx, m, L.cell, col, color, false);
      const h = Math.min(RH, RH / r.dist) * L.vs;
      const x = L.vx + (col + 0.5) * L.vs;
      ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.strokeRect(x - 4, L.vy + (RH * L.vs - h) / 2, 8, h);
    }
    const rn = this.rays[near], rf = this.rays[far];
    this.label(ctx, `near: ${rn.dist.toFixed(1)} squares away → tall`, L.vx, L.vy + RH * L.vs + 50, 26, '#7dffb0');
    this.label(ctx, `far: ${rf.dist.toFixed(1)} squares away → short`, L.vx, L.vy + RH * L.vs + 90, 26, '#ff4fa8');
    this.label(ctx, 'height = 1 ÷ distance', L.vx, L.vy + RH * L.vs + 140, 30);
  }

  drawTextureMode(ctx, t) {
    const L = this.splitLayout();
    this.renderView();
    const col = Math.floor(((Math.sin(t * 0.5) + 1) / 2) * (RW - 1));
    const r = this.rays[col];
    ctx.drawImage(this.view, L.vx, L.vy, RW * L.vs, RH * L.vs);
    // the texture, big, with the stripe that this column uses
    const tex = this.tex[r.hit] || this.tex[1], ts = 9, tx0 = 60, ty0 = 260;
    ctx.drawImage(tex.canvas, tx0, ty0, TEX * ts, TEX * ts);
    const stripe = Math.floor(r.wx * TEX);
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 4; ctx.strokeRect(tx0 + stripe * ts, ty0, ts, TEX * ts);
    const h = Math.min(RH, RH / r.dist) * L.vs, x = L.vx + (col + 0.5) * L.vs, top = L.vy + (RH * L.vs - h) / 2;
    ctx.strokeRect(x - 3, top, 6, h);
    ctx.strokeStyle = 'rgba(255,210,122,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx0 + (stripe + 1) * ts, ty0); ctx.lineTo(x - 3, top); ctx.moveTo(tx0 + (stripe + 1) * ts, ty0 + TEX * ts); ctx.lineTo(x - 3, top + h); ctx.stroke();
    this.label(ctx, 'the wall picture', tx0, ty0 - 20, 28);
    this.label(ctx, `stripe ${stripe} of ${TEX}, stretched to ${Math.round(h / L.vs)} pixels`, L.vx, L.vy + RH * L.vs + 50, 26, '#ffd27a');
  }

  drawSpriteMode(ctx, t) {
    const L = this.splitLayout();
    this.p.a = 1.0 + Math.sin(t * 0.5) * 0.22;
    this.renderView();
    const m = this.drawMap(ctx, L.mx, L.my, L.cell);
    ctx.drawImage(this.view, L.vx, L.vy, RW * L.vs, RH * L.vs);
    // the depth of every column as a bar; sprite columns are drawn or hidden
    const by = L.vy + RH * L.vs + 20, bh = 150;
    for (let c = 0; c < RW; c += 2) {
      const h = Math.min(1, this.zbuf[c] / 8) * bh;
      ctx.fillStyle = 'rgba(120,150,255,0.5)'; ctx.fillRect(L.vx + c * L.vs, by + bh - h, L.vs * 2 - 1, h);
    }
    for (const [c, hidden] of this.spriteCols || []) { ctx.fillStyle = hidden ? '#ff4fa8' : '#7dffb0'; ctx.fillRect(L.vx + c * L.vs, by + bh + 6, L.vs, 14); }
    this.label(ctx, 'wall distance per column', L.vx, by + bh + 52, 24);
    this.label(ctx, 'green: drawn  pink: hidden', L.vx, by + bh + 86, 24, '#ffd27a');
    ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(m.ox + 3.5 * L.cell, m.oy + 5.5 * L.cell, 8, 0, Math.PI * 2); ctx.fill();
  }

  drawPlayMode(ctx, dt) {
    const slow = this.device.controls.slow.state;
    if (slow) {
      // genuinely slow: keep last frame, redraw a few columns per frame
      this.scanCol = (this.scanCol + dt * 40) % RW;
      const a = Math.floor(this.scanCol);
      for (let c = Math.max(0, a - 2); c <= a; c++) this.renderColumn(c);
      this.vctx.putImageData(this.img, 0, 0);
    } else this.renderView();
    ctx.drawImage(this.view, 0, 0, SW, SH);
    if (slow) { ctx.fillStyle = '#ff4fa8'; ctx.fillRect(Math.floor(this.scanCol) * 4, 0, 4, SH); }
    if (this.device.controls.map.state) {
      const box = { w: 260, h: 260 };
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(SW - box.w - 24, 24, box.w, box.h);
      this.drawMap(ctx, SW - box.w - 24, 24, 52, { rays: { upto: RW, every: 8 }, center: box });
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, SH - 56, SW, 56);
    const mm = Math.floor(this.timer / 60), ss = (this.timer % 60).toFixed(1).padStart(4, '0');
    this.label(ctx, this.won ? `EXIT FOUND  ${mm}:${ss}` : `FIND THE GREEN EXIT   ${mm}:${ss}`, 24, SH - 18, 30, this.won ? '#5effc8' : '#fff');
  }
}
