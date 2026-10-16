import * as THREE from 'three';
import { HallRoom } from '../hall/HallRoom.js';
import { makeCanvas, canvasTexture } from '../gfx/three-utils.js';
import { makeBitmapFont } from '../gfx/bitmapfont.js';
import { seeded, damp, clamp } from '../core/math.js';

// ROOM 05 · Depth without 3D.
// The same little world twice, one above the other. Top: every layer slides
// at the same speed, and it looks like a flat painting. Bottom: far layers
// slide slower than near ones, and the flat picture gains depth. A CPU
// meter beside the cabinet shows why the trick was done with scroll
// registers instead of redrawing, and LIFT LAYERS pulls the six layers out
// of the screen into real 3D.

const VW = 256, VH = 96;         // one strip of the game, in game pixels
const SCALE = 4;
const GROUND = 80;
const LAYERS = [
  { name: 'sky', speed: 0 },
  { name: 'mountains', speed: 1 / 8 },
  { name: 'towers', speed: 1 / 4 },
  { name: 'pylons', speed: 1 / 2 },
  { name: 'track', speed: 1 },
  { name: 'strands', speed: 1.6 },
];

function tile(w, draw) { const c = makeCanvas(w, VH); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; draw(x, w); return c; }

function buildArt() {
  const R = seeded(7);
  return [
    tile(VW, (x) => {
      const g = x.createLinearGradient(0, 0, 0, GROUND);
      g.addColorStop(0, '#07051c'); g.addColorStop(0.65, '#21104e'); g.addColorStop(1, '#6a1f6e');
      x.fillStyle = g; x.fillRect(0, 0, VW, VH);
      for (let i = 0; i < 60; i++) { x.fillStyle = R() > 0.8 ? '#ffd27a' : '#9fb7ff'; x.fillRect(Math.floor(R() * VW), Math.floor(R() * 56), 1, 1); }
      x.fillStyle = '#ff4fa8'; x.beginPath(); x.arc(196, 30, 13, 0, 7); x.fill();
      x.fillStyle = '#07051c'; for (let k = 0; k < 5; k++) x.fillRect(180, 24 + k * 4, 34, 1);
    }),
    tile(512, (x, w) => {
      const pts = []; for (let i = 0; i <= 32; i++) pts.push([i * 16, 50 + Math.sin(i * 1.3) * 7 + Math.sin(i * 0.37) * 9]);
      pts[32][1] = pts[0][1];
      x.fillStyle = '#150a34'; x.beginPath(); x.moveTo(0, GROUND); pts.forEach(([a, b]) => x.lineTo(a, b)); x.lineTo(w, GROUND); x.fill();
      x.strokeStyle = '#a25bff'; x.lineWidth = 1; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
    }),
    tile(512, (x) => {
      let px = 0;
      while (px < 512) {
        const w = 12 + Math.floor(R() * 18), h = 18 + Math.floor(R() * 34);
        x.fillStyle = '#0d1846'; x.fillRect(px, GROUND - h, w, h);
        x.fillStyle = '#2a3f9a'; x.fillRect(px, GROUND - h, w, 1);
        for (let yy = GROUND - h + 3; yy < GROUND - 2; yy += 3) for (let xx = px + 2; xx < px + w - 2; xx += 3) if (R() > 0.55) { x.fillStyle = R() > 0.85 ? '#ffd27a' : '#3ee8ff'; x.fillRect(xx, yy, 1, 1); }
        px += w + 3 + Math.floor(R() * 10);
      }
    }),
    tile(512, (x) => {
      for (let i = 0; i < 4; i++) {
        const px = 30 + i * 128 + Math.floor(R() * 30), top = 14 + Math.floor(R() * 14);
        x.fillStyle = '#07102a'; x.fillRect(px, top, 14, GROUND - top);
        x.fillStyle = '#00d6ff'; x.fillRect(px, top, 14, 2); x.fillRect(px + 2, top + 5, 1, GROUND - top - 5); x.fillRect(px + 11, top + 5, 1, GROUND - top - 5);
        for (let yy = top + 8; yy < GROUND; yy += 8) { x.fillRect(px + 2, yy, 5, 1); x.fillStyle = '#ff4fa8'; x.fillRect(px + 7, yy - 1, 2, 2); x.fillStyle = '#00d6ff'; }
      }
    }),
    tile(64, (x) => {
      x.fillStyle = '#05020f'; x.fillRect(0, GROUND, 64, VH - GROUND);
      x.fillStyle = '#3ee8ff'; x.fillRect(0, GROUND, 64, 1);
      x.fillStyle = '#1b3a8a'; for (let k = 0; k < 3; k++) x.fillRect(0, GROUND + 3 + k * k * 2 + k * 2, 64, 1);
      x.fillStyle = '#2350c8'; for (let k = 0; k < 64; k += 16) x.fillRect(k, GROUND + 1, 1, VH - GROUND);
    }),
    tile(512, (x) => {
      for (let i = 0; i < 3; i++) {
        const px = 60 + i * 170 + Math.floor(R() * 40);
        x.fillStyle = 'rgba(12,6,34,0.95)'; x.fillRect(px, 0, 4, VH);
        x.fillStyle = 'rgba(255,79,168,0.8)'; for (let yy = 0; yy < VH; yy += 10) x.fillRect(px + 1, yy, 2, 3);
      }
    }),
  ];
}

