import * as THREE from 'three';
import { SCREEN_W, SCREEN_H } from '../core/monitor.js';
import { makeBitmapFont } from '../gfx/bitmapfont.js';

// ROOM 04 — Parallax. Six flat layers sliding at different speeds fake depth.
// Press "Explode" and the layers leave the monitor as glass slides in 3D,
// revealing that the speeds are exactly what perspective would produce.

const FW = 256, FH = 192, S = 4, GROUND = 164;
const LAYERS = [
  { name: 'sky', depth: Infinity },
  { name: 'ridge', depth: 8 },
  { name: 'towers', depth: 4 },
  { name: 'pylons', depth: 2 },
  { name: 'track', depth: 1 },
  { name: 'haze', depth: 0.6 },
];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function makeTile(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; draw(x, w, h); return c; }

export default {
  id: 'parallax', title: 'Depth Without 3D', year: '1982–1995', tagline: 'Six flat pictures, sliding at six speeds. Your eye does the rest.',
  mode: 'screen', ui: 'bench87', music: 'chip2',
  monitorProfile: { tint: '#ffffff', mono: 0, scan: 0.4, mask: 0.3, glow: 0.4, curv: 0.2, noise: 0.02, flicker: 0.15, bright: 1.15, res: [256, 192] },
  secrets: [
    { id: 'runner', title: 'Thirty bits', hint: 'Collect 30 bits in a single run without hitting a glitch.', desc: 'A clean run through the parallax track.' },
    { id: 'explode', title: 'It was flat all along', hint: 'Take the picture apart.', desc: 'Parallax layers are flat cards at different depths.' },
  ],
  notes: [
    {
      title: 'Why far things move slowly', meta: 'Parallax',
      body: `<p>Look out of a moving train: the fence rushes past, the hills crawl, the moon seems to follow you. How fast something slides across your view depends on how far away it is.</p>
      <div class="eq">screen speed = camera speed ÷ distance</div><p>Each layer here is a flat picture scrolled at its own speed: the track at 1×, the pylons at ½, the towers at ¼, the ridge at ⅛. The sky does not move.</p>`,
    },
    {
      title: 'Perspective, done by hand', meta: 'The bridge to 3D',
      body: `<p>Press <b>Explode</b>. The layers leave the screen and hang in space at the depths their speeds imply. Seen from the side, the trick is obvious: it is a stack of flat cards.</p>
      <p>Later in this museum you will see the same rule written as <code>x_screen = x ÷ z</code>. That one division is perspective projection, the core of all 3D graphics. Parallax scrolling was programmers doing that division once per layer instead of once per point.</p>`,
    },
    {
      title: 'Scrolling on a budget', meta: 'Hardware',
      body: `<p>Machines of the 1980s often could not redraw the whole screen each frame. Instead, video chips had scroll registers: change one number and the picture shifts. Some changed the scroll value in the middle of the frame, while the beam was still drawing, so different horizontal bands moved at different speeds.</p>`,
    },
  ],

  async init(app) {
    try { await document.fonts.load('8px Silkscreen'); } catch (e) {}
    this.app = app;
    this.font = makeBitmapFont('8px Silkscreen, monospace', 6, 8, 7);
    this.buildArt();
    this.layerCanvases = LAYERS.map(() => { const c = document.createElement('canvas'); c.width = FW; c.height = FH; return c; });
    this.layerCtx = this.layerCanvases.map((c) => { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; });
    this.comp = document.createElement('canvas'); this.comp.width = FW; this.comp.height = FH;
    this.cx = this.comp.getContext('2d'); this.cx.imageSmoothingEnabled = false;
    this.parallaxOn = true;
    this.resetRun();
    this.buildSlides();
  },

  buildArt() {
    const R = rng(7);
    this.art = [];
    // sky: gradient + stars
    this.art[0] = makeTile(FW, FH, (x) => {
      const g = x.createLinearGradient(0, 0, 0, GROUND);
      g.addColorStop(0, '#05041a'); g.addColorStop(0.6, '#1b0f4a'); g.addColorStop(1, '#5a1a6e');
      x.fillStyle = g; x.fillRect(0, 0, FW, FH);
      for (let i = 0; i < 70; i++) { x.fillStyle = R() > 0.8 ? '#ffd27a' : '#9fb7ff'; x.fillRect(Math.floor(R() * FW), Math.floor(R() * 110), 1, 1); }
      // a ringed planet
      x.fillStyle = '#ff4fa8'; x.beginPath(); x.arc(190, 52, 16, 0, 7); x.fill();
      x.fillStyle = '#05041a'; for (let k = 0; k < 6; k++) x.fillRect(172, 42 + k * 4, 40, 1);
      x.strokeStyle = '#ffd27a'; x.beginPath(); x.ellipse(190, 54, 28, 5, -0.2, 0, 7); x.stroke();
    });
    // ridge: wireframe mountains
    this.art[1] = makeTile(512, FH, (x, w) => {
      const pts = []; for (let i = 0; i <= 32; i++) pts.push([i * 16, 96 + Math.sin(i * 1.3) * 14 + Math.sin(i * 0.37) * 18 + (i % 3) * 4]);
      pts[32][1] = pts[0][1];
      x.fillStyle = '#12082e'; x.beginPath(); x.moveTo(0, GROUND); pts.forEach(([a, b]) => x.lineTo(a, b)); x.lineTo(w, GROUND); x.fill();
      x.strokeStyle = '#a25bff'; x.lineWidth = 1;
      x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
      x.strokeStyle = 'rgba(162,91,255,0.45)';
      pts.forEach(([a, b], i) => { if (i % 2 === 0) { x.beginPath(); x.moveTo(a, b); x.lineTo(a + 8, GROUND); x.stroke(); } });
    });
    // towers: data blocks with lit windows
    this.art[2] = makeTile(512, FH, (x) => {
      let px = 0;
      while (px < 512) {
        const w = 14 + Math.floor(R() * 22), h = 30 + Math.floor(R() * 60);
        x.fillStyle = '#0c1640'; x.fillRect(px, GROUND - h, w, h);
        x.fillStyle = '#1d2f7a'; x.fillRect(px, GROUND - h, w, 1);
        for (let yy = GROUND - h + 4; yy < GROUND - 4; yy += 4) for (let xx = px + 2; xx < px + w - 2; xx += 3) if (R() > 0.55) { x.fillStyle = R() > 0.85 ? '#ffd27a' : '#3ee8ff'; x.fillRect(xx, yy, 1, 1); }
        px += w + 2 + Math.floor(R() * 10);
      }
    });
    // pylons: big circuit columns
    this.art[3] = makeTile(512, FH, (x) => {
      for (let i = 0; i < 4; i++) {
        const px = 40 + i * 128 + Math.floor(R() * 30), w = 18, top = 26 + Math.floor(R() * 30);
        x.fillStyle = '#07102a'; x.fillRect(px, top, w, GROUND - top);
        x.fillStyle = '#00d6ff'; x.fillRect(px, top, w, 2); x.fillRect(px + 3, top + 6, 1, GROUND - top - 6); x.fillRect(px + w - 4, top + 6, 1, GROUND - top - 6);
        for (let yy = top + 10; yy < GROUND; yy += 9) { x.fillRect(px + 3, yy, 6, 1); x.fillRect(px + 9, yy, 1, 4); x.fillStyle = '#ff4fa8'; x.fillRect(px + 9, yy + 4, 2, 2); x.fillStyle = '#00d6ff'; }
      }
    });
    // track
    this.art[4] = makeTile(64, FH, (x) => {
      x.fillStyle = '#05020f'; x.fillRect(0, GROUND, 64, FH - GROUND);
      x.fillStyle = '#3ee8ff'; x.fillRect(0, GROUND, 64, 1);
      x.fillStyle = '#1b3a8a'; for (let k = 0; k < 4; k++) x.fillRect(0, GROUND + 4 + k * k * 2 + k * 2, 64, 1);
      x.fillStyle = '#2350c8'; for (let k = 0; k < 64; k += 16) x.fillRect(k, GROUND + 1, 1, FH - GROUND);
    });
    // haze: foreground strands
    this.art[5] = makeTile(512, FH, (x) => {
      for (let i = 0; i < 5; i++) {
        const px = 30 + i * 100 + Math.floor(R() * 40);
        x.fillStyle = 'rgba(10,4,30,0.92)'; x.fillRect(px, 0, 3, FH);
        x.fillStyle = 'rgba(255,79,168,0.7)'; for (let yy = 0; yy < FH; yy += 12) x.fillRect(px + 1, yy, 1, 4);
      }
    });
  },

  buildSlides() {
    const g = (this.slides = new THREE.Group());
    this.slideTex = this.layerCanvases.map((c) => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; });
    this.slideMeshes = this.slideTex.map((t, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1 }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0 }));
      m.add(edges); m.userData.edges = edges; m.renderOrder = i;
      g.add(m);
      // a label for each slide
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 40; const lx = lc.getContext('2d');
      lx.fillStyle = '#ff8a1f'; lx.font = '26px VT323, monospace';
      const d = LAYERS[i].depth; lx.fillText(`${LAYERS[i].name.toUpperCase()}  speed ${d === Infinity ? '0' : (1 / d).toFixed(d < 1 ? 2 : 3).replace(/0+$/, '').replace(/\.$/, '')}×`, 4, 28);
      const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.25), new THREE.MeshBasicMaterial({ map: lt, transparent: true, opacity: 0, depthWrite: false }));
      lab.position.set(-SCREEN_W / 2 + 0.85, SCREEN_H / 2 + 0.2, 0.01); m.add(lab); m.userData.label = lab;
      return m;
    });
    g.visible = false;
    this.explodeK = 0;
  },

  resetRun() {
    this.run = { x: 0, speed: 60, py: GROUND - 16, vy: 0, jumps: 0, bits: 0, best: this.app?.state.stats.runBits || 0, obstacles: [], items: [], nextObs: 220, nextItem: 120, flash: 0, combo: 0 };
  },

  enter(app) {
    const m = app.monitor;
    m.resizeCanvas(FW * S, FH * S); m.setProfile(this.monitorProfile);
    m.uniforms.uPowerX.value = 1; m.uniforms.uPowerY.value = 1; m.setPowered(true);
    app.ui.showChrome(true);
    if (!this.slides.parent) app.room.add(this.slides);
    this.buildControls();
  },
  exit(app) {
    if (this.exploded) this.toggleExplode(false, true);
    this.slides.visible = false;
  },

  buildControls() {
    const ui = this.app.ui;
    ui.clearControls('Layers');
    this.obj = [ui.objective('Jump with Space, ↑ or a click'), ui.objective('Explode the layers into 3D')];
    const r = ui.row();
    this.expBtn = ui.button('Explode ⇲', () => this.toggleExplode(!this.exploded), r);
    ui.toggle('Parallax', this.parallaxOn, (v) => (this.parallaxOn = v), r);
    ui.button('Jump', () => this.jump(), r);
    this.read = ui.readout();
    ui.hint('Turn parallax off and every layer moves together: the world goes flat.');
  },

  toggleExplode(on, instant = false) {
    const app = this.app;
    this.exploded = on;
    this.expBtn && (this.expBtn.textContent = on ? 'Collapse ⇱' : 'Explode ⇲');
    if (on) {
      this.obj[1].done(); app.ready(true);
      app.secret('explode', 'It was flat all along', 'Parallax layers are flat cards at different depths.');
      app.audio.whoosh(1.2, true, 0.2);
      this.slides.visible = true;
      app.freeCam = true;
      app.animateCam({ pos: new THREE.Vector3(-9.5, 3.2, 7.5), look: new THREE.Vector3(0.6, 0, 2.2) }, 2.2);
    } else {
      app.audio.whoosh(0.8, false, 0.15);
      if (instant) { this.explodeK = 0; this.slides.visible = false; app.freeCam = false; return; }
      const f = app.framing(1);
      app.animateCam(f, 1.6);
      app.camAnim.done = () => { app.freeCam = false; };
    }
  },

  jump() {
    const r = this.run;
    if (r.jumps < 2) { r.vy = r.jumps ? -120 : -150; r.jumps++; this.app.audio.jump(); this.obj?.[0].done(); }
  },

  key(e, down) {
    if (!down) return false;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { this.jump(); return true; }
    if (e.key === 'x' || e.key === 'e') { this.toggleExplode(!this.exploded); return true; }
    return false;
  },
  pointer(type, p) { if (type === 'down') this.jump(); },

  update(dt, t, app) {
    const r = this.run;
    r.speed = Math.min(140, r.speed + dt * 1.6);
    r.x += r.speed * dt;
    // player physics
    r.vy += 420 * dt; r.py += r.vy * dt;
    if (r.py >= GROUND - 16) { r.py = GROUND - 16; r.vy = 0; r.jumps = 0; }
    r.flash = Math.max(0, r.flash - dt);
    // spawn obstacles and bits in world space (track speed 1x)
    if (r.x + FW > r.nextObs) { r.obstacles.push({ x: r.nextObs, w: 8 + Math.floor(Math.random() * 8), h: 10 + Math.floor(Math.random() * 10) }); r.nextObs += 120 + Math.random() * 140; }
    if (r.x + FW > r.nextItem) { const h = Math.random() > 0.5 ? 40 : 18; for (let k = 0; k < 3; k++) r.items.push({ x: r.nextItem + k * 12, y: GROUND - h - Math.sin(k) * 6, v: Math.random() > 0.5 ? '1' : '0' }); r.nextItem += 90 + Math.random() * 120; }
    const px = r.x + 40;
    for (const o of r.obstacles) if (!o.hit && px + 13 > o.x && px + 3 < o.x + o.w && r.py + 16 > GROUND - o.h) {
      o.hit = true; r.flash = 0.6; r.combo = 0; app.audio.hurt(); r.bits = Math.max(0, r.bits - 5);
    }
    for (const it of r.items) if (!it.got && Math.abs(px + 8 - (it.x + 3)) < 9 && Math.abs(r.py + 8 - (it.y + 4)) < 11) {
      it.got = true; r.bits++; r.combo++; app.audio.coin();
      if (r.combo >= 30) app.secret('runner', 'Thirty bits', 'Thirty bits in a row without touching a glitch.');
    }
    r.obstacles = r.obstacles.filter((o) => o.x > r.x - 40);
    r.items = r.items.filter((it) => it.x > r.x - 40 && !it.got);
    if (r.bits > r.best) { r.best = r.bits; app.state.stat('runBits', r.bits); }

    // explode animation for the 3D slides
    const target = this.exploded ? 1 : 0;
    this.explodeK += (target - this.explodeK) * (1 - Math.exp(-dt * 3));
    if (!this.exploded && this.explodeK < 0.01 && this.slides.visible) this.slides.visible = false;
    const k = this.explodeK;
    this.slideMeshes.forEach((m, i) => {
      const d = LAYERS[i].depth;
      const z = d === Infinity ? -9 : -Math.log2(d) * 2.6 + 2.2; // far layers recede, near ones come forward
      m.position.set(0, 0, 0.16 + (z) * k + i * 0.004);
      const sc = 1 + (d === Infinity ? 1.4 : Math.max(-0.3, Math.log2(d) * 0.28)) * k;
      m.scale.setScalar(sc);
      m.material.opacity = 1;
      m.userData.edges.material.opacity = k * 0.9;
      m.userData.label.material.opacity = Math.max(0, k * 1.4 - 0.4);
    });
    // the CRT dims while its contents are floating outside it
    app.monitor.uniforms.uBright.value = 1.15 * (1 - k * 0.92);
    if (this.read) this.read.textContent = `bits this run   ${r.bits}\nbest run        ${r.best}\nin a row        ${r.combo}\ntrack speed     ${r.speed.toFixed(0)} px/s\nridge speed     ${(r.speed / 8).toFixed(1)} px/s`;
  },

  drawLayer(i, ctx) {
    const r = this.run, d = LAYERS[i].depth;
    const f = this.parallaxOn ? (d === Infinity ? 0 : 1 / d) : 1;
    const off = r.x * f;
    const art = this.art[i];
    ctx.clearRect(0, 0, FW, FH);
    if (i === 0 && !this.parallaxOn) {
      const o = Math.floor(off % FW); ctx.drawImage(art, -o, 0); ctx.drawImage(art, FW - o, 0);
    } else if (i === 0) ctx.drawImage(art, 0, 0);
    else {
      const w = art.width, o = Math.floor(off % w);
      for (let x = -o; x < FW; x += w) ctx.drawImage(art, x, 0);
    }
    if (i === 4) {
      // gameplay lives on the track layer
      for (const o of r.obstacles) {
        const x = Math.floor(o.x - r.x);
        for (let yy = 0; yy < o.h; yy++) for (let xx = 0; xx < o.w; xx++) {
          if (Math.random() > 0.7) continue;
          ctx.fillStyle = Math.random() > 0.5 ? '#ff2a6d' : '#ffd27a';
          ctx.fillRect(x + xx, GROUND - o.h + yy, 1, 1);
        }
      }
      ctx.fillStyle = '#ffd27a';
      for (const it of r.items) { const x = Math.floor(it.x - r.x); this.tinyText(ctx, it.v, x, Math.floor(it.y), '#ffd27a'); }
      // the visitor's sprite
      if (!(r.flash > 0 && Math.floor(r.flash * 20) % 2)) {
        const sp = this.app.state.sprite, pal = this.app.state.palette;
        const sx = 40, sy = Math.round(r.py);
        for (let k = 0; k < 256; k++) { const v = sp[k]; if (v) { ctx.fillStyle = pal[v]; ctx.fillRect(sx + (k & 15), sy + (k >> 4), 1, 1); } }
      }
      this.tinyText(ctx, `BITS ${r.bits}`, 8, 8, '#ffffff');
      this.tinyText(ctx, `BEST ${r.best}`, FW - 64, 8, '#ff8a1f');
    }
  },

  tinyText(ctx, str, x, y, col) {
    ctx.fillStyle = col;
    let cx = x;
    for (const ch of str) {
      const g = this.font.glyphs[ch.charCodeAt(0)];
      if (g) for (let i = 0; i < 48; i++) if (g[i]) ctx.fillRect(cx + (i % 6), y + ((i / 6) | 0), 1, 1);
      cx += 6;
    }
  },

  draw(ctx, dt, t, app) {
    this.cx.clearRect(0, 0, FW, FH);
    for (let i = 0; i < LAYERS.length; i++) {
      this.drawLayer(i, this.layerCtx[i]);
      this.cx.drawImage(this.layerCanvases[i], 0, 0);
      if (this.slides.visible) this.slideTex[i].needsUpdate = true;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.comp, 0, 0, FW * S, FH * S);
  },
};
