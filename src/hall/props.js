import * as THREE from 'three';
import { makeCanvas, canvasTexture } from '../gfx/three-utils.js';
import { clamp } from '../core/math.js';
import { Emitter } from '../core/Emitter.js';

// Building blocks for the machines in the hall: rounded shells, engraved
// labels and physical controls (buttons, knobs, switches, meters) that the
// visitor operates directly in 3D.

/** Rounded box centred on the origin. */
export function roundedBox(w, h, d, r = 0.04, segments = 3) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const bevel = Math.min(r, d / 4);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, d - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: segments, curveSegments: 6 });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

function roundedRectPath(p, w, h, r) {
  const x = -w / 2, y = -h / 2;
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
}

/** A frame: rounded rectangle with a rounded hole, extruded backwards from z = 0. */
export function bezelGeometry(outerW, outerH, innerW, innerH, depth, r = 0.05, ri = 0.03) {
  const s = new THREE.Shape(); roundedRectPath(s, outerW, outerH, r);
  const hole = new THREE.Path(); roundedRectPath(hole, innerW, innerH, ri); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -depth);
  return g;
}

export const MAT = {
  plastic: (color, rough = 0.55) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.0 }),
  metal: (color = 0xb8bcc4, rough = 0.3) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.9 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.7 }),
  hole: () => new THREE.MeshStandardMaterial({ color: 0x040404, roughness: 0.9, side: THREE.BackSide }),
};

/** Text painted onto a plane: engraved labels, plaques, wall lettering. */
export function label(text, { height = 0.035, color = '#e8e2d4', weight = 700, family = '"Atkinson Hyperlegible", Arial, sans-serif', bg = null, align = 'center', letterSpacing = 0.06, px = 96 } = {}) {
  const font = `${weight} ${px}px ${family}`;
  const probe = makeCanvas(8, 8).getContext('2d');
  probe.font = font;
  const spacing = letterSpacing * px;
  const chars = [...text];
  const textW = chars.reduce((a, ch) => a + probe.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1);
  const pad = px * 0.3;
  const c = makeCanvas(Math.max(8, Math.ceil(textW + pad * 2)), Math.ceil(px * 1.4));
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); }
  x.font = font; x.fillStyle = color; x.textBaseline = 'middle';
  let cx = pad;
  for (const ch of chars) { x.fillText(ch, cx, c.height / 2 + px * 0.04); cx += x.measureText(ch).width + spacing; }
  const tex = canvasTexture(c, { mipmaps: true, anisotropy: 8 });
  const w = (c.width / c.height) * height * 1.4;
  const g = new THREE.PlaneGeometry(w, height * 1.4);
  if (align === 'left') g.translate(w / 2, 0, 0); else if (align === 'right') g.translate(-w / 2, 0, 0);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.renderOrder = 2;
  m.userData.width = w;
  return m;
}

// ----------------------------------------------------------------- controls
// A control exposes `hits` (meshes the picker tests) and handles
// `onDown/onMove/onUp/setHover`. Rooms subscribe with
// `scope.on(control, 'change' | 'press', fn)`, so subscriptions end when
// the visitor leaves the room.

class Control extends Emitter {
  constructor() { super(); this.group = new THREE.Group(); this.hits = []; this.cursor = 'pointer'; this.enabled = true; }
  _hit(mesh) { mesh.userData.control = this; this.hits.push(mesh); return mesh; }
  setHover() {}
  onDown() {} onMove() {} onUp() {}
  update() {}
}

