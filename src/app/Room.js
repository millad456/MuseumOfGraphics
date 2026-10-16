import { Tour } from '../core/Tour.js';

/**
 * Base class for every room. A room is created once and may be entered
 * and left any number of times, in any order. Everything that belongs to a
 * single visit is created in `enter(scope)` and registered with that
 * scope; `scope.dispose()` (run by the App when the visitor leaves) must
 * restore the room to a neutral state.
 *
 * A room must stay renderable after it is left, because the App may
 * capture its last frame for a transition.
 */
export class Room {
  /**
   * @param {import('./App.js').App} app
   * @param {{ id: string, title: string, years?: string, music?: string, notes?: object[], secrets?: object[] }} meta
   */
  constructor(app, meta) {
    this.app = app;
    this.id = meta.id;
    this.title = meta.title;
    this.years = meta.years || '';
    this.music = meta.music || 'silent';
    this.notes = meta.notes || [];
    this.secrets = meta.secrets || [];
    this.loaded = false;
  }

  /** Heavy one-time setup. Called before the first visit. */
  async load() {}

  /** Camera used for picking meshes under the pointer. */
  get camera() { return null; }

  /** Meshes the pointer can hit (controls and surfaces). */
  pickables() { return []; }

  /** 'dissolve' cross-fades from the previous room's last frame; 'none' lets the room handle the change itself. */
  transitionFrom(/* fromRoom */) { return 'dissolve'; }

  // eslint-disable-next-line no-unused-vars
  enter(scope, ctx) {}
  // eslint-disable-next-line no-unused-vars
  update(dt, t) {}
  // eslint-disable-next-line no-unused-vars
  render(renderer, target) {}
  // eslint-disable-next-line no-unused-vars
  pointer(e) {}
  // eslint-disable-next-line no-unused-vars
  key(e, down) { return false; }

  /** Start this visit's guided tour. */
  startTour(scope, steps, { start = 0 } = {}) {
    const tour = new Tour(steps, {
      onChange: () => this.app.chrome.updateTour(),
      onFinish: () => this.app.markReady(),
    });
    this.app.setTour(tour, scope);
    tour.go(start);
    return tour;
  }
}
