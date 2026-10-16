import { clamp, ease as easings } from './math.js';

/**
 * Frame-driven tweens. Every tween resolves its promise exactly once:
 * with `true` when it completes, or `false` when it is cancelled. That
 * makes `if (!(await tween)) return;` a safe way to abandon a sequence
 * when its owner (usually a room) goes away.
 */
export class Tweens {
  constructor() { this.active = new Set(); }

  /**
   * @param {number} duration seconds
   * @param {(k:number)=>void} onUpdate called every frame with eased progress 0..1
   * @param {{ease?: string | ((t:number)=>number), delay?: number}} [opts]
   */
  to(duration, onUpdate, opts = {}) {
    const fn = typeof opts.ease === 'function' ? opts.ease : easings[opts.ease || 'inOutCubic'];
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    const tw = { t: -(opts.delay || 0), duration: Math.max(1e-4, duration), fn, onUpdate, resolve, done: false };
    this.active.add(tw);
    return {
      promise,
      then: (a, b) => promise.then(a, b),
      cancel: () => this._finish(tw, false),
      get done() { return tw.done; },
    };
  }

  update(dt) {
    for (const tw of this.active) {
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = clamp(tw.t / tw.duration);
      try { tw.onUpdate(tw.fn(k)); } catch (err) { console.error(err); this._finish(tw, false); continue; }
      if (k >= 1) this._finish(tw, true);
    }
  }

  _finish(tw, ok) {
    if (tw.done) return;
    tw.done = true;
    this.active.delete(tw);
    tw.resolve(ok);
  }
}