export class PushButton extends Control {
  constructor({ text = '', w = 0.09, h = 0.05, color = 0x2a2a2c, lamp = 0xffb547, toggle = false, labelColor = '#e8e2d4', labelSize = 0.02, audio } = {}) {
    super();
    this.toggle = toggle; this.state = false; this.audio = audio; this.lampColor = new THREE.Color(lamp);
    const base = new THREE.Mesh(roundedBox(w + 0.016, h + 0.016, 0.02, 0.008), MAT.dark());
    this.group.add(base);
    this.capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: 0x000000 });
    this.cap = this._hit(new THREE.Mesh(roundedBox(w, h, 0.03, 0.008), this.capMat));
    this.cap.position.z = 0.02;
    this.group.add(this.cap);
    if (text) {
      this.text = label(text, { height: labelSize, color: labelColor });
      this.text.position.set(0, -h / 2 - labelSize * 1.2, 0.012);
      this.group.add(this.text);
    }
    this._press = 0;
    this._hover = false;
  }
  setHover(on) { this._hover = on; this._refresh(); }
  setState(on) { this.state = on; this._refresh(); }
  _refresh() {
    if (this.state) { this.capMat.emissive.copy(this.lampColor); this.capMat.emissiveIntensity = 0.9; }
    else { this.capMat.emissive.setHex(this._hover ? 0x1c1c1c : 0); this.capMat.emissiveIntensity = 1; }
  }
  onDown() {
    if (!this.enabled) return;
    this._press = 1;
    this.audio?.button();
    if (this.toggle) { this.setState(!this.state); this.emit('change', this.state); }
    this.emit('press');
  }
  /** Animate a press without emitting (used by guided demos). */
  flash() { this._press = 1; this.audio?.button(); }
  update(dt) { this._press = Math.max(0, this._press - dt * 6); this.cap.position.z = 0.02 - Math.sin(this._press * Math.PI) * 0.012; }
}

export class Knob extends Control {
  constructor({ text = '', min = 0, max = 1, value = 0, steps = 20, radius = 0.045, audio } = {}) {
    super();
    Object.assign(this, { min, max, value, steps, audio });
    this.cursor = 'ns-resize';
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.15, radius * 1.2, 0.012, 32), MAT.metal(0x8a8d93, 0.35));
    skirt.rotation.x = Math.PI / 2; this.group.add(skirt);
    this.body = new THREE.Group(); this.group.add(this.body);
    this.capMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.4 });
    const cap = this._hit(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, 0.05, 32), this.capMat));
    cap.rotation.x = Math.PI / 2; cap.position.z = 0.03; this.body.add(cap);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.14, radius * 0.7, 0.004), new THREE.MeshBasicMaterial({ color: 0xffb547 }));
    mark.position.set(0, radius * 0.45, 0.057); this.body.add(mark);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x9a968c });
    for (let i = 0; i <= 10; i++) {
      const a = this._angleFor(i / 10);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.003, radius * 0.25), tickMat);
      t.position.set(Math.sin(-a) * radius * 1.45, Math.cos(-a) * radius * 1.45, 0.001); t.rotation.z = a;
      this.group.add(t);
    }
    if (text) { const l = label(text, { height: 0.018 }); l.position.set(0, -radius * 2.0, 0.001); this.group.add(l); }
    this._apply();
  }
  _angleFor(k) { return (0.75 - 1.5 * k) * Math.PI; }
  get normalized() { return (this.value - this.min) / (this.max - this.min); }
  set(value, emit = false) {
    const prevQ = Math.round(this.normalized * this.steps);
    this.value = clamp(value, this.min, this.max);
    this._apply();
    if (Math.round(this.normalized * this.steps) !== prevQ) this.audio?.detent();
    if (emit) this.emit('change', this.value);
  }
  _apply() { this.body.rotation.z = this._angleFor(this.normalized); }
  setHover(on) { this.capMat.color.setHex(on ? 0x34353a : 0x1b1c1e); }
  onDown(e) { this._drag = { y: e.y, x: e.x, v: this.normalized }; }
  onMove(e) {
    if (!this._drag) return;
    const d = (this._drag.y - e.y) + (e.x - this._drag.x);
    this.set(this.min + clamp(this._drag.v + d / 200) * (this.max - this.min), true);
  }
  onUp() { this._drag = null; }
}

export class Toggle extends Control {
  constructor({ text = '', left = 'OFF', right = 'ON', value = false, audio } = {}) {
    super();
    this.value = value; this.audio = audio;
    const plate = new THREE.Mesh(roundedBox(0.08, 0.05, 0.012, 0.006), MAT.metal(0x9a9da3, 0.4));
    this.group.add(plate);
    this.lever = new THREE.Group(); this.lever.position.z = 0.01; this.group.add(this.lever);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.07, 12), MAT.metal(0xe0e0e0, 0.2));
    stick.position.y = 0.035; this.lever.add(stick);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), MAT.metal(0xf0f0f0, 0.15));
    ball.position.y = 0.07; this.lever.add(ball);
    this._hit(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.06), new THREE.MeshBasicMaterial({ visible: false })));
    this.group.add(this.hits[0]);
    const l1 = label(left, { height: 0.015 }); l1.position.set(-0.055, -0.045, 0.007); this.group.add(l1);
    const l2 = label(right, { height: 0.015 }); l2.position.set(0.055, -0.045, 0.007); this.group.add(l2);
    if (text) { const l = label(text, { height: 0.018 }); l.position.set(0, 0.085, 0.001); this.group.add(l); }
    this._a = value ? -0.55 : 0.55;
  }
  set(v, emit = false) { this.value = v; if (emit) this.emit('change', v); }
  onDown() { if (!this.enabled) return; this.set(!this.value, true); this.audio?.button(); }
  update(dt) { const target = this.value ? -0.55 : 0.55; this._a += (target - this._a) * Math.min(1, dt * 18); this.lever.rotation.z = this._a; }
}