export default (app) => new ParallaxRoom(app, {
  id: 'parallax', title: 'Depth Without 3D', years: '1982 – 1995', music: 'chip2',
  secrets: [
    { id: 'clean-run', title: 'Clean run', hint: 'Collect 25 bits without hitting a glitch.', desc: 'A clean run through both worlds.' },
    { id: 'flat-all-along', title: 'Flat all along', hint: 'Lift the layers out of the screen.', desc: 'Parallax is flat pictures at different depths.' },
  ],
  notes: [
    { title: 'Why far things move slowly', body: [
      'Look out of a moving train: the fence rushes past, the hills crawl, the moon seems to follow you. How fast something slides across your view depends on how far away it is.',
      { eq: 'speed on screen = camera speed ÷ distance' },
      'Each layer here is a flat picture moved at its own speed: the track at full speed, the pylons at a half, the towers at a quarter, the mountains at an eighth. The sky does not move.',
    ] },
    { title: 'Scrolling on a budget', body: [
      'An 8-bit processor could not move tens of thousands of pixels every frame. Video chips had a scroll register instead: change one number and the chip starts reading the picture from a different place. Changing the scroll value partway down the screen, as the beam drew it, let different bands move at different speeds.',
    ] },
  ],
}, { stations: ['arcade'] });

class ParallaxRoom extends HallRoom {
  async load() {
    super.load();
    try { await document.fonts.load('8px Silkscreen'); } catch { /* fallback font */ }
    this.font = makeBitmapFont('8px Silkscreen, monospace', 6, 8, 7);
    this.device = this.hall.device('arcade');
    this.screen = this.device.screen;
    this.screen.resize(VW * SCALE, VH * SCALE * 2);
    this.screen.setProfile({ tint: '#ffffff', mono: 0, scan: 0.4, mask: 0.3, glow: 0.35, curv: 0.18, noise: 0.02, bright: 1.2, res: [VW, VH * 2] });
    this.art = buildArt();
    this.strip = makeCanvas(VW, VH);
    this.sctx = this.strip.getContext('2d');
    this.sctx.imageSmoothingEnabled = false;
    this.buildSlides();
  }

