import * as THREE from 'three';
import { WorldRoom } from '../world/WorldRoom.js';

// ROOM 09 · Light and normals.
// The same room, lit three ways as history went: one brightness per
// triangle, then lighting computed at the corners and blended, then
// lighting computed for every pixel. The light can be grabbed and moved.

const HOME = new THREE.Vector3(0, 5.25, -0.4);
const DEMO_Y = 3.4;

export default (app) => new LightRoom(app, {
  id: 'light', title: 'Light and Normals', years: '1971 – 1977', music: 'fm',
  secrets: [
    { id: 'move-light', title: 'Lighting designer', hint: 'Grab the light and move it.', desc: 'Every pixel was relit, from scratch, for every frame you dragged.' },
  ],
  notes: [
    { title: 'Facing the light', body: [
      'A surface facing a light head-on catches the most light; tilt it away and the same light spreads over more area, so it looks dimmer. The brightness follows the angle between the direction the surface faces (its normal) and the direction of the light:',
      { eq: 'brightness = max(0, N · L)' },
      'That dot product is three multiplications and two additions.',
    ] },
    { title: 'Flat, Gouraud, Phong', body: [
      'Flat shading gives each triangle one brightness, so curved things look faceted. Gouraud shading (1971) lights only the corners and blends the colours across each triangle: smooth, but small highlights smear or disappear. Phong shading (1973–75) blends the normals instead and lights every pixel: crisp highlights, far more arithmetic.',
    ] },
  ],
});

class LightRoom extends WorldRoom {
  enter(scope, ctx) {
    const w = this.world;
    this.begin(scope, ctx, 'zbuffer', 'spheres');
    this.orbitLight = true;
    this.angle = 0.6;
    w.lightOrb.visible = true;
    w.setDetail(18);
    scope.add(() => { w.u.uLightPos.value.copy(HOME); w.lightOrb.visible = false; w.setDetail(40); this.drag = null; });

    const tray = this.app.chrome.tray(scope, 'Lab');
    this.modeSeg = tray.segmented('Shading', [{ value: 'flat', label: 'Flat' }, { value: 'gouraud', label: 'Gouraud' }, { value: 'phong', label: 'Phong' }], 'flat', (v) => { this.tour.pause(); this.stage(v, { duration: 1.4 }); });
    this.normalsBtn = tray.button('Show normals', (on) => { w.showNormals = on; this.tour.pause(); }, { toggle: true });
    tray.button('Smooth spheres', (on) => w.setDetail(on ? 48 : 18), { toggle: true });
    tray.note('Drag the glowing light.');

    this.tour = this.startTour(scope, [
      { caption: 'Tilt each triangle toward the light and it gets brighter. One shade per triangle.', duration: 8,
        enter: () => { this.stage('flat'); this.modeSeg.set('flat'); w.shot('spheres', 2.5); } },
      { caption: 'Each corner also stores which way its surface faces: its normal.', duration: 7,
        enter: () => { this.stage('flat'); w.showNormals = true; this.normalsBtn.set(true); },
        exit: () => { w.showNormals = false; this.normalsBtn.set(false); } },
      { caption: 'Light the corners and blend between them. Smooth, but the highlights smear.', duration: 8,
        enter: () => { this.stage('gouraud'); this.modeSeg.set('gouraud'); } },
      { caption: 'Light every single pixel instead, and highlights turn sharp.', duration: 8,
        enter: () => { this.stage('phong'); this.modeSeg.set('phong'); } },
      { caption: 'Your turn: drag the light. Every pixel is relit, every frame.',
        enter: () => { this.stage('phong'); this.modeSeg.set('phong'); w.setDetail(48); } },
    ]);
  }

  pointer(e) {
    const w = this.world;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(e.nx, e.ny), w.camera);
    if (e.type === 'down' && ray.intersectObject(w.lightOrb, false).length) {
      this.drag = new THREE.Plane().setFromNormalAndCoplanarPoint(w.camera.getWorldDirection(new THREE.Vector3()).negate(), w.lightOrb.position);
      this.orbitLight = false;
      this.tour.pause();
      return;
    }
    if (this.drag) {
      if (e.type === 'move' && e.buttons) {
        const p = new THREE.Vector3();
        if (ray.ray.intersectPlane(this.drag, p)) {
          p.clamp(new THREE.Vector3(-4.6, 0.3, -4.1), new THREE.Vector3(4.6, 5.3, 7.5));
          w.u.uLightPos.value.copy(p);
          this.app.secret('move-light', 'Lighting designer', 'Every pixel was relit from scratch for every frame you dragged.');
        }
      }
      if (e.type === 'up') this.drag = null;
      return;
    }
    if (e.type === 'move' && !e.buttons) this.app.canvas.style.cursor = ray.intersectObject(w.lightOrb, false).length ? 'grab' : '';
    super.pointer(e);
  }

  update(dt, t) {
    const w = this.world;
    if (this.orbitLight) {
      this.angle += dt * 0.45;
      w.u.uLightPos.value.set(Math.cos(this.angle) * 3.2, DEMO_Y + Math.sin(t * 0.7) * 0.6, Math.sin(this.angle) * 2.6 + 1.2);
    }
    w.lightOrb.position.copy(w.u.uLightPos.value);
    super.update(dt, t);
  }
}
