import * as THREE from 'three';
import { CRTScreen } from '../../gfx/CRTScreen.js';
import { roundedBox, bezelGeometry, MAT, label, PushButton } from '../props.js';

// An early-90s beige PC on a desk: monitor with front-panel buttons,
// desktop case with a turbo light, keyboard and mouse.

export function buildPC({ audio }) {
  const group = new THREE.Group();
  const beige = MAT.plastic(0xcfc6ae, 0.6);
  const beigeDark = MAT.plastic(0xb5ab92, 0.6);

  const desk = new THREE.Mesh(roundedBox(1.7, 0.06, 1.0, 0.02), MAT.plastic(0x3a3027, 0.5));
  desk.position.set(0, 0.76, 0); group.add(desk);
  for (const sx of [-0.78, 0.78]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.74, 0.9), MAT.plastic(0x2a231c, 0.6));
    leg.position.set(sx, 0.37, 0); group.add(leg);
  }
  const caseBox = new THREE.Mesh(roundedBox(1.0, 0.17, 0.72, 0.02), beige); caseBox.position.set(0, 0.875, -0.05); group.add(caseBox);
  const drive = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.01), MAT.dark()); drive.position.set(0.25, 0.9, 0.315); group.add(drive);
  const turbo = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.012), new THREE.MeshBasicMaterial({ color: 0x40ff60 })); turbo.position.set(-0.38, 0.9, 0.316); group.add(turbo);
  const caseLabel = label('486 DX2 · 66 MHz', { height: 0.016, color: '#6b6352' }); caseLabel.position.set(-0.2, 0.9, 0.316); group.add(caseLabel);

  const mon = new THREE.Mesh(roundedBox(0.82, 0.68, 0.7, 0.05), beige); mon.position.set(0, 1.32, -0.13); group.add(mon);
  const monBack = new THREE.Mesh(roundedBox(0.56, 0.48, 0.3, 0.05), beigeDark); monBack.position.set(0, 1.32, -0.55); group.add(monBack);
  const SW = 0.62, SH = 0.465;
  const bezel = new THREE.Mesh(bezelGeometry(0.8, 0.66, SW + 0.02, SH + 0.02, 0.04, 0.04, 0.03), beigeDark);
  bezel.position.set(0, 1.34, 0.27); group.add(bezel);
  const screen = new CRTScreen({ width: SW, height: SH, canvasWidth: 1024, canvasHeight: 768, bulge: 0.02 });
  screen.mesh.position.set(0, 1.34, 0.245); group.add(screen.mesh);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.02, SH + 0.02, 0.08), MAT.hole()); hole.position.set(0, 1.34, 0.245); group.add(hole);

  const btn = (text, x) => {
    const b = new PushButton({ text, w: 0.05, h: 0.022, color: 0xbdb39a, lamp: 0x40ff60, toggle: true, labelColor: '#5a5344', labelSize: 0.012, audio });
    b.group.position.set(x, 1.04, 0.275); group.add(b.group); return b;
  };
  const controls = { fisheye: btn('FISHEYE', 0.1), slow: btn('SLOW SCAN', 0.18), map: btn('MAP', 0.26) };
  const brand = label('VGA COLOR', { height: 0.016, color: '#6b6352' }); brand.position.set(-0.24, 1.04, 0.276); group.add(brand);

  const kb = new THREE.Mesh(roundedBox(0.6, 0.03, 0.2, 0.01), beige); kb.position.set(-0.05, 0.805, 0.36); kb.rotation.x = 0.06; group.add(kb);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.012, 0.15), MAT.plastic(0xa79e88, 0.6)); keys.position.set(-0.05, 0.825, 0.36); group.add(keys);
  const mouse = new THREE.Mesh(roundedBox(0.06, 0.03, 0.1, 0.02), beige); mouse.position.set(0.42, 0.805, 0.36); group.add(mouse);

  return {
    id: 'pc', group, screen, controls,
    views: {
      main: { center: new THREE.Vector3(0, 1.15, 0.3), w: 1.45, h: 1.0 },
      screen: { center: new THREE.Vector3(0, 1.34, 0.25), w: SW * 1.1, h: SH * 1.1 },
      glass: { center: new THREE.Vector3(0, 1.34, 0.25), w: 0.04, h: 0.03 },
    },
    update(dt) { for (const c of Object.values(controls)) c.update(dt); },
  };
}