  buildSlides() {
    this.slides = new THREE.Group();
    this.slideCanvases = LAYERS.map(() => makeCanvas(VW, VH));
    this.slideTex = this.slideCanvases.map((c) => canvasTexture(c, { nearest: true }));
    const w = this.screen.width, h = w * (VH / VW);
    this.slideMeshes = this.slideTex.map((tex, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.renderOrder = 10 + i;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0 }));
      m.add(edge); m.userData.edge = edge;
      this.slides.add(m);
      return m;
    });
    this.slides.visible = false;
    this.device.screenGroup.add(this.slides);
    this.lift = 0;
  }

  enter(scope, ctx) {
    this.arrive(ctx, 'arcade');
    this.screen.power(1);
    this.resetRun();
    this.split = true;
    this.cpuMode = 'scroll';
    this.lifted = false;
    this.showWindow = 0;
    const c = this.device.controls;
    scope.on(c.jump, 'press', () => this.jump());
    scope.on(c.lift, 'change', (on) => this.setLift(on));
    scope.add(() => { this.setLift(false, true); c.lift.setState(false); });

    this.tour = this.startTour(scope, [
      { caption: 'Top: every layer slides at the same speed. It looks like a flat painting.', duration: 7,
        enter: () => { this.focus = 'top'; this.cpuMode = 'scroll'; this.look('arcade', 'screen'); } },
      { caption: 'Bottom: far layers move slower than near ones, and suddenly there is depth.', duration: 7,
        enter: () => { this.focus = 'bottom'; this.cpuMode = 'scroll'; this.look('arcade', 'screen'); } },
      { caption: 'An 80s chip couldn’t move every pixel each frame. Watch the CPU meter.', duration: 8,
        enter: () => { this.focus = null; this.cpuMode = 'redraw'; this.look('arcade'); } },
      { caption: 'Instead, it just changed where it started reading each picture. Almost free.', duration: 9,
        enter: () => { this.focus = null; this.cpuMode = 'scroll'; this.showWindow = 1; this.look('arcade'); },
        exit: () => { this.showWindow = 0; } },
      { caption: 'Lift the layers out of the screen: six flat pictures at six depths.', duration: 9,
        enter: () => { this.setLift(true); c.lift.setState(true); },
        exit: () => { this.setLift(false); c.lift.setState(false); } },
      { caption: 'Your turn: press JUMP or Space. Collect the bits, dodge the glitches.',
        enter: () => { this.focus = null; this.look('arcade'); } },
    ]);
  }

  resetRun() {
    this.run = { x: 0, speed: 52, y: GROUND - 14, vy: 0, jumps: 0, bits: 0, streak: 0, obstacles: [], items: [], nextObs: 240, nextItem: 120, flash: 0 };
    this.frameAcc = 0;
  }

  setLift(on, instant = false) {
    if (on === this.lifted) return;
    this.lifted = on;
    this.app.audio.whoosh(1.1, on, 0.18);
    if (on) {
      this.slides.visible = true;
      this.app.secret('flat-all-along', 'Flat all along', 'Parallax is just flat pictures at different depths.');
      const v = this.hall.view('arcade', 'screen');
      this.hall.goTo({ ...v, center: v.center.clone().add(new THREE.Vector3(0, -0.02, 0.32)), w: v.w * 2.2, h: v.h * 2.2, yaw: -1.05 }, { duration: 2.2, lift: 0 });
    } else if (!instant) this.look('arcade');
    if (instant) { this.lift = 0; this.slides.visible = false; }
  }

  jump() {
    const r = this.run;
    if (r.jumps < 2) { r.vy = r.jumps ? -110 : -140; r.jumps++; this.app.audio.jump(); }
  }

  key(e, down) {
    if (down && (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w')) { this.jump(); this.device.controls.jump.flash(); this.tour?.pause(); return true; }
    return false;
  }

  pointer(e) { if (e.type === 'down' && e.surface === this.screen) { this.jump(); this.tour?.pause(); } }

  // ----------------------------------------------------------------- simulation
  step(dt) {
    const r = this.run, A = this.app.audio;
    r.x += r.speed * dt;
    r.vy += 380 * dt; r.y += r.vy * dt;
    if (r.y >= GROUND - 14) { r.y = GROUND - 14; r.vy = 0; r.jumps = 0; }
    r.flash = Math.max(0, r.flash - dt);
    if (r.x + VW > r.nextObs) { r.obstacles.push({ x: r.nextObs, w: 6 + Math.floor(Math.random() * 6), h: 8 + Math.floor(Math.random() * 8) }); r.nextObs += 130 + Math.random() * 120; }
    if (r.x + VW > r.nextItem) { const h = Math.random() > 0.5 ? 32 : 14; for (let k = 0; k < 3; k++) r.items.push({ x: r.nextItem + k * 11, y: GROUND - h, v: Math.random() > 0.5 ? '1' : '0' }); r.nextItem += 90 + Math.random() * 110; }
    const px = r.x + 48;
    for (const o of r.obstacles) if (!o.hit && px + 14 > o.x && px + 2 < o.x + o.w && r.y + 14 > GROUND - o.h) { o.hit = true; r.flash = 0.6; r.streak = 0; A.hurt(); }
    for (const it of r.items) if (!it.got && Math.abs(px + 8 - (it.x + 3)) < 9 && Math.abs(r.y + 7 - (it.y + 4)) < 10) {
      it.got = true; r.bits++; r.streak++; A.coin();
      if (r.streak >= 25) this.app.secret('clean-run', 'Clean run', '25 bits in a row without touching a glitch.');
    }
    r.obstacles = r.obstacles.filter((o) => o.x > r.x - 40);
    r.items = r.items.filter((it) => it.x > r.x - 40 && !it.got);
    this.app.state.record('runBits', r.bits);
  }

  update(dt, t) {
    // in "redraw" mode the game can only manage a frame every 1/8 s
    const redraw = this.cpuMode === 'redraw';
    this.frameAcc += dt;
    const stepEvery = redraw ? 1 / 8 : 0;
    if (this.frameAcc >= stepEvery) { this.step(this.frameAcc); this.frameAcc = 0; this.draw(t); }
    this.device.setCPU(redraw ? 1 : 0.04 + (this.showWindow ? 0.01 : 0));
    this.lift = damp(this.lift, this.lifted ? 1 : 0, 3, dt);
    if (!this.lifted && this.lift < 0.01) this.slides.visible = false;
    this.layoutSlides();
    this.screen.uniforms.uBright.value = 1.2 * (1 - this.lift * 0.9);
    this.screen.commit(t);
  }

  // ----------------------------------------------------------------- drawing
  layerOffset(i, parallax) { const s = parallax ? LAYERS[i].speed : 1; return this.run.x * s; }

  drawLayer(ctx, i, parallax) {
    const art = this.art[i], w = art.width;
    if (i === 0 && parallax) { ctx.drawImage(art, 0, 0); return; }
    const o = Math.floor(this.layerOffset(i, parallax) % w);
    for (let x = -o; x < VW; x += w) ctx.drawImage(art, x, 0);
  }

  drawPlay(ctx) {
    const r = this.run;
    for (const o of r.obstacles) {
      const x = Math.floor(o.x - r.x);
      for (let yy = 0; yy < o.h; yy++) for (let xx = 0; xx < o.w; xx++) {
        if (Math.random() > 0.7) continue;
        ctx.fillStyle = Math.random() > 0.5 ? '#ff2a6d' : '#ffd27a';
        ctx.fillRect(x + xx, GROUND - o.h + yy, 1, 1);
      }
    }
    for (const it of r.items) this.tiny(ctx, it.v, Math.floor(it.x - r.x), Math.floor(it.y), '#ffd27a');
    if (!(r.flash > 0 && Math.floor(r.flash * 20) % 2)) this.drawHero(ctx, 48, Math.round(r.y));
  }

  /** The runner: a small glowing glider with a light trail, outlined so it reads on any layer. */
  drawHero(ctx, x, y) {
    ctx.fillStyle = 'rgba(255,210,122,0.35)'; ctx.fillRect(x - 14, y + 7, 14, 2); ctx.fillRect(x - 24, y + 8, 10, 1);
    const shape = ['....####....', '..########..', '.##WWWWWW##.', '##WW####WW##', '############', '.##########.', '..#......#..'];
    shape.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      ctx.fillStyle = ch === 'W' ? '#1a1a2a' : '#ffd27a';
      ctx.fillRect(x + i, y + 4 + j, 1, 1);
    }));
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(x - 0.5, y + 3.5, 13, 8);
  }

  tiny(ctx, str, x, y, col) {
    ctx.fillStyle = col;
    let cx = x;
    for (const ch of str) {
      const g = this.font.glyphs[ch.charCodeAt(0)];
      if (g) for (let i = 0; i < 48; i++) if (g[i]) ctx.fillRect(cx + (i % 6), y + ((i / 6) | 0), 1, 1);
      cx += 6;
    }
  }

  drawStrip(parallax) {
    const s = this.sctx;
    s.clearRect(0, 0, VW, VH);
    for (let i = 0; i < LAYERS.length; i++) {
      this.drawLayer(s, i, parallax);
      if (i === 4) this.drawPlay(s);
    }
    return this.strip;
  }

  draw(t) {
    const ctx = this.screen.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW * SCALE, VH * SCALE * 2);
    const H = VH * SCALE;
    ctx.drawImage(this.drawStrip(false), 0, 0, VW * SCALE, H);
    ctx.drawImage(this.drawStrip(true), 0, H, VW * SCALE, H);
    // labels and focus dimming
    const label = (str, y) => { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(12, y, str.length * 24 + 24, 44); this.bigText(ctx, str, 24, y + 10); };
    label('WITHOUT PARALLAX', 12);
    label('WITH PARALLAX', H + 12);
    if (this.focus) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, this.focus === 'top' ? H : 0, VW * SCALE, H); }
    ctx.fillStyle = '#000'; ctx.fillRect(0, H - 3, VW * SCALE, 6);
    this.bigText(ctx, `BITS ${this.run.bits}`, VW * SCALE - 220, H + 22);
    if (this.showWindow) this.drawReadWindow(ctx);
    // the slides mirror the "with" strip, layer by layer
    if (this.slides.visible) {
      this.slideCanvases.forEach((c, i) => {
        const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, VW, VH);
        this.drawLayer(x, i, true);
        if (i === 4) this.drawPlay(x);
        this.slideTex[i].needsUpdate = true;
      });
    }
  }

  /** Each layer is a long picture; the chip shows a window of it and only moves the window. */
  drawReadWindow(ctx) {
    const H = VH * SCALE, y0 = H + 120, rowH = 26;
    ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(40, y0 - 40, 944, LAYERS.length * (rowH + 8) + 56);
    this.bigText(ctx, 'EACH LAYER IS A LONG PICTURE. ONLY THE WINDOW MOVES.', 56, y0 - 30, 2);
    LAYERS.forEach((L, i) => {
      if (i === 0) return;
      const art = this.art[i], y = y0 + (i - 1) * (rowH + 8);
      const full = 800, scale = full / (art.width * (i === 4 ? 8 : 1));
      for (let k = 0; k < (i === 4 ? 8 : 1); k++) ctx.drawImage(art, 0, 0, art.width, VH, 64 + k * art.width * scale, y, art.width * scale, rowH);
      const win = (VW * scale) % full, off = (this.layerOffset(i, true) * scale) % full;
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 3; ctx.strokeRect(64 + off, y - 2, Math.min(win || full, full - off), rowH + 4);
      if (off + win > full) ctx.strokeRect(64, y - 2, off + win - full, rowH + 4);
    });
  }

  bigText(ctx, str, x, y, scale = 3) {
    ctx.fillStyle = '#ffffff';
    let cx = x;
    for (const ch of str) {
      const g = this.font.glyphs[ch.charCodeAt(0)];
      if (g) for (let i = 0; i < 48; i++) if (g[i]) ctx.fillRect(cx + (i % 6) * scale, y + ((i / 6) | 0) * scale, scale, scale);
      cx += 6 * scale;
    }
  }

  layoutSlides() {
    const k = this.lift;
    if (!this.slides.visible) return;
    this.slideMeshes.forEach((m, i) => {
      const s = LAYERS[i].speed;
      // depth implied by speed: 1/speed, mapped into a comfortable range
      // slower layers are farther away: they stay near the glass, faster ones come out toward us
      const depth = s === 0 ? 3.2 : clamp(Math.log2(1 / s), -0.7, 3);
      m.position.set(0, -this.screen.height * 0.25, 0.02 + (3.2 - depth) * 0.12 * k + i * 0.002);
      m.scale.setScalar(1 - (3.2 - depth) * 0.05 * k);
      m.material.opacity = Math.min(1, k * 3);
      m.userData.edge.material.opacity = k * 0.9;
    });
  }
}
