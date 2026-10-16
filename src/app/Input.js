import * as THREE from 'three';

/**
 * Routes pointer input. A press first tries the room's pickable meshes:
 *  - a mesh with `userData.control` (button, knob, switch) gets the gesture;
 *  - a mesh with `userData.surface` (a screen or a framed canvas) gets it
 *    translated to that surface's own pixel coordinates;
 *  - otherwise the room receives it as a plain screen-space event.
 * Whoever receives the press keeps the gesture until release.
 */
export class Input {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.capture = null;       // { kind: 'control' | 'surface' | 'room', target }
    this.hovered = null;
    const on = (type, fn, opts) => canvas.addEventListener(type, fn, opts);
    on('pointerdown', (e) => this._down(e));
    on('pointermove', (e) => this._move(e));
    on('pointerup', (e) => this._up(e));
    on('pointercancel', (e) => this._up(e));
    on('wheel', (e) => this._wheel(e), { passive: true });
    on('contextmenu', (e) => e.preventDefault());
    on('pointerleave', () => this._setHover(null));
  }

  _base(e, type) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    this.ndc.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
    return { type, x, y, w: r.width, h: r.height, nx: this.ndc.x, ny: this.ndc.y, buttons: e.buttons, button: e.button, shift: e.shiftKey, pointerType: e.pointerType, deltaY: e.deltaY || 0 };
  }

  _pick() {
    const room = this.app.room;
    const cam = room?.camera;
    const list = room?.pickables?.() || [];
    if (!cam || !list.length) return null;
    this.ray.setFromCamera(this.ndc, cam);
    const hit = this.ray.intersectObjects(list, false)[0];
    return hit || null;
  }

  _surfaceEvent(ev, mesh, hit) {
    const surface = mesh.userData.surface;
    let uv = hit?.uv;
    if (!uv) {
      // outside the surface during a drag: project onto its plane
      const cam = this.app.room.camera;
      this.ray.setFromCamera(this.ndc, cam);
      const inv = mesh.matrixWorld.clone().invert();
      const local = this.ray.ray.clone().applyMatrix4(inv);
      const p = new THREE.Vector3();
      if (!local.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p)) return { ...ev, surface, inside: false, sx: -1, sy: -1 };
      const g = mesh.geometry.parameters;
      uv = new THREE.Vector2(p.x / g.width + 0.5, p.y / g.height + 0.5);
    }
    const c = surface.uvToCanvas(uv);
    return { ...ev, surface, sx: c.x, sy: c.y, inside: c.inside && !!hit };
  }

  _down(e) {
    if (this.app.busy) return;
    this.canvas.focus({ preventScroll: true });
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.app.audio.init();
    const ev = this._base(e, 'down');
    const hit = this._pick();
    const ctl = hit?.object.userData.control;
    if (ctl && ctl.enabled) {
      this.capture = { kind: 'control', target: ctl };
      ctl.onDown(ev);
      this.app.onVisitorAction();
      return;
    }
    if (hit?.object.userData.surface) {
      this.capture = { kind: 'surface', target: hit.object };
      this._send(this._surfaceEvent(ev, hit.object, hit));
      return;
    }
    this.capture = { kind: 'room' };
    this._send(ev);
  }

  _move(e) {
    const ev = this._base(e, 'move');
    const cap = this.capture;
    if (cap?.kind === 'control') { cap.target.onMove(ev); return; }
    if (cap?.kind === 'surface') {
      const hit = this._pick();
      this._send(this._surfaceEvent(ev, cap.target, hit?.object === cap.target ? hit : null));
      return;
    }
    if (cap?.kind === 'room') { this._send(ev); return; }
    // hover
    const hit = this._pick();
    const ctl = hit?.object.userData.control;
    this._setHover(ctl && ctl.enabled ? ctl : null);
    if (hit?.object.userData.surface) this._send(this._surfaceEvent(ev, hit.object, hit));
    else this._send({ ...ev, surface: null });
  }

  _up(e) {
    const ev = this._base(e, 'up');
    const cap = this.capture;
    this.capture = null;
    if (cap?.kind === 'control') { cap.target.onUp(ev); return; }
    if (cap?.kind === 'surface') { this._send(this._surfaceEvent(ev, cap.target, null)); return; }
    this._send(ev);
  }

  _wheel(e) { if (!this.app.busy) this._send(this._base(e, 'wheel')); }

  _setHover(ctl) {
    if (this.hovered === ctl) return;
    this.hovered?.setHover(false);
    this.hovered = ctl;
    ctl?.setHover(true);
    this.canvas.style.cursor = ctl ? ctl.cursor : '';
  }

  _send(ev) {
    const room = this.app.room;
    if (!room || this.app.chrome.modalOpen) return;
    try { room.pointer?.(ev); } catch (err) { console.error(err); }
  }

  /** Rooms call this when their content is replaced, so no stale hover remains. */
  reset() { this._setHover(null); this.capture = null; }
}
