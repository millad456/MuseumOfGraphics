import * as THREE from 'three';
import { CRTScreen } from '../../gfx/CRTScreen.js';
import { roundedBox, bezelGeometry, MAT, label, PushButton, LedBar } from '../props.js';
import { makeCanvas, canvasTexture } from '../../gfx/three-utils.js';

// An upright arcade cabinet with a lit marquee, a tilted screen, a control
// panel, and beside it a small instrument stand showing CPU time per frame.

function sideProfile() {
  // cabinet side silhouette in the yz plane (y up, z toward the visitor)
  const s = new THREE.Shape();
  s.moveTo(-0.38, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.95);
  s.lineTo(0.42, 1.0); s.lineTo(0.38, 1.12); s.lineTo(0.12, 1.2);
  s.lineTo(0.2, 1.75); s.lineTo(0.12, 1.98); s.lineTo(-0.38, 1.98);
  s.lineTo(-0.38, 0);
  return s;
}

export function buildArcade({ audio }) {
  const group = new THREE.Group();
  const W = 0.78;
  const black = MAT.plastic(0x0d0d10, 0.5);
  const art = MAT.plastic(0x1d1340, 0.45);

  const sideGeo = new THREE.ExtrudeGeometry(sideProfile(), { depth: 0.03, bevelEnabled: false });
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(sideGeo, art);
    side.rotation.y = -Math.PI / 2;
    side.position.set(sx * (W / 2) + (sx > 0 ? 0.03 : 0), 0, 0);
    group.add(side);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, 1.98, 0.04), black); back.position.set(0, 0.99, -0.36); group.add(back);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(W, 0.95, 0.04), black); lower.position.set(0, 0.475, 0.29); group.add(lower);
  const coin = new THREE.Mesh(roundedBox(0.22, 0.24, 0.02, 0.01), MAT.metal(0x8a8d93, 0.35)); coin.position.set(0, 0.6, 0.315); group.add(coin);
  for (const cx of [-0.05, 0.05]) {
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.05), new THREE.MeshBasicMaterial({ color: 0xff5040 }));
    slot.position.set(cx, 0.64, 0.327); group.add(slot);
  }

  // control panel
  const panel = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.3), MAT.plastic(0x15151a, 0.5));
  panel.position.set(0, 1.06, 0.27); panel.rotation.x = 0.28; group.add(panel);
  const stick = new THREE.Group(); stick.position.set(-0.18, 1.1, 0.28); group.add(stick);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 10), MAT.metal(0xcccccc, 0.25)); shaft.position.y = 0.045; stick.add(shaft);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 16), MAT.plastic(0xd8262a, 0.3)); ball.position.y = 0.1; stick.add(ball);
  const jump = new PushButton({ text: 'JUMP', w: 0.06, h: 0.06, color: 0xd8b02a, lamp: 0xffd04a, audio });
  jump.group.position.set(0.06, 1.1, 0.285); jump.group.rotation.x = -Math.PI / 2 + 0.28; group.add(jump.group);
  const lift = new PushButton({ text: 'LIFT LAYERS', w: 0.06, h: 0.06, color: 0x2a7bd8, lamp: 0x6ab4ff, audio, toggle: true });
  lift.group.position.set(0.22, 1.1, 0.285); lift.group.rotation.x = -Math.PI / 2 + 0.28; group.add(lift.group);

  // screen, tilted back
  const SW = 0.6, SH = 0.45;
  const scrGroup = new THREE.Group(); scrGroup.position.set(0, 1.47, 0.12); scrGroup.rotation.x = -0.24; group.add(scrGroup);
  const bezel = new THREE.Mesh(bezelGeometry(W - 0.02, 0.62, SW + 0.02, SH + 0.02, 0.05, 0.01, 0.03), black); bezel.position.z = 0.03; scrGroup.add(bezel);
  const screen = new CRTScreen({ width: SW, height: SH, canvasWidth: 1024, canvasHeight: 768, bulge: 0.03 });
  scrGroup.add(screen.mesh);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.02, SH + 0.02, 0.08), MAT.hole()); scrGroup.add(hole);

  // marquee: back-lit sign
  const mc = makeCanvas(1024, 192), mx = mc.getContext('2d');
  const g = mx.createLinearGradient(0, 0, 1024, 0); g.addColorStop(0, '#2a0f5a'); g.addColorStop(0.5, '#6a1f8a'); g.addColorStop(1, '#2a0f5a');
  mx.fillStyle = g; mx.fillRect(0, 0, 1024, 192);
  mx.font = '400 120px Silkscreen, monospace'; mx.textAlign = 'center'; mx.textBaseline = 'middle';
  mx.fillStyle = '#ffd04a'; mx.shadowColor = '#ff6a2a'; mx.shadowBlur = 30; mx.fillText('PARALLAX', 512, 100);
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, 0.16), new THREE.MeshBasicMaterial({ map: canvasTexture(mc), toneMapped: false }));
  marquee.position.set(0, 1.86, 0.17); marquee.rotation.x = -0.35; group.add(marquee);
  const topper = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.56), black); topper.position.set(0, 1.97, -0.1); group.add(topper);

  // CPU instrument stand
  const stand = new THREE.Group(); stand.position.set(0.85, 0, 0.15); stand.rotation.y = -0.35; group.add(stand);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.2, 16), MAT.metal(0x55585e, 0.4)); post.position.y = 0.6; stand.add(post);
  const box = new THREE.Mesh(roundedBox(0.36, 0.5, 0.06, 0.02), MAT.plastic(0x202226, 0.5)); box.position.y = 1.42; stand.add(box);
  const cpu = new LedBar({ count: 14, w: 0.06, h: 0.36, vertical: true });
  cpu.group.position.set(-0.08, 1.44, 0.032); stand.add(cpu.group);
  const t1 = label('CPU', { height: 0.03 }); t1.position.set(0.07, 1.6, 0.032); stand.add(t1);
  const t2 = label('TIME', { height: 0.022, color: '#a39d91' }); t2.position.set(0.07, 1.55, 0.032); stand.add(t2);
  const pctCanvas = makeCanvas(256, 128), pctTex = canvasTexture(pctCanvas);
  const pct = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.07), new THREE.MeshBasicMaterial({ map: pctTex, toneMapped: false }));
  pct.position.set(0.07, 1.42, 0.033); stand.add(pct);
  let shownPct = -1;

  return {
    id: 'arcade', group, screen, screenGroup: scrGroup, controls: { jump, lift }, cpu,
    views: {
      main: { center: new THREE.Vector3(0.25, 1.35, 0.3), w: 1.75, h: 1.25 },
      screen: { center: new THREE.Vector3(0, 1.47, 0.2), w: SW * 1.2, h: SH * 1.25, pitch: -0.24 },
    },
    setCPU(k) {
      cpu.set(k);
      const p = Math.round(k * 100);
      if (p === shownPct) return;
      shownPct = p;
      const x = pctCanvas.getContext('2d');
      x.fillStyle = '#0b0c0d'; x.fillRect(0, 0, 256, 128);
      x.font = '700 84px "JetBrains Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = k > 0.85 ? '#ff5a4a' : '#7dffb0';
      x.fillText(`${p}%`, 128, 68);
      pctTex.needsUpdate = true;
    },
    update(dt) { jump.update(dt); lift.update(dt); cpu.update(dt); },
  };
}
