// ROOM 05 — Raycasting. A 2D grid pretending to be a 3D world: one ray per
// screen column, walked cell by cell until it hits a wall; the wall slice is
// drawn with height = screen height / distance.

const RW = 320, RH = 240, S = 3.2; // render 320x240, shown on a 1024x768 tube
const TEX = 64;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function buildMaze() {
  const W = 19, H = 15, g = Array.from({ length: H }, () => new Array(W).fill(1));
  const R = rng(1992);
  const carve = (x, y) => {
    g[y][x] = 0;
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].sort(() => R() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && nx < 14 && ny > 0 && ny < H - 1 && g[ny][nx] === 1) { g[y + dy / 2][x + dx / 2] = 0; carve(nx, ny); }
    }
  };
  carve(1, 1);
  // loops so the maze is not a single corridor
  [[6, 5], [8, 9], [4, 11], [10, 3], [12, 7]].forEach(([x, y]) => (g[y][x] = 0));
  // secret room east of the maze, behind a push-wall at (14, 7)
  for (let y = 6; y <= 8; y++) for (let x = 15; x <= 17; x++) g[y][x] = 0;
  for (let y = 5; y <= 9; y++) g[y][18] = 4;
  for (let x = 15; x <= 18; x++) { g[5][x] = 4; g[9][x] = 4; }
  g[7][13] = 0; g[7][14] = 3; // 3 = push wall
  // farthest open cell from start = exit
  const dist = Array.from({ length: H }, () => new Array(W).fill(-1));
  const q = [[1, 1]]; dist[1][1] = 0; let far = [1, 1];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 14 && g[ny][nx] === 0 && dist[ny][nx] < 0) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); if (dist[ny][nx] > dist[far[1]][far[0]]) far = [nx, ny]; }
    }
  }
  // a statue spot a few steps from the start, and the open direction to face
  let statue = [1, 1];
  for (let y = 0; y < H; y++) for (let x = 0; x < 14; x++) if (dist[y][x] === 5) statue = [x, y];
  const face = g[1][2] === 0 ? 0 : Math.PI / 2;
  // decorate some walls with the second texture
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 1 && R() > 0.65) g[y][x] = 2;
  return { g, W, H, exit: far, statue, face };
}

function makeTextures() {
  const mk = (fn) => {
    const c = document.createElement('canvas'); c.width = c.height = TEX; const x = c.getContext('2d'); fn(x);
    const d = x.getImageData(0, 0, TEX, TEX).data; const u = new Uint32Array(TEX * TEX);
    for (let i = 0; i < TEX * TEX; i++) u[i] = (255 << 24) | (d[i * 4 + 2] << 16) | (d[i * 4 + 1] << 8) | d[i * 4];
    return u;
  };
  const R = rng(5);
  const circuit = (x, base, line, dot) => {
    x.fillStyle = base; x.fillRect(0, 0, TEX, TEX);
    x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, 0, TEX, 2); x.fillRect(0, 0, 2, TEX);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, TEX - 2, TEX, 2); x.fillRect(TEX - 2, 0, 2, TEX);
    x.fillStyle = line;
    for (let i = 0; i < 7; i++) {
      let px = 4 + Math.floor(R() * 56), py = 4 + Math.floor(R() * 56);
      for (let k = 0; k < 4; k++) {
        const horiz = R() > 0.5, len = 6 + Math.floor(R() * 20);
        if (horiz) { x.fillRect(Math.min(px, px + len), py, len, 1); px = Math.min(60, px + len); } else { x.fillRect(px, Math.min(py, py + len), 1, len); py = Math.min(60, py + len); }
      }
      x.fillStyle = dot; x.fillRect(px - 1, py - 1, 3, 3); x.fillStyle = line;
    }
  };
  return {
    1: mk((x) => circuit(x, '#14204a', '#2fd6ff', '#ff4fa8')),
    2: mk((x) => {
      x.fillStyle = '#2a1f45'; x.fillRect(0, 0, TEX, TEX);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
        const ox = (r % 2) * 16 + c * 32; x.fillStyle = r % 2 ? '#3a2b60' : '#33265a'; x.fillRect(ox + 1, r * 16 + 1, 30, 14);
        x.fillStyle = 'rgba(162,91,255,0.55)'; x.font = '9px monospace'; x.fillText(R() > 0.5 ? '1011' : '0110', ox + 4, r * 16 + 11);
      }
    }),
    3: mk((x) => {
      x.fillStyle = '#2a1f45'; x.fillRect(0, 0, TEX, TEX);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { const ox = (r % 2) * 16 + c * 32; x.fillStyle = r % 2 ? '#3a2b60' : '#33265a'; x.fillRect(ox + 1, r * 16 + 1, 30, 14); }
      x.fillStyle = 'rgba(162,91,255,0.55)'; x.font = '9px monospace'; x.fillText('PUSH', 22, 43);
      x.fillStyle = '#ffb547'; x.fillRect(31, 31, 2, 2);
    }),
    4: mk((x) => { circuit(x, '#3a2a08', '#ffd27a', '#fff3c4'); }),
  };
}

