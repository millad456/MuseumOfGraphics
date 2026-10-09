import * as THREE from 'three';

// Hardware journeys: transitions that leave the exhibits and go into the
// machine. "crt" swings behind the monitor into the picture tube; "gpu"
// follows the electricity down a cable, across a motherboard and into the
// graphics chip, where a vertex is multiplied by a matrix.

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function keyPath(keys) {
  // keys: [time, [pos], [look]]
  const P = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[1])), false, 'centripetal');
  const L = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[2])), false, 'centripetal');
  const times = keys.map((k) => k[0]);
  return (t) => {
    let i = 0; while (i < times.length - 2 && t > times[i + 1]) i++;
    const f = clamp((t - times[i]) / (times[i + 1] - times[i]));
    const u = (i + ease(f)) / (times.length - 1);
    return { pos: P.getPoint(u), look: L.getPoint(u) };
  };
}

// ======================================================================= CRT
export const crtJourney = {
  mode: 'world', duration: 7.2,

  init(app) {
    this.app = app;
    const g = (this.inside = new THREE.Group());
    const glass = new THREE.MeshBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const funnelGeo = new THREE.CylinderGeometry(0.34, 2.45, 2.6, 4, 1, true, Math.PI / 4);
    const funnel = new THREE.Mesh(funnelGeo, glass); funnel.rotation.x = Math.PI / 2; funnel.scale.set(1.15, 1, 0.88); funnel.position.z = -1.35; g.add(funnel);
    const fw = new THREE.LineSegments(new THREE.EdgesGeometry(funnelGeo), new THREE.LineBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0.35 }));
    fw.rotation.copy(funnel.rotation); fw.scale.copy(funnel.scale); fw.position.copy(funnel.position); g.add(fw);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.3, 24, 1, true), glass); neck.rotation.x = Math.PI / 2; neck.position.z = -3.25; g.add(neck);
    const nw = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.3, 0.3, 1.3, 12, 2, true)), new THREE.LineBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0.25 }));
    nw.rotation.x = Math.PI / 2; nw.position.z = -3.25; g.add(nw);
    // electron gun: grids and a glowing cathode
    const metal = new THREE.MeshStandardMaterial({ color: 0x9a9da3, metalness: 0.9, roughness: 0.35 });
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 20), metal); c.rotation.x = Math.PI / 2; c.position.z = -3.75 + i * 0.18; g.add(c); }
    this.cathode = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa040 })); this.cathode.position.z = -3.9; g.add(this.cathode);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff8a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.setScalar(0.9); this.cathode.add(halo);
    // deflection yoke: copper coils
    const copper = new THREE.MeshStandardMaterial({ color: 0xb8692e, metalness: 0.85, roughness: 0.3 });
    for (let i = 0; i < 2; i++) { const y = new THREE.Mesh(new THREE.TorusGeometry(0.46 + i * 0.12, 0.09, 12, 40), copper); y.position.z = -2.55 + i * 0.22; g.add(y); }
    const yl = new THREE.PointLight(0xffa060, 4, 4); yl.position.set(0.6, 0.6, -2.6); g.add(yl);
    // the back of the phosphor, being painted one row at a time
    this.pc = document.createElement('canvas'); this.pc.width = 256; this.pc.height = 192;
    this.px = this.pc.getContext('2d');
    this.ptex = new THREE.CanvasTexture(this.pc); this.ptex.colorSpace = THREE.SRGBColorSpace; this.ptex.magFilter = THREE.NearestFilter;
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ map: this.ptex, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    rear.position.z = -0.06; g.add(rear);
    // the beam
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(this.beam, this.beamGlow);
    this.spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.spot.scale.setScalar(0.35); g.add(this.spot);
    g.visible = false;
    app.monitor.group.add(g);
    // the image the beam paints: a test pattern and the visitor's sprite
    this.src = document.createElement('canvas'); this.src.width = 256; this.src.height = 192;
  },

  paintSource() {
    const x = this.src.getContext('2d'), app = this.app;
    const bars = ['#ffffff', '#ffe600', '#00e5ff', '#00e04a', '#ff2bd6', '#ff2a2a', '#1d3cff', '#000000'];
    bars.forEach((c, i) => { x.fillStyle = c; x.fillRect(i * 32, 0, 32, 120); });
    for (let i = 0; i < 16; i++) { x.fillStyle = `rgb(${i * 17},${i * 17},${i * 17})`; x.fillRect(i * 16, 120, 16, 24); }
    x.fillStyle = '#0a0e28'; x.fillRect(0, 144, 256, 48);
    const sp = app.state.sprite, pal = app.state.palette;
    for (let k = 0; k < 256; k++) if (sp[k]) { x.fillStyle = pal[sp[k]]; x.fillRect(112 + (k & 15) * 2, 152 + (k >> 4) * 2 - 8, 2, 2); }
    this.srcData = x.getImageData(0, 0, 256, 192);
  },

  start(app) {
    this.t = 0; this.done = false; this.row = 0;
    this.paintSource();
    this.px.fillStyle = '#000'; this.px.fillRect(0, 0, 256, 192);
    this.inside.visible = true;
    const pl = app.monitor.plastic; pl.transparent = true;
    this.from = { pos: app.camRig.pos.clone(), look: app.camRig.look.clone() };
    app.freeCam = true; app.camAnim = null;
    this.path = keyPath([
      [0, this.from.pos.toArray(), this.from.look.toArray()],
      [1.4, [7.5, 1.6, 1.0], [0, 0, -1.4]],
      [2.6, [3.6, 1.1, -6.2], [0, 0, -1.6]],
      [4.2, [1.15, 0.55, -5.3], [0, 0, 0]],
      [5.7, [0.0, 0.06, -2.95], [0, 0, 0]],
      [7.2, [0.0, 0.0, -0.25], [0, 0, 2]],
    ]);
    app.audio.whoosh(2.2, true, 0.2);
    setTimeout(() => app.ui.titleCard('', 'Inside the tube', 'The beam stops tracing shapes. It sweeps every row of the screen, top to bottom, sixty times a second, switching on and off.', 3600), 2600);
    setTimeout(() => app.audio.powerOn(), 2400);
  },

  update(dt, t, app) {
    this.t += dt;
    const k = this.t;
    const cam = this.path(Math.min(k, 7.2));
    app.camRig.pos.copy(cam.pos); app.camRig.look.copy(cam.look);
    const pl = app.monitor.plastic;
    pl.opacity = 1 - clamp((k - 0.6) / 1.4) * 0.88; pl.depthWrite = pl.opacity > 0.95;
    // raster scan: rows advance, phosphor fades, beam points at the current pixel
    const rowsPerSec = 26 + Math.max(0, k - 3) * 60;
    const prevRow = this.row; this.row = (this.row + rowsPerSec * dt);
    const x = this.px;
    x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(0, 0, 256, 192);
    const d = this.srcData.data;
    for (let r = Math.floor(prevRow); r < Math.floor(this.row); r++) {
      const y = ((r % 192) + 192) % 192;
      const img = x.createImageData(256, 1);
      img.data.set(d.subarray(y * 256 * 4, (y + 1) * 256 * 4));
      x.putImageData(img, 0, y);
    }
    this.ptex.needsUpdate = true;
    const y = (this.row % 192) / 192, xx = ((this.row * 7.3) % 1);
    // the screen is seen from behind: mirror x
    const sx = (xx - 0.5) * 4, sy = (0.5 - y) * 3;
    const a = new THREE.Vector3(0, 0, -3.55), b = new THREE.Vector3(sx, sy, -0.07);
    const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    for (const m of [this.beam, this.beamGlow]) { m.position.copy(mid); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); }
    this.spot.position.copy(b);
    const on = clamp((k - 2.2) / 0.5);
    this.beam.material.opacity = 0.9 * on; this.beamGlow.material.opacity = 0.25 * on; this.spot.material.opacity = on;
    app.monitor.uniforms.uBright.value = 1.15 * (1 - clamp((k - 0.8) / 1.0) * 0.95);
    if (k >= 7.2) this.done = true;
  },

  finish(app) {
    this.inside.visible = false;
    const pl = app.monitor.plastic; pl.opacity = 1; pl.transparent = false; pl.depthWrite = true;
    app.monitor.uniforms.uBright.value = 1.15;
    app.setRoomCamera(new THREE.Vector3(0, 0, 1.6), new THREE.Vector3(0, 0, 0));
    app.freeCam = false;
  },

  render(renderer, target) { this.app.renderRoom(target, 0); },
};

