import { Room } from '../app/Room.js';
import { getHall } from './Hall.js';

/**
 * A room that lives in the museum hall. Moving between two hall rooms is a
 * camera glide; arriving from anywhere else snaps the camera and lets the
 * App cross-fade.
 */
export class HallRoom extends Room {
  /**
   * @param {object} meta room meta (see Room)
   * @param {{ stations: string[] }} opts the hall stations this room lights up
   */
  constructor(app, meta, { stations }) {
    super(app, meta);
    this.stations = stations;
    this.kind = 'hall';
  }

  get hall() { return getHall(this.app); }
  get camera() { return this.hall.camera; }

  async load() { this.hall; }

  transitionFrom(from) { return from?.kind === 'hall' ? 'none' : 'dissolve'; }

  /** Light this room's stations and move the camera to `view`. */
  arrive(ctx, stationId, viewName = 'main', opts = {}) {
    const hall = this.hall;
    hall.setActive(this.stations);
    const glide = ctx.from?.kind === 'hall';
    return hall.goTo(hall.view(stationId, viewName), { duration: glide ? (opts.duration ?? 2.2) : 0, ...opts });
  }

  /** Move within the room. */
  look(stationId, viewName = 'main', opts = {}) {
    return this.hall.goTo(this.hall.view(stationId, viewName), { duration: 1.4, lift: 0.08, ...opts });
  }

  /** Controls and screens of this room's stations. */
  pickables() {
    const out = [];
    for (const id of this.stations) {
      const d = this.hall.device(id);
      if (d.controls) for (const c of Object.values(d.controls)) out.push(...c.hits);
      if (d.screen) out.push(d.screen.mesh);
      if (d.picture) out.push(d.picture);
    }
    return out;
  }

  render(renderer, target) { this.hall.render(renderer, target); }
}
