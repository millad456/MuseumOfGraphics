import * as THREE from 'three';

/**
 * The part of the window not covered by the HUD, the caption and the tray,
 * in CSS pixels. Rooms frame their exhibits inside it.
 */
export function freeArea(trayOpen = true) {
  const W = window.innerWidth, H = window.innerHeight, narrow = W < 760;
  const top = narrow ? 56 : 72;
  let bottom = narrow ? 210 : 196;
  const left = narrow ? 8 : 28, right = trayOpen && !narrow ? 300 : narrow ? 8 : 28;
  if (narrow && trayOpen) {
    // on phones the tray sits above the caption, so the free area ends at its top edge
    const tray = document.querySelector('.tray:not([hidden])');
    if (tray) bottom = Math.max(bottom, H - tray.getBoundingClientRect().top + 8);
  }
  return { W, H, left, right, top, bottom, w: Math.max(160, W - left - right), h: Math.max(140, H - top - bottom) };
}

const _v = new THREE.Vector3();

/**
 * Place `camera` looking along `dir` so that every point in `points` lands
 * inside the free area. Works for any perspective, by refining the distance
 * and the aim a few times against the real projection.
 */
export function fitCamera(camera, points, dir, { trayOpen = true, margin = 1.04 } = {}) {
  const a = freeArea(trayOpen);
  camera.aspect = a.W / a.H; camera.updateProjectionMatrix();
  const d = dir.clone().normalize();
  const center = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  // the free area as a rectangle in normalised device coordinates
  const nx0 = (a.left / a.W) * 2 - 1, nx1 = ((a.W - a.right) / a.W) * 2 - 1;
  const ny0 = 1 - ((a.H - a.bottom) / a.H) * 2, ny1 = 1 - (a.top / a.H) * 2;
  let dist = 10;
  const look = center.clone();
  for (let it = 0; it < 6; it++) {
    camera.position.copy(look).addScaledVector(d, -dist);
    camera.lookAt(look); camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      _v.copy(p).project(camera);
      x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y);
    }
    const s = Math.max((x1 - x0) / (nx1 - nx0), (y1 - y0) / (ny1 - ny0)) * margin;
    // move the aim so the picture's centre sits on the free area's centre
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist, halfW = halfH * camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    look.addScaledVector(right, (((x0 + x1) / 2 - (nx0 + nx1) / 2) * halfW))
      .addScaledVector(up, (((y0 + y1) / 2 - (ny0 + ny1) / 2) * halfH));
    dist *= s;
  }
  camera.position.copy(look).addScaledVector(d, -dist);
  camera.lookAt(look);
  return { position: camera.position.clone(), look };
}
