import * as THREE from 'three';
import { label, MAT, roundedBox } from './props.js';
import { glowTexture } from '../gfx/three-utils.js';
import { damp, ease } from '../core/math.js';
import { buildTerminal } from './devices/Terminal.js';
import { buildVectorScope } from './devices/VectorScope.js';
import { buildCutawayTV, buildFrame } from './devices/Gallery.js';
import { buildArcade } from './devices/Arcade.js';
import { buildPC } from './devices/PC.js';

// The museum hall: one long dark gallery with a spotlight over each
// machine. Rooms of the first half all live here; moving between them is a
// camera glide down the hall, never a cut.

const WALL_Z = -2.5;

/** Where everything stands. x runs along the hall. */
const LAYOUT = [
  { id: 'terminal', x: 0, z: 0, era: '1970s', title: 'Video terminal', years: '1965 – 1980' },
  { id: 'vector', x: 4.3, z: 0, era: '1960s', title: 'Vector display', years: '1962 – 1985' },
  { id: 'tv', x: 8.5, z: 0.2, era: '1980s', title: 'The raster screen', years: '1975 – 1995' },
  { id: 'palette', x: 10.9, frame: true, title: 'Sixteen colours', canvas: [960, 600] },
  { id: 'dither', x: 13.2, frame: true, title: 'Dithering', canvas: [960, 600] },
  { id: 'cycling', x: 15.5, frame: true, title: 'Colour cycling', canvas: [960, 600] },
  { id: 'tiles', x: 17.8, frame: true, title: 'Tiles', canvas: [960, 600] },
  { id: 'sprites', x: 20.1, frame: true, title: 'Sprites', canvas: [960, 600] },
  { id: 'arcade', x: 22.9, z: 0, era: '1980s', title: 'Arcade cabinet', years: '1980 – 1995' },
  { id: 'pc', x: 27.0, z: 0, era: '1990s', title: 'Personal computer', years: '1990 – 1995' },
];

function makeEnvironment(renderer) {
  // a dark box with a few soft panels, prefiltered for reflections on metal
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: 0x0c0c0e, side: THREE.BackSide }));
  s.add(box);
  const panel = (w, h, pos, rotY, intensity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity * 0.92, intensity * 0.82) }));
    m.position.set(...pos); m.rotation.y = rotY; m.lookAt(0, 0, 0); s.add(m);
  };
  panel(8, 1, [0, 4.8, 0], 0, 3);
  panel(3, 3, [-9, 2, 2], 0, 1.2);
  panel(3, 3, [9, 2, -3], 0, 0.8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(s, 0.04).texture;
  pmrem.dispose();
  return tex;
}