export default {
  id: 'raycast', title: 'The Illusion of a World', year: '1991–1994', tagline: 'A flat map, one ray per column of the screen, and suddenly there are corridors.',
  mode: 'screen', ui: 'bevel91', music: 'dark',
  monitorProfile: { tint: '#ffffff', mono: 0, scan: 0.3, mask: 0.3, glow: 0.3, curv: 0.17, noise: 0.015, flicker: 0.1, bright: 1.15, res: [320, 240] },
  secrets: [
    { id: 'maze', title: 'Out of the maze', hint: 'Find the exit portal in the raycast maze.', desc: 'Escaped the maze.' },
    { id: 'pushwall', title: 'The golden pixel', hint: 'One wall in this maze is not like the others. Walk up to it and press E or Space.', desc: 'Secret rooms behind sliding walls were a staple of early-90s shooters.' },
  ],
  notes: [
    {
      title: 'One ray per column', meta: 'Raycasting',
      body: `<p>The world is a flat grid of squares, wall or empty. For each of the 320 columns of the screen, the program shoots one ray across the map from the player's position until it hits a wall.</p>
      <div class="eq">wall height on screen  =  screen height  ÷  distance to wall</div>
      <p>Near walls are tall, far walls are short. 320 rays and 320 vertical lines make a convincing corridor. Turn on <b>Slow scan</b> to watch the columns being cast one by one.</p>`,
    },
    {
      title: 'Walking the grid', meta: 'DDA traversal',
      body: `<p>A ray does not test every wall. It hops from one grid line to the next (the next vertical line or the next horizontal one, whichever is closer) and checks only the square it lands in. This is called a digital differential analyzer, or DDA, and it is why raycasting was fast enough for early-90s PCs.</p>`,
    },
    {
      title: 'The fisheye problem', meta: 'A classic bug',
      body: `<p>If you use the straight-line distance to the wall, walls bulge outward like a fisheye lens, because rays at the screen's edge travel further to reach the same flat wall.</p>
      <div class="eq">corrected distance = distance × cos(ray angle − view angle)</div><p>Turn on <b>Fisheye</b> to see the bug that every raycaster programmer has met.</p>`,
    },
    {
      title: 'What it cannot do', meta: 'Limits',
      body: `<p>All walls are the same height, meet the floor at right angles and the camera can never look up or down. Objects like the portal and your sprite are flat pictures scaled by distance: billboards. To go further, the world itself has to be made of real 3D shapes. That is the next room, and to get there we go through the glass.</p>`,
    },
  ],

  init(app) {
    this.app = app;
    this.maze = buildMaze();
    this.tex = makeTextures();
    this.small = document.createElement('canvas'); this.small.width = RW; this.small.height = RH;
    this.sx = this.small.getContext('2d');
    this.img = this.sx.createImageData(RW, RH);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(RW);
    this.rays = new Array(RW);
    this.fisheye = false; this.slow = false; this.textures = true; this.edit = false;
    this.keys = {};
    this.scanCol = 0;
    this.reset();
  },

  reset() {
    this.p = { x: 1.5, y: 1.5, a: this.maze.face };
    this.timer = 0; this.started = false; this.won = false;
    this.pushT = -1;
    this.gotGold = false;
  },

  enter(app) {
    const m = app.monitor;
    m.resizeCanvas(1024, 768); m.setProfile(this.monitorProfile);
    m.uniforms.uPowerX.value = 1; m.uniforms.uPowerY.value = 1; m.setPowered(true);
    app.ui.showChrome(true);
    this.buildControls();
  },
  exit() { this.keys = {}; },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Raycaster.exe');
    this.obj = [ui.objective('Walk with WASD or the arrow keys'), ui.objective('Find the exit portal')];
    const r = ui.row();
    ui.toggle('Fisheye', this.fisheye, (v) => (this.fisheye = v), r);
    ui.toggle('Slow scan', this.slow, (v) => { this.slow = v; this.scanCol = 0; }, r);
    ui.toggle('Textures', this.textures, (v) => (this.textures = v), r);
    ui.toggle('Edit map', this.edit, (v) => (this.edit = v), r);
    const pad = ui.row();
    const hold = (label, k) => { const b = ui.button(label, () => {}, pad); const on = (v) => () => (this.keys[k] = v); b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false)); b.addEventListener('pointerleave', on(false)); };
    hold('⟲', 'ArrowLeft'); hold('▲', 'ArrowUp'); hold('▼', 'ArrowDown'); hold('⟳', 'ArrowRight');
    ui.button('Use', () => this.use(), pad);
    ui.button('Restart', () => this.reset(), pad);
    this.read = ui.readout();
    ui.hint('Hover the 3D view to see the ray behind that column. In Edit map, click squares to add or remove walls.');
  },

  key(e, down) {
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd', 'q', 'e', 'W', 'A', 'S', 'D'].includes(k)) {
      this.keys[k.length === 1 ? k.toLowerCase() : k] = down;
      if (down && (k === 'e' || k === 'E')) this.use();
      return true;
    }
    if (k === ' ' && down) { this.use(); return true; }
    return false;
  },

  use() {
    const p = this.p, g = this.maze.g;
    const fx = Math.floor(p.x + Math.cos(p.a) * 0.9), fy = Math.floor(p.y + Math.sin(p.a) * 0.9);
    if (g[fy] && g[fy][fx] === 3 && this.pushT < 0) { this.pushT = 0; this.app.audio.noiseBurst(1.2, { type: 'lowpass', freq: 400, vel: 0.3 }); }
  },

  pointer(type, p, e, app) {
    const map = this.mapRect();
    if (this.edit && type === 'down') {
      const cx = Math.floor((p.x - map.x) / map.s), cy = Math.floor((p.y - map.y) / map.s);
      const g = this.maze.g;
      if (cx > 0 && cy > 0 && cx < 14 && cy < this.maze.H - 1) {
        if (Math.floor(this.p.x) === cx && Math.floor(this.p.y) === cy) return;
        g[cy][cx] = g[cy][cx] ? 0 : 1; app.audio.click('modern');
      }
      return;
    }
    if (type === 'down') this.drag = { x: p.x, a: this.p.a };
    if (type === 'move' && this.drag && e.buttons) this.p.a = this.drag.a + (p.x - this.drag.x) * 0.006;
    if (type === 'up') this.drag = null;
    this.hoverCol = p.inside && !(this.edit && p.x < map.x + map.w) ? Math.floor(p.x / S) : null;
  },

  mapRect() {
    const M = this.maze;
    if (this.edit) { const s = 34; return { x: 24, y: (768 - M.H * s) / 2, s, w: M.W * s, h: M.H * s }; }
    const s = 11; return { x: 1024 - M.W * s - 22, y: 22, s, w: M.W * s, h: M.H * s };
  },

  solid(x, y) {
    const g = this.maze.g, c = g[Math.floor(y)]?.[Math.floor(x)];
    if (c === 3 && this.pushT >= 1) return false;
    return c !== 0;
  },

  update(dt, t, app) {
    const p = this.p, k = this.keys;
    const turn = (k.ArrowLeft || k.a ? -1 : 0) + (k.ArrowRight || k.d ? 1 : 0);
    const mv = (k.ArrowUp || k.w ? 1 : 0) - (k.ArrowDown || k.s ? 1 : 0);
    const strafe = (k.e ? 1 : 0) - (k.q ? 1 : 0);
    p.a += turn * 2.4 * dt;
    if (mv || strafe) {
      if (!this.started) { this.started = true; this.obj[0].done(); }
      const sp = 2.6 * dt;
      const dx = Math.cos(p.a) * mv * sp - Math.sin(p.a) * strafe * sp, dy = Math.sin(p.a) * mv * sp + Math.cos(p.a) * strafe * sp;
      const r = 0.22;
      if (!this.solid(p.x + dx + Math.sign(dx) * r, p.y)) p.x += dx;
      if (!this.solid(p.x, p.y + dy + Math.sign(dy) * r)) p.y += dy;
      this._stepAcc = (this._stepAcc || 0) + sp;
      if (this._stepAcc > 0.7) { this._stepAcc = 0; app.audio.footstep(this._sc = (this._sc || 0) + 1); }
    }
    if (this.started && !this.won) this.timer += dt;
    if (this.pushT >= 0 && this.pushT < 1) { this.pushT = Math.min(1, this.pushT + dt * 0.9); }
    // exit
    const [ex, ey] = this.maze.exit;
    if (!this.won && Math.floor(p.x) === ex && Math.floor(p.y) === ey) {
      this.won = true; this.obj[1].done(); app.ready(true);
      app.state.stat('mazeTime', this.timer, (a, b) => b < a);
      app.secret('maze', 'Out of the maze', `Escaped in ${this.timer.toFixed(1)} seconds.`);
      app.audio.chime([62, 66, 69, 74, 78], 'sawtooth');
    }
    if (!this.gotGold && Math.hypot(p.x - 16.5, p.y - 7.5) < 0.7) {
      this.gotGold = true;
      app.secret('pushwall', 'The golden pixel', 'Secret rooms behind sliding walls were a staple of early-90s shooters.');
    }
  },

  // --- the raycaster -------------------------------------------------------
  castColumn(col, out) {
    const p = this.p, fov = 1.15;
    const camX = (2 * col) / RW - 1;
    const ra = p.a + Math.atan(camX * Math.tan(fov / 2));
    const dx = Math.cos(ra), dy = Math.sin(ra);
    let mx = Math.floor(p.x), my = Math.floor(p.y);
    const ddx = Math.abs(1 / dx), ddy = Math.abs(1 / dy);
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let sdx = (dx < 0 ? p.x - mx : mx + 1 - p.x) * ddx, sdy = (dy < 0 ? p.y - my : my + 1 - p.y) * ddy;
    let side = 0, hit = 0, steps = 0, dist = 0, pushOff = 0;
    const g = this.maze.g;
    while (steps++ < 64) {
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
      const c = g[my]?.[mx];
      if (c === undefined) { hit = 1; break; }
      if (c === 3) {
        if (this.pushT >= 1) continue;
        // the push wall slides back into its square as it opens
        pushOff = this.pushT;
        const d0 = side === 0 ? sdx - ddx : sdy - ddy;
        const dd = d0 + pushOff * (side === 0 ? ddx : ddy);
        const next = Math.min(sdx, sdy);
        if (dd < next || pushOff === 0) { dist = dd; hit = 3; break; }
        continue;
      }
      if (c) { hit = c; dist = side === 0 ? sdx - ddx : sdy - ddy; break; }
    }
    const euclid = dist;
    const perp = this.fisheye ? euclid : euclid * Math.cos(ra - p.a);
    let wx = side === 0 ? p.y + euclid * dy : p.x + euclid * dx; wx -= Math.floor(wx);
    out.dist = perp; out.hit = hit; out.side = side; out.wx = wx; out.hx = p.x + dx * euclid; out.hy = p.y + dy * euclid; out.steps = steps;
    return out;
  },

  render3D(t, upto) {
    const buf = this.buf;
    // ceiling & floor gradients
    for (let y = 0; y < RH; y++) {
      const half = y < RH / 2;
      const d = half ? (RH / 2 - y) / (RH / 2) : (y - RH / 2) / (RH / 2);
      const c = half ? [8 + d * 10, 6 + d * 8, 22 + d * 30] : [10 + d * 30, 8 + d * 14, 28 + d * 40];
      const v = (255 << 24) | (Math.floor(c[2]) << 16) | (Math.floor(c[1]) << 8) | Math.floor(c[0]);
      buf.fill(v, y * RW, y * RW + RW);
    }
    for (let col = 0; col < upto; col++) {
      const r = this.rays[col] || (this.rays[col] = {});
      this.castColumn(col, r);
      this.zbuf[col] = r.dist;
      const h = Math.min(RH * 8, RH / Math.max(r.dist, 0.01));
      const top = Math.floor(RH / 2 - h / 2), bot = Math.floor(RH / 2 + h / 2);
      const fog = Math.max(0.12, 1 - r.dist / 11) * (r.side ? 0.72 : 1);
      const tex = this.tex[r.hit] || this.tex[1];
      const tx = Math.floor(r.wx * TEX) & 63;
      for (let y = Math.max(0, top); y < Math.min(RH, bot); y++) {
        let c;
        if (this.textures) c = tex[((Math.floor(((y - top) / h) * TEX) & 63) * TEX) + tx];
        else c = r.hit === 4 ? 0xff20b8ff : r.hit === 3 || r.hit === 2 ? 0xff7a4a5a : 0xffa04a2a;
        const rr = (c & 255) * fog, gg = ((c >> 8) & 255) * fog, bb = ((c >> 16) & 255) * fog;
        buf[y * RW + col] = (255 << 24) | (bb << 16) | (gg << 8) | rr;
      }
    }
    this.drawBillboards(t, upto);
  },

  drawBillboards(t, upto) {
    const p = this.p, fov = 1.15, buf = this.buf;
    const items = [];
    const [ex, ey] = this.maze.exit;
    items.push({ x: ex + 0.5, y: ey + 0.5, kind: 'portal' });
    items.push({ x: this.maze.statue[0] + 0.5, y: this.maze.statue[1] + 0.5, kind: 'statue' });
    if (!this.gotGold) items.push({ x: 16.5, y: 7.5, kind: 'gold' });
    const sp = this.app.state.sprite, pal = this.app.state.palette.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    for (const it of items) { it.d = Math.hypot(it.x - p.x, it.y - p.y); }
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      const dx = it.x - p.x, dy = it.y - p.y;
      let ang = Math.atan2(dy, dx) - p.a; while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
      const perp = it.d * Math.cos(ang);
      if (perp < 0.2) continue;
      const camX = Math.tan(ang) / Math.tan(fov / 2);
      const scx = (camX + 1) * RW / 2;
      const size = RH / perp * (it.kind === 'statue' ? 0.6 : 0.7);
      const x0 = Math.floor(scx - size / 2), y0 = Math.floor(RH / 2 - size / 2 + (it.kind === 'statue' ? size * 0.25 : 0) + Math.sin(t * 2) * size * 0.05);
      for (let sx = Math.max(0, x0); sx < Math.min(upto, x0 + size); sx++) {
        if (this.zbuf[sx] < perp) continue;
        const u = (sx - x0) / size;
        for (let sy = Math.max(0, y0); sy < Math.min(RH, y0 + size); sy++) {
          const v = (sy - y0) / size;
          let col = null;
          if (it.kind === 'statue') {
            const k = sp[Math.floor(v * 16) * 16 + Math.floor(u * 16)]; if (k) col = pal[k];
          } else if (it.kind === 'portal') {
            const cu = u - 0.5, cv = v - 0.5, r = Math.hypot(cu, cv);
            const ring = Math.abs(r - 0.32 - Math.sin(t * 3) * 0.03) < 0.05;
            const swirl = r < 0.3 && ((Math.atan2(cv, cu) * 3 + t * 4 + r * 20) % 6.28 + 6.28) % 6.28 < 1.4;
            if (ring) col = [120, 255, 210]; else if (swirl) col = [60, 180, 255];
          } else {
            const cu = Math.abs(u - 0.5), cv = Math.abs(v - 0.5);
            if (cu < 0.18 && cv < 0.18) col = [255, 210, 90]; else if (cu + cv < 0.32 && (Math.floor(t * 6) % 2)) col = [255, 240, 180];
          }
          if (col) { const f = Math.max(0.25, 1 - perp / 11); buf[sy * RW + sx] = (255 << 24) | ((col[2] * f) << 16) | ((col[1] * f) << 8) | (col[0] * f); }
        }
      }
    }
  },

  draw(ctx, dt, t, app) {
    let upto = RW;
    if (this.slow) { this.scanCol = (this.scanCol + dt * 90) % (RW + 40); upto = Math.min(RW, Math.floor(this.scanCol)); }
    this.render3D(t, upto);
    this.sx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1024, 768);
    ctx.drawImage(this.small, 0, 0, RW * S, RH * S);
    if (this.slow && upto < RW) { ctx.fillStyle = 'rgba(255,210,121,0.8)'; ctx.fillRect(upto * S, 0, 2, 768); }
    if (this.edit) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 1024, 768); }

    // the map, with the actual rays
    const M = this.maze, m = this.mapRect(), g = M.g;
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(m.x - 6, m.y - 6, m.w + 12, m.h + 12);
    for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
      const c = g[y][x];
      if (!c || (c === 3 && this.pushT >= 1)) continue;
      if (x > 14 && !this.edit && this.pushT < 0) continue; // the secret room is unmapped
      ctx.fillStyle = c === 4 ? '#8a6a20' : c === 3 ? (this.edit ? '#6a4a9a' : '#3a3366') : c === 2 ? '#3a3366' : '#24407a';
      ctx.fillRect(m.x + x * m.s, m.y + y * m.s, m.s - 1, m.s - 1);
    }
    const [ex, ey] = M.exit;
    ctx.fillStyle = '#5effc8'; ctx.fillRect(m.x + ex * m.s + 2, m.y + ey * m.s + 2, m.s - 5, m.s - 5);
    const P = this.p, px = m.x + P.x * m.s, py = m.y + P.y * m.s;
    ctx.strokeStyle = 'rgba(255,210,121,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c < upto; c += this.slow ? 4 : 10) { const r = this.rays[c]; if (!r) continue; ctx.moveTo(px, py); ctx.lineTo(m.x + r.hx * m.s, m.y + r.hy * m.s); }
    ctx.stroke();
    if (this.slow && upto > 0 && upto <= RW) { const r = this.rays[Math.max(0, upto - 1)]; if (r) { ctx.strokeStyle = '#ffd279'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(m.x + r.hx * m.s, m.y + r.hy * m.s); ctx.stroke(); } }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, Math.max(3, m.s * 0.3), 0, 7); ctx.fill();

    // hovered column: show its ray and numbers
    let info = '';
    if (this.hoverCol != null && this.rays[this.hoverCol]) {
      const r = this.rays[this.hoverCol];
      ctx.strokeStyle = '#ff4fa8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(m.x + r.hx * m.s, m.y + r.hy * m.s); ctx.stroke();
      const h = RH / Math.max(r.dist, 0.01);
      ctx.strokeStyle = 'rgba(255,79,168,0.9)'; ctx.strokeRect(this.hoverCol * S, Math.max(0, (RH / 2 - h / 2) * S), S, Math.min(768, h * S));
      info = `\ncolumn ${this.hoverCol}: ${r.steps} grid steps\ndistance ${r.dist.toFixed(2)} → height ${Math.min(999, h).toFixed(0)} px`;
    }
    const mm = Math.floor(this.timer / 60), ss = (this.timer % 60).toFixed(1).padStart(4, '0');
    if (this.read) this.read.textContent = `rays this frame  ${upto}\ntime             ${mm}:${ss}${this.won ? '  ESCAPED' : ''}\nbest             ${app.state.stats.mazeTime ? app.state.stats.mazeTime.toFixed(1) + ' s' : '—'}${info}`;
    // DOS-style status bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 734, 1024, 34);
    ctx.fillStyle = '#c3c3c3'; ctx.font = '20px VT323, monospace'; ctx.textBaseline = 'middle';
    ctx.fillText(`RAYCAST.EXE   320 RAYS   ${this.fisheye ? 'FISHEYE ON  ' : ''}${this.won ? 'EXIT FOUND' : 'FIND THE PORTAL'}   ${mm}:${ss}`, 16, 752);
  },
};
