import * as THREE from 'three';
import { CRTScreen } from '../../gfx/CRTScreen.js';
import { roundedBox, bezelGeometry, MAT, label, Knob } from '../props.js';
import { makeCanvas, canvasTexture, glowTexture } from '../../gfx/three-utils.js';

// The pixel era is shown as a small gallery: a cutaway television that
// reveals how a raster screen is painted, and framed works on the wall,
// each built around one trick artists used to work within tight limits.

/** A cutaway 1980s TV: wooden front, open back, glass tube visible. */
export function buildCutawayTV({ audio }) {
  const group = new THREE.Group();
  const wood = MAT.plastic(0x5a3a22, 0.55);
  const SW = 0.72, SH = 0.54;
  const Y = 1.47;

  const ped = new THREE.Mesh(roundedBox(1.0, 1.0, 1.0, 0.02), MAT.plastic(0x1f1f22, 0.8));
  ped.position.set(0, 0.5, 0); group.add(ped);
  // a cutaway: only the front, the top and the right side of the cabinet remain
  const front = new THREE.Mesh(bezelGeometry(1.08, 0.86, SW + 0.02, SH + 0.02, 0.06, 0.05, 0.06), wood);
  front.position.set(0, Y, 0.42); group.add(front);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.03, 0.95), wood); top.position.set(0, Y + 0.415, -0.06); group.add(top);
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.86, 0.95), wood); side.position.set(0.525, Y, -0.06); group.add(side);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.9), MAT.plastic(0x1f4a2a, 0.6)); board.position.set(0, Y - 0.42, -0.06); group.add(board);
  for (let i = 0; i < 9; i++) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05 + (i % 3) * 0.03, 10), MAT.plastic([0x2a5ad8, 0xd8b02a, 0x222222][i % 3], 0.4));
    part.position.set(-0.4 + (i % 5) * 0.2, Y - 0.39, -0.35 + Math.floor(i / 5) * 0.5); group.add(part);
  }
  const screen = new CRTScreen({ width: SW, height: SH, canvasWidth: 640, canvasHeight: 480, bulge: 0.04 });
  screen.mesh.position.set(0, Y, 0.375); group.add(screen.mesh);

  // the glass funnel and neck, see-through, so the gun and beam are visible
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fc7d6, emissive: 0x18485a, transparent: true, opacity: 0.32, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
  const funnelGeo = new THREE.CylinderGeometry(0.09, 0.42, 0.62, 4, 1, true, Math.PI / 4);
  const funnel = new THREE.Mesh(funnelGeo, glass);
  funnel.rotation.x = -Math.PI / 2; funnel.scale.set(1.25, 1, 0.95); funnel.position.set(0, Y, 0.0); group.add(funnel);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(funnelGeo), new THREE.LineBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.95 }));
  edges.rotation.copy(funnel.rotation); edges.scale.copy(funnel.scale); edges.position.copy(funnel.position); group.add(edges);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 24, 1, true), glass);
  neck.rotation.x = Math.PI / 2; neck.position.set(0, Y, -0.5); group.add(neck);
  const copper = MAT.metal(0xb8692e, 0.3);
  for (let i = 0; i < 2; i++) { const y = new THREE.Mesh(new THREE.TorusGeometry(0.11 + i * 0.02, 0.025, 10, 32), copper); y.position.set(0, Y, -0.34 - i * 0.05); group.add(y); }
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 16), MAT.metal(0x9a9da3, 0.35));
  gun.rotation.x = Math.PI / 2; gun.position.set(0, Y, -0.56); group.add(gun);
  const cathode = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  cathode.scale.setScalar(0.18); cathode.position.set(0, Y, -0.66); group.add(cathode);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6, 1, true), beamMat);
  group.add(beam);
  const beamHalo = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.add(beamHalo);
  const tubeLight = new THREE.PointLight(0x6ab8ff, 2.5, 2.2, 1.5); tubeLight.position.set(0, Y, -0.1); group.add(tubeLight);
  const spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  spot.scale.setScalar(0.09); group.add(spot);

  const speed = new Knob({ text: 'SWEEP SPEED', min: 0, max: 1, value: 0.12, steps: 20, audio });
  speed.group.position.set(0.38, 0.84, 0.505); group.add(speed.group);
  const tag = label('CUTAWAY COLOUR TELEVISION', { height: 0.02, color: '#b8b2a6' });
  tag.position.set(-0.16, 0.84, 0.505); group.add(tag);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  return {
    id: 'tv', group, screen, controls: { speed },
    views: {
      main: { center: new THREE.Vector3(0, 1.38, -0.05), w: 1.9, h: 1.2, yaw: -0.85, pitch: -0.12 },
      face: { center: new THREE.Vector3(0, Y, 0.45), w: SW * 1.15, h: SH * 1.15 },
    },
    /** Point the beam at a spot on the screen: u, v in 0..1, v downward. */
    aim(u, v, on = true) {
      a.set(0, Y, -0.6);
      b.set((u - 0.5) * SW * 0.98, Y + (0.5 - v) * SH * 0.98, 0.33);
      beam.position.copy(a).add(b).multiplyScalar(0.5);
      beam.scale.set(1, a.distanceTo(b), 1);
      beam.quaternion.setFromUnitVectors(up, dir.copy(b).sub(a).normalize());
      spot.position.copy(b);
      beamMat.opacity = on ? 0.9 : 0; beamHalo.material.opacity = on ? 0.3 : 0; spot.material.opacity = on ? 1 : 0;
    },
    update(dt) { speed.update(dt); },
  };
}

/**
 * A framed picture with a brass plaque. Its canvas is drawn by the room;
 * pointer events on the picture arrive in canvas pixels.
 */
export function buildFrame({ title, w = 1.6, h = 1.0, canvasWidth = 960, canvasHeight = 600 }) {
  const group = new THREE.Group();
  const canvas = makeCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { anisotropy: 8 });
  const frame = new THREE.Mesh(bezelGeometry(w + 0.2, h + 0.2, w + 0.02, h + 0.02, 0.06, 0.01, 0.005), MAT.plastic(0x16110d, 0.4));
  frame.position.z = 0.06; group.add(frame);
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.04, h + 0.04), MAT.plastic(0x0b0b0c, 0.9));
  group.add(backing);
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  picture.position.z = 0.005; group.add(picture);
  const plaque = new THREE.Mesh(roundedBox(0.66, 0.1, 0.012, 0.01), MAT.metal(0xb89a5a, 0.35));
  plaque.position.set(0, -h / 2 - 0.22, 0.01); group.add(plaque);
  const text = label(title.toUpperCase(), { height: 0.028, color: '#2a2214' });
  text.position.set(0, -h / 2 - 0.22, 0.018); group.add(text);
  picture.userData.surface = {
    canvas,
    uvToCanvas: (uv) => ({ x: uv.x * canvas.width, y: (1 - uv.y) * canvas.height, inside: uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1 }),
  };
  return {
    group, canvas, ctx, texture, picture,
    views: { main: { center: new THREE.Vector3(0, -0.02, 0.05), w: w + 0.24, h: h + 0.26 } },
    commit() { texture.needsUpdate = true; },
  };
}