export class Hall {
  constructor(app) {
    this.app = app;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x060607);
    s.fog = new THREE.Fog(0x060607, 9, 22);
    s.environment = makeEnvironment(app.renderer);
    s.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 80);
    this.base = new THREE.Vector3(0, 1.5, 4);   // camera position before sway
    this.look = new THREE.Vector3(0, 1.3, 0);
    this.sway = new THREE.Vector2();
    this._right = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.swayTarget = new THREE.Vector2();
    this._buildRoom();
    this._buildStations();
    this.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('pointermove', (e) => this.swayTarget.set(e.clientX / window.innerWidth * 2 - 1, e.clientY / window.innerHeight * 2 - 1));
  }

  _buildRoom() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x8a8fa0, 0x0a0806, 0.25));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 14), new THREE.MeshStandardMaterial({ color: 0x121215, roughness: 0.32, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(14, 0, 3); s.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 6), new THREE.MeshStandardMaterial({ color: 0x1a191d, roughness: 0.92 }));
    wall.position.set(14, 3, WALL_Z); s.add(wall);
    const base = new THREE.Mesh(new THREE.BoxGeometry(80, 0.12, 0.04), MAT.plastic(0x0b0b0c, 0.6));
    base.position.set(14, 0.06, WALL_Z + 0.02); s.add(base);
    // a rail of small ceiling fixtures for depth
    const fixtureMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2e });
    for (let x = -4; x < 34; x += 1.4) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 12), fixtureMat);
      f.position.set(x, 4.2, 0.6); s.add(f);
    }
  }

  _buildStations() {
    const audio = this.app.audio;
    const builders = { terminal: buildTerminal, vector: buildVectorScope, tv: buildCutawayTV, arcade: buildArcade, pc: buildPC };
    this.stations = new Map();
    for (const item of LAYOUT) {
      let device;
      const anchor = new THREE.Group();
      if (item.frame) {
        device = buildFrame({ title: item.title, canvasWidth: item.canvas[0], canvasHeight: item.canvas[1] });
        anchor.position.set(item.x, 1.62, WALL_Z + 0.02);
      } else {
        device = builders[item.id]({ audio });
        anchor.position.set(item.x, 0, item.z || 0);
        this._addPlaque(item, anchor);
        const era = label(item.era, { height: 0.42, color: '#29272d', weight: 700, letterSpacing: 0.02 });
        era.position.set(item.x, 3.15, WALL_Z + 0.01);
        this.scene.add(era);
      }
      anchor.add(device.group);
      this.scene.add(anchor);
      const spot = this._addSpot(item, anchor);
      this.stations.set(item.id, { ...item, device, anchor, spot, active: 0, target: 0 });
    }
  }

  _addPlaque(item, anchor) {
    const stand = new THREE.Group(); stand.position.set(-1.05, 0, 0.75); stand.rotation.y = 0.25; anchor.add(stand);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.92, 12), MAT.metal(0x3c3e43, 0.4)); post.position.y = 0.46; stand.add(post);
    const plate = new THREE.Mesh(roundedBox(0.36, 0.2, 0.02, 0.01), MAT.plastic(0x141416, 0.5)); plate.position.y = 0.97; plate.rotation.x = -0.6; stand.add(plate);
    const t = label(item.title, { height: 0.03, color: '#ece6da' }); t.position.set(0, 0.995, 0.03); t.rotation.x = -0.6; stand.add(t);
    const y = label(item.years, { height: 0.022, color: '#e8b04a', weight: 400 }); y.position.set(0, 0.952, 0.06); y.rotation.x = -0.6; stand.add(y);
  }

  _addSpot(item, anchor) {
    const spot = new THREE.SpotLight(0xffe2bf, 0, 9, item.frame ? 0.34 : 0.5, 0.6, 1.6);
    const tgt = new THREE.Object3D();
    if (item.frame) { spot.position.set(item.x, 4.2, 0.6); tgt.position.set(item.x, 1.6, WALL_Z); }
    else { spot.position.set(item.x, 4.3, (item.z || 0) + 1.6); tgt.position.set(item.x, 0.9, item.z || 0); }
    spot.target = tgt;
    this.scene.add(spot, tgt);
    // a soft pool of light on the floor (cheap fake bounce)
    if (!item.frame) {
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffe2bf, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(item.x, 0.005, (item.z || 0) + 0.3);
      this.scene.add(pool);
      spot.userData.pool = pool;
    }
    return spot;
  }

  station(id) { return this.stations.get(id); }
  device(id) { return this.stations.get(id).device; }

  /** Which stations are lit. Everything else falls back into the dark. */
  setActive(ids) {
    for (const [id, st] of this.stations) {
      const on = ids.includes(id);
      if (on && st.target === 0) this.app.audio.relay(0.18);
      st.target = on ? 1 : 0;
    }
  }

  /** A device view (in device-local space) converted to world space. */
  view(id, name = 'main') {
    const st = this.stations.get(id);
    const v = st.device.views[name];
    st.anchor.updateMatrixWorld(true);
    return { ...v, center: v.center.clone().applyMatrix4(st.anchor.matrixWorld), yaw: (v.yaw || 0) + st.anchor.rotation.y };
  }

  /** Camera pose that fits a view into the free part of the screen. */
  fit(view) {
    const W = window.innerWidth, H = window.innerHeight;
    const narrow = W < 760;
    const trayOpen = !this.app.chrome.trayEl.hidden && !narrow;
    const top = narrow ? 56 : 72, bottom = narrow ? 210 : 196, left = narrow ? 8 : 28, rightM = trayOpen ? 300 : narrow ? 8 : 28;
    const aw = Math.max(160, W - left - rightM), ah = Math.max(140, H - top - bottom);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const wpp = Math.max(view.h / ah, view.w / aw);
    const dist = (wpp * H / 2) / Math.tan(fov / 2);
    const cx = left + aw / 2 - W / 2, cy = top + ah / 2 - H / 2;
    const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(1, 0, 0), view.pitch || 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), view.yaw || 0);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const look = view.center.clone().addScaledVector(right, -cx * wpp).addScaledVector(up, cy * wpp);
    return { pos: look.clone().addScaledVector(dir, -dist), look };
  }

  /**
   * Glide the camera to a view. Returns a promise resolving true when it
   * arrives, false if another glide replaced it.
   */
  goTo(view, { duration = 1.8, lift = 0.25 } = {}) {
    this._move?.cancel();
    this.currentView = view;
    const target = this.fit(view);
    const fromPos = this.base.clone(), fromLook = this.look.clone();
    const far = fromPos.distanceTo(target.pos);
    if (duration <= 0 || far < 1e-4) { this.base.copy(target.pos); this.look.copy(target.look); return Promise.resolve(true); }
    const arc = Math.min(1, far / 4) * lift;
    this._move = this.app.tweens.to(duration, (k) => {
      this.base.lerpVectors(fromPos, target.pos, k);
      this.base.y += Math.sin(k * Math.PI) * arc;
      this.look.lerpVectors(fromLook, target.look, ease.inOutSine(k));
    });
    return this._move.promise;
  }

  /** Snap to the current view again (after a resize or the tray opening). */
  refit(duration = 0.5) { if (this.currentView) this.goTo(this.currentView, { duration, lift: 0 }); }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.currentView && !(this._move && !this._move.done)) { const t = this.fit(this.currentView); this.base.copy(t.pos); this.look.copy(t.look); }
  }

  tick(dt) {
    for (const st of this.stations.values()) {
      st.active = damp(st.active, st.target, 3, dt);
      const k = 0.08 + st.active * 0.92;
      st.spot.intensity = (st.frame ? 26 : 34) * k;
      if (st.spot.userData.pool) st.spot.userData.pool.material.opacity = 0.05 + st.active * 0.12;
      st.device.update?.(dt);
    }
    this.sway.x = damp(this.sway.x, this.swayTarget.x, 2, dt);
    this.sway.y = damp(this.sway.y, this.swayTarget.y, 2, dt);
    // a little parallax from the pointer, scaled by how far away we stand
    const cam = this.camera;
    const dist = this.base.distanceTo(this.look);
    this._right.subVectors(this.look, this.base).cross(cam.up).normalize();
    cam.position.copy(this.base).addScaledVector(this._right, this.sway.x * 0.02 * dist).add(this._tmp.set(0, -this.sway.y * 0.012 * dist, 0));
    cam.lookAt(this.look);
    cam.updateMatrixWorld();
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }
}

/** Shared accessor so every hall room uses the same hall. */
export const getHall = (app) => app.service('hall', (a) => new Hall(a));
