import * as THREE from 'three';
import { CRTScreen } from '../../gfx/CRTScreen.js';
import { roundedBox, bezelGeometry, MAT, label } from '../props.js';

// A 1970s video terminal: cream shell, deep screen hood, and a detached
// keyboard whose keys light up as the visitor types.

const ROWS = ['1234567890-=', 'QWERTYUIOP[]', "ASDFGHJKL;'", 'ZXCVBNM,./'];

export function buildTerminal() {
  const group = new THREE.Group();
  const shell = MAT.plastic(0xd8d0bb, 0.6);
  const dark = MAT.plastic(0x1d1c1a, 0.7);

  const table = new THREE.Mesh(roundedBox(1.9, 0.06, 1.15, 0.02), MAT.plastic(0x2e2620, 0.5));
  table.position.set(0, 0.9, 0.05); group.add(table);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.45, 0.5]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.88, 12), MAT.metal(0x6b6e74, 0.4));
    leg.position.set(sx, 0.45, sz); group.add(leg);
  }

  const body = new THREE.Mesh(roundedBox(1.15, 0.95, 0.95, 0.08), shell);
  body.position.set(0, 1.42, -0.26); group.add(body);
  const back = new THREE.Mesh(roundedBox(0.8, 0.7, 0.4, 0.08), shell);
  back.position.set(0, 1.4, -0.75); group.add(back);
  const SW = 0.82, SH = 0.615;
  const bezel = new THREE.Mesh(bezelGeometry(1.0, 0.8, SW + 0.04, SH + 0.04, 0.09, 0.06, 0.05), dark);
  bezel.position.set(0, 1.47, 0.32); group.add(bezel);
  const screen = new CRTScreen({ width: SW, height: SH, canvasWidth: 960, canvasHeight: 720, bulge: 0.03 });
  screen.mesh.position.set(0, 1.47, 0.265); group.add(screen.mesh);
  const recess = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.05, SH + 0.05, 0.1), MAT.hole());
  recess.position.set(0, 1.47, 0.27); group.add(recess);
  const badge = label('MoG 1970 · VIDEO TERMINAL', { height: 0.022, color: '#6a6457' });
  badge.position.set(-0.22, 1.02, 0.325); group.add(badge);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), new THREE.MeshBasicMaterial({ color: 0x1a0505 }));
  led.position.set(0.42, 1.02, 0.325); group.add(led);

  // keyboard with individually lit keys (one instanced mesh)
  const kb = new THREE.Group(); kb.position.set(0, 0.97, 0.45); kb.rotation.x = 0.12; group.add(kb);
  kb.add(new THREE.Mesh(roundedBox(1.2, 0.07, 0.36, 0.03), shell));
  const keyGeo = roundedBox(0.068, 0.03, 0.062, 0.012, 2);
  const count = ROWS.reduce((a, r) => a + r.length, 0) + 1;
  const keys = new THREE.InstancedMesh(keyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), count);
  const keyIndex = new Map();
  const m4 = new THREE.Matrix4();
  let i = 0;
  ROWS.forEach((row, r) => {
    for (let k = 0; k < row.length; k++) {
      m4.makeTranslation(-0.42 + r * 0.02 + k * 0.078, 0.045, -0.12 + r * 0.075);
      keys.setMatrixAt(i, m4); keyIndex.set(row[k], i); i++;
    }
  });
  m4.compose(new THREE.Vector3(0, 0.045, 0.19), new THREE.Quaternion(), new THREE.Vector3(5, 1, 1));
  keys.setMatrixAt(i, m4); keyIndex.set(' ', i);
  const base = new THREE.Color(0x4a4640), lit = new THREE.Color(0xffd27a), tmp = new THREE.Color();
  for (let k = 0; k < count; k++) keys.setColorAt(k, base);
  kb.add(keys);
  const glow = new Float32Array(count);

  return {
    id: 'terminal', group, screen,
    views: {
      main: { center: new THREE.Vector3(0, 1.28, 0.3), w: 1.55, h: 1.1, pitch: -0.18 },
      screen: { center: new THREE.Vector3(0, 1.47, 0.3), w: SW * 1.12, h: SH * 1.12, pitch: -0.05 },
      glass: { center: new THREE.Vector3(0, 1.47, 0.3), w: 0.06, h: 0.045 },
    },
    setPowered(on) { led.material.color.setHex(on ? 0x39ff6a : 0x1a0505); },
    pressKey(ch) {
      const idx = keyIndex.get(String(ch).toUpperCase());
      if (idx !== undefined) glow[idx] = 1;
    },
    update(dt) {
      let dirty = false;
      for (let k = 0; k < count; k++) {
        if (glow[k] <= 0) continue;
        glow[k] = Math.max(0, glow[k] - dt * 3);
        keys.setColorAt(k, tmp.copy(base).lerp(lit, glow[k]));
        dirty = true;
      }
      if (dirty) keys.instanceColor.needsUpdate = true;
    },
  };
}
