import * as THREE from 'three';
import { CRTScreen } from '../../gfx/CRTScreen.js';
import { roundedBox, bezelGeometry, MAT, label, Knob, PushButton, Toggle, Gauge } from '../props.js';

// A 1960s laboratory vector display: grey enamel cabinet, round-cornered
// tube, and a control panel whose knobs and switches drive the exhibit.

export function buildVectorScope({ audio }) {
  const group = new THREE.Group();
  const enamel = MAT.plastic(0x5b6166, 0.5);
  const dark = MAT.plastic(0x16181a, 0.6);

  const cab = new THREE.Mesh(roundedBox(1.35, 1.75, 0.95, 0.05), enamel);
  cab.position.set(0, 1.1, -0.1); group.add(cab);
  const plinth = new THREE.Mesh(roundedBox(1.45, 0.22, 1.05, 0.03), MAT.plastic(0x2a2c2f, 0.6));
  plinth.position.set(0, 0.11, -0.1); group.add(plinth);

  const SW = 0.86, SH = 0.645;
  const bezel = new THREE.Mesh(bezelGeometry(1.08, 0.86, SW, SH, 0.06, 0.12, 0.14), dark);
  bezel.position.set(0, 1.5, 0.44); group.add(bezel);
  const screen = new CRTScreen({ width: SW, height: SH, canvasWidth: 1024, canvasHeight: 768, bulge: 0.035 });
  screen.mesh.position.set(0, 1.5, 0.4); group.add(screen.mesh);
  const recess = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.02, SH + 0.02, 0.1), MAT.hole());
  recess.position.set(0, 1.5, 0.4); group.add(recess);
  const name = label('PRECISION CRT DISPLAY · TYPE 30', { height: 0.022, color: '#d6d2c6' });
  name.position.set(0, 1.0, 0.376); group.add(name);

  const panel = new THREE.Mesh(roundedBox(1.25, 0.62, 0.04, 0.02), MAT.plastic(0x3c4146, 0.5));
  panel.position.set(0, 0.6, 0.36); group.add(panel);
  const controls = {
    speed: new Knob({ text: 'BEAM SPEED', min: 0, max: 1, value: 0.6, steps: 24, audio }),
    persistence: new Knob({ text: 'GLOW TIME', min: 0, max: 1, value: 0.25, steps: 24, audio }),
    clear: new PushButton({ text: 'CLEAR', w: 0.1, h: 0.055, color: 0x2a2a2c, audio }),
    more: new PushButton({ text: '+40 LINES', w: 0.1, h: 0.055, color: 0x6b1f1a, audio }),
    mode: new Toggle({ text: 'MODE', left: 'DRAW', right: 'SOUND', audio }),
  };
  controls.speed.group.position.set(-0.47, 0.66, 0.385);
  controls.persistence.group.position.set(-0.24, 0.66, 0.385);
  controls.clear.group.position.set(0.24, 0.72, 0.385);
  controls.more.group.position.set(0.4, 0.72, 0.385);
  controls.mode.group.position.set(0.32, 0.5, 0.385);
  for (const c of Object.values(controls)) group.add(c.group);
  const gauge = new Gauge({ text: 'REDRAWS', unit: 'per second', min: 0, max: 120, redFrom: 30, w: 0.2, h: 0.14 });
  gauge.group.position.set(0.0, 0.62, 0.385); group.add(gauge.group);

  return {
    id: 'vector', group, screen, controls, gauge,
    views: {
      main: { center: new THREE.Vector3(0, 1.12, 0.4), w: 1.5, h: 1.45 },
      screen: { center: new THREE.Vector3(0, 1.5, 0.45), w: SW * 1.12, h: SH * 1.12 },
      panel: { center: new THREE.Vector3(0, 1.0, 0.4), w: 1.3, h: 1.25 },
    },
    update(dt) { for (const c of Object.values(controls)) c.update(dt); gauge.update(dt); },
  };
}