/** Analogue needle meter. */
export class Gauge {
  constructor({ text = '', min = 0, max = 100, w = 0.2, h = 0.13, redFrom = null, unit = '' } = {}) {
    Object.assign(this, { min, max, value: min, shown: min });
    this.group = new THREE.Group();
    const c = makeCanvas(400, 260), x = c.getContext('2d');
    x.fillStyle = '#efe8d6'; x.fillRect(0, 0, 400, 260);
    const cx = 200, cy = 235, R = 180;
    const angle = (k) => Math.PI * (1.2 + 0.6 * k);
    if (redFrom !== null) {
      x.strokeStyle = '#c0392b'; x.lineWidth = 14;
      x.beginPath(); x.arc(cx, cy, R - 10, angle(0), angle((redFrom - min) / (max - min))); x.stroke();
    }
    x.strokeStyle = '#222'; x.lineWidth = 3;
    x.beginPath(); x.arc(cx, cy, R, angle(0), angle(1)); x.stroke();
    x.fillStyle = '#222'; x.font = '700 26px "Atkinson Hyperlegible", sans-serif'; x.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const k = i / 4, a = angle(k);
      x.beginPath(); x.moveTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke();
      x.fillText(String(Math.round(min + (max - min) * k)), cx + Math.cos(a) * (R - 48), cy + Math.sin(a) * (R - 48) + 8);
    }
    x.font = '700 30px "Atkinson Hyperlegible", sans-serif'; x.fillText(text, cx, 160);
    if (unit) { x.font = '400 22px "Atkinson Hyperlegible", sans-serif'; x.fillText(unit, cx, 192); }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTexture(c, { mipmaps: true }) }));
    this.group.add(face);
    const bezel = new THREE.Mesh(roundedBox(w + 0.02, h + 0.02, 0.015, 0.01), MAT.dark()); bezel.position.z = -0.009; this.group.add(bezel);
    this.needle = new THREE.Group(); this.needle.position.set(0, -h / 2 + h * (25 / 260), 0.004); this.group.add(this.needle);
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.003, h * 0.62), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    n.position.y = h * 0.31; this.needle.add(n);
  }
  set(v) { this.value = v; }
  update(dt) {
    this.shown += (this.value - this.shown) * Math.min(1, dt * 6);
    const k = clamp((this.shown - this.min) / (this.max - this.min));
    // 0 points to the upper-left end of the arc, 1 to the upper-right
    this.needle.rotation.z = (0.5 - k) * 0.6 * Math.PI;
  }
}

/** A row of LED segments: a bar-graph meter, green to red. */
export class LedBar {
  constructor({ count = 12, w = 0.24, h = 0.03, text = '', vertical = false } = {}) {
    this.group = new THREE.Group();
    this.leds = [];
    this.value = 0;
    this.off = new THREE.Color(0x161616);
    const seg = (vertical ? h : w) / count;
    for (let i = 0; i < count; i++) {
      const k = i / (count - 1);
      const m = new THREE.Mesh(vertical ? new THREE.PlaneGeometry(w, seg * 0.75) : new THREE.PlaneGeometry(seg * 0.8, h), new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false }));
      if (vertical) m.position.y = -h / 2 + seg * (i + 0.5); else m.position.x = -w / 2 + seg * (i + 0.5);
      m.userData.on = new THREE.Color().setHSL(0.33 - k * 0.33, 0.95, 0.5);
      this.group.add(m); this.leds.push(m);
    }
    if (text) { const l = label(text, { height: 0.016 }); l.position.set(0, vertical ? -h / 2 - 0.025 : -h * 1.4, 0); this.group.add(l); }
  }
  set(k) { this.value = clamp(k); }
  update() {
    const n = Math.round(this.value * this.leds.length);
    this.leds.forEach((m, i) => m.material.color.copy(i < n ? m.userData.on : this.off));
  }
}
