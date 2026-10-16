import { Room } from '../app/Room.js';
import { getWorld } from './World.js';
import { stageIndex } from './stages.js';

/**
 * A room that takes place inside the evolving gallery. Consecutive world
 * rooms share the world without any cut: the next room simply carries on
 * from the stage the previous one finished on.
 */
export class WorldRoom extends Room {
  constructor(app, meta) {
    super(app, meta);
    this.kind = 'world';
  }

  get world() { return getWorld(this.app); }
  get camera() { return this.world.camera; }

  async load() { this.world; }

  transitionFrom(from) { return from?.kind === 'world' ? 'none' : 'dissolve'; }

  /**
   * Bring the world to this room's opening stage: a wave when arriving from
   * a neighbouring world room, an instant change otherwise.
   */
  begin(scope, ctx, stageKey, shotName) {
    const w = this.world;
    w.forceView = undefined;
    w.u.uView.value = 0;
    w.showNormals = false;
    w.lightOrb.visible = false;
    w.revealTriangles(1);
    const fromWorld = ctx.from?.kind === 'world';
    const same = w.current.key === stageKey;
    if (!same) w.setStage(stageKey, { sweep: fromWorld, duration: 1.4 });
    if (shotName) w.shot(shotName, fromWorld ? 2.5 : 0);
    scope.add(() => { w.forceView = undefined; w.u.uView.value = 0; w.showNormals = false; w.lightOrb.visible = false; w.revealTriangles(1); });
  }

  /** Sweep to a stage as part of a tour step (no-op if already there). */
  stage(key, opts) { return this.world.setStage(key, opts); }

  isAtOrPast(key) { return this.world.stageIndex >= stageIndex(key); }

  update(dt, t) { this.world.update(dt, t); }
  render(renderer, target) { this.world.render(target); }

  pointer(e) {
    if (e.type === 'down') this._drag = { x: e.x, y: e.y };
    else if (e.type === 'move' && this._drag && e.buttons) {
      this.world.orbitBy(e.x - this._drag.x, e.y - this._drag.y);
      this._drag = { x: e.x, y: e.y };
      this.tour?.pause();
    } else if (e.type === 'up') this._drag = null;
    else if (e.type === 'wheel') this.world.orbitBy(0, 0, e.deltaY);
  }
}