// ======================================================================= GPU
export const gpuJourney = {
  mode: 'world', duration: 10.4,

  init(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x010204); s.fog = new THREE.FogExp2(0x010204, 0.03);
    this.cam = new THREE.PerspectiveCamera(55, 1, 0.01, 200);
    s.add(new THREE.AmbientLight(0x8090b0, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(-5, 10, 6); s.add(key);
    this.u = { uTime: { value: 0 } };
    // motherboard
    const board = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.55, metalness: 0.25 }));
    board.rotation.x = -Math.PI / 2; s.add(board);
    // chips scattered on the board
    const chipMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4, metalness: 0.3 });
    [[-8, -6, 3, 1.4], [6, -8, 2, 2], [9, 5, 4, 1.6], [-10, 7, 2.4, 2.4], [-3, 9, 5, 1.2], [12, -2, 1.5, 3]].forEach(([x, z, w, d]) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), chipMat); c.position.set(x, 0.125, z); s.add(c); });
    // the GPU package with a lid that fades away
    const pkg = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 4.6), new THREE.MeshStandardMaterial({ color: 0x1a3a1e, roughness: 0.7 })); pkg.position.y = 0.06; s.add(pkg);
    this.lid = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 3.6), new THREE.MeshStandardMaterial({ color: 0xb7bcc4, metalness: 0.95, roughness: 0.25, transparent: true }));
    this.lid.position.y = 0.32; s.add(this.lid);
    // the die: thousands of cores, grouped into clusters
    const CX = 8, CZ = 6, PX = 6, PZ = 8, cs = 0.042, gap = 0.012, cg = 0.06;
    const n = CX * CZ * PX * PZ;
    this.cores = new THREE.InstancedMesh(new THREE.BoxGeometry(cs, 0.02, cs), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const m4 = new THREE.Matrix4(); let i = 0; this.corePos = [];
    const clW = PX * (cs + gap) + cg, clD = PZ * (cs + gap) + cg;
    for (let a = 0; a < CX; a++) for (let b = 0; b < CZ; b++) for (let p = 0; p < PX; p++) for (let q = 0; q < PZ; q++) {
      const x = -CX * clW / 2 + a * clW + p * (cs + gap), z = -CZ * clD / 2 + b * clD + q * (cs + gap);
      m4.makeTranslation(x, 0.24, z); this.cores.setMatrixAt(i, m4); this.cores.setColorAt(i, new THREE.Color(0.1, 0.2, 0.3));
      this.corePos.push([x, z, a + b * CX]); i++;
    }
    s.add(this.cores);
    const die = new THREE.Mesh(new THREE.BoxGeometry(CX * clW + 0.1, 0.02, CZ * clD + 0.1), new THREE.MeshStandardMaterial({ color: 0x223, metalness: 0.6, roughness: 0.3 })); die.position.y = 0.22; s.add(die);
    // the cable and glowing traces
    const pulseMat = (col) => new THREE.ShaderMaterial({
      uniforms: { uTime: this.u.uTime, uCol: { value: new THREE.Color(col) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uTime; uniform vec3 uCol; varying vec2 vUv; void main(){ float p = fract(vUv.x * 9.0 - uTime * 1.6); float g = smoothstep(0.85, 1.0, p) * 3.0 + 0.15; gl_FragColor = vec4(uCol * g, 1.0);\n#include <colorspace_fragment>\n}',
    });
    const cable = new THREE.CatmullRomCurve3([[-34, 16, 18], [-28, 12, 12], [-22, 4, 6], [-17, 0.6, 2.5], [-14, 0.35, 0]].map((v) => new THREE.Vector3(...v)));
    s.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 120, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.5 })));
    s.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 200, 0.12, 8), pulseMat(0x5ab4ff)));
    const conn = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.8, roughness: 0.3 })); conn.position.set(-14, 0.35, 0); s.add(conn);
    const traces = [[[-13.3, 0.03, 0], [-9, 0.03, 0], [-7, 0.03, 1.2], [-2.3, 0.03, 1.2]], [[-13.3, 0.03, -0.3], [-8, 0.03, -0.3], [-6, 0.03, -1.6], [-2.3, 0.03, -1.6]], [[-13.3, 0.03, 0.3], [-10, 0.03, 0.3], [-9, 0.03, 3], [-1, 0.03, 3], [-1, 0.03, 2.3]]];
    traces.forEach((pts) => {
      const c = new THREE.CurvePath(); for (let k = 1; k < pts.length; k++) c.add(new THREE.LineCurve3(new THREE.Vector3(...pts[k - 1]), new THREE.Vector3(...pts[k])));
      s.add(new THREE.Mesh(new THREE.TubeGeometry(c, 80, 0.045, 6), pulseMat(0xffb547)));
    });
    // matrix hologram
    this.hc = document.createElement('canvas'); this.hc.width = 1024; this.hc.height = 460;
    this.htex = new THREE.CanvasTexture(this.hc); this.htex.colorSpace = THREE.SRGBColorSpace;
    this.holo = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.495), new THREE.MeshBasicMaterial({ map: this.htex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0 }));
    this.holo.position.set(0.2, 0.62, 0.1); s.add(this.holo);
    const beamUp = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.38, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beamUp.position.set(0.2, 0.42, 0.1); beamUp.rotation.x = Math.PI; s.add(beamUp); this.beamUp = beamUp;
    this.path = keyPath([
      [0, [-37, 18.5, 22], [-30, 13, 13]],
      [1.8, [-24, 8, 11], [-17, 1, 2]],
      [3.4, [-13, 2.4, 3.5], [-6, 0, 0.5]],
      [5.0, [-3.2, 2.2, 3.2], [0, 0.2, 0]],
      [6.4, [-0.4, 1.3, 1.1], [0, 0.2, 0]],
      [8.2, [0.5, 0.75, 1.05], [0.2, 0.55, 0.1]],
      [10.4, [0.22, 0.63, 0.32], [0.2, 0.62, 0.0]],
    ]);
  },

  drawHolo(step) {
    const x = this.hc.getContext('2d'), W = this.hc.width, H = this.hc.height;
    x.clearRect(0, 0, W, H);
    const M = [[1.21, 0, 0.42, 0], [0, 1.6, 0, 0], [0.31, 0, -0.95, -0.2], [0.29, 0, -0.95, 0]];
    const v = [0.75, 0.5, -3.1, 1];
    const r = M.map((row) => row.reduce((a, m, i) => a + m * v[i], 0));
    x.font = '600 34px "JetBrains Mono", monospace'; x.textBaseline = 'middle';
    const row = step % 4;
    x.strokeStyle = 'rgba(120,200,255,0.8)'; x.lineWidth = 3;
    const br = (x0, w) => { x.beginPath(); x.moveTo(x0 + 12, 30); x.lineTo(x0, 30); x.lineTo(x0, 300); x.lineTo(x0 + 12, 300); x.stroke(); x.beginPath(); x.moveTo(x0 + w - 12, 30); x.lineTo(x0 + w, 30); x.lineTo(x0 + w, 300); x.lineTo(x0 + w - 12, 300); x.stroke(); };
    br(20, 470); br(540, 140); br(780, 200);
    M.forEach((rw, i) => rw.forEach((m, j) => { x.fillStyle = i === row ? '#ffe7b8' : 'rgba(150,210,255,0.85)'; x.fillText(m.toFixed(2).padStart(5), 34 + j * 112, 60 + i * 70); }));
    v.forEach((m, i) => { x.fillStyle = '#ffe7b8'; x.fillText(m.toFixed(2).padStart(5), 552, 60 + i * 70); });
    x.fillStyle = 'rgba(150,210,255,0.9)'; x.fillText('×', 498, 165); x.fillText('=', 735, 165);
    r.forEach((m, i) => { x.fillStyle = i <= row ? '#ffffff' : 'rgba(255,255,255,0.15)'; x.fillText(m.toFixed(2).padStart(6), 790, 60 + i * 70); });
    x.font = '500 24px "JetBrains Mono", monospace'; x.fillStyle = '#ffe7b8';
    x.fillText(M[row].map((m, j) => `${m.toFixed(2)}×${v[j].toFixed(2)}`).join(' + ') + ` = ${r[row].toFixed(2)}`, 24, 360);
    x.fillStyle = 'rgba(150,210,255,0.8)'; x.fillText('one vertex · one 4×4 matrix · 16 multiplies, 12 adds', 24, 410);
    this.htex.needsUpdate = true;
  },

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); },

  start(app) {
    this.t = 0; this.done = false; this._step = -1;
    this.setAspect(window.innerWidth / window.innerHeight);
    this.lid.material.opacity = 1;
    app.audio.whoosh(3, false, 0.25);
    setTimeout(() => app.ui.titleCard('', 'Follow the electricity', 'Out of the screen, down the cable, across the board, to the chip that draws every frame.', 3200), 300);
    setTimeout(() => { app.ui.titleCard('', 'Inside the graphics chip', 'Thousands of small cores, all running the same short program on different data.', 3000); app.audio.whoosh(1.5, true, 0.2); }, 5300);
    setTimeout(() => app.ui.titleCard('', '', 'Every vertex is multiplied by a 4×4 matrix. Millions of times per frame, side by side.', 2600), 8000);
  },

  update(dt, t, app) {
    this.t += dt; const k = this.t;
    this.u.uTime.value = k;
    const c = this.path(Math.min(k, this.duration));
    this.cam.position.copy(c.pos); this.cam.lookAt(c.look);
    this.lid.material.opacity = 1 - clamp((k - 5.6) / 1.0);
    this.lid.visible = this.lid.material.opacity > 0.02;
    // cores flash in waves: the same work, everywhere at once
    const col = new THREE.Color();
    for (let i = 0; i < this.corePos.length; i++) {
      const [x, z, cl] = this.corePos[i];
      const w = Math.sin(k * 6 - Math.hypot(x, z) * 14 + cl * 0.7);
      const b = Math.max(0, w) ** 6;
      col.setRGB(0.08 + b * 0.6, 0.18 + b * 1.4, 0.3 + b * 2.2);
      this.cores.setColorAt(i, col);
    }
    this.cores.instanceColor.needsUpdate = true;
    const hv = clamp((k - 7.2) / 0.8);
    this.holo.material.opacity = hv; this.beamUp.material.opacity = hv * 0.25;
    this.holo.lookAt(this.cam.position);
    const st = Math.floor(Math.max(0, k - 7.2) / 0.55);
    if (st !== this._step) { this._step = st; this.drawHolo(st); if (k > 7.2) app.audio.tone(880 + (st % 4) * 220, 0.06, { wave: 'sine', vel: 0.05 }); }
    if (Math.random() < dt * 20 && k < 7) app.audio.tone(1500 + Math.random() * 3000, 0.015, { wave: 'square', vel: 0.012 });
    if (k >= this.duration) this.done = true;
  },

  finish() {},
  render(renderer, target) { renderer.setRenderTarget(target); renderer.render(this.scene, this.cam); },
};

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

function boardTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 2048; const x = c.getContext('2d');
  x.fillStyle = '#0b2412'; x.fillRect(0, 0, 2048, 2048);
  let s = 11; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    let px = R() * 2048, py = R() * 2048; x.strokeStyle = R() > 0.85 ? 'rgba(212,170,80,0.75)' : 'rgba(40,110,60,0.9)'; x.lineWidth = 2 + R() * 4;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 4; k++) { const L = 40 + R() * 260; if (R() > 0.5) px += (R() > 0.5 ? 1 : -1) * L; else py += (R() > 0.5 ? 1 : -1) * L; if (R() > 0.6) { px += L * 0.4; py += L * 0.4; } x.lineTo(px, py); }
    x.stroke();
    x.fillStyle = '#d4aa50'; x.beginPath(); x.arc(px, py, x.lineWidth * 1.6, 0, 7); x.fill();
  }
  for (let i = 0; i < 400; i++) { x.fillStyle = 'rgba(212,170,80,0.6)'; x.fillRect(R() * 2048, R() * 2048, 10, 6); }
  x.fillStyle = 'rgba(230,230,210,0.5)'; x.font = '600 26px "JetBrains Mono", monospace';
  ['MoG-1 REV.B', 'PCIe ×16', 'VRAM', 'GPU0', 'PWR 12V', 'C114', 'R72', 'L3'].forEach((t, i) => x.fillText(t, 140 + (i * 233) % 1700, 180 + ((i * 577) % 1700)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
