/**
 * A Tour is a room's guided demonstration: an ordered list of steps, each
 * with one short caption. Steps play by themselves like a museum film, and
 * the visitor can step through them or take over at any moment.
 *
 * Every step must fully establish its own state in `enter` (never rely on
 * the previous step having run) so visitors can jump to any step in any
 * order, including backwards.
 *
 * @typedef {object} TourStep
 * @property {string} caption           one short sentence
 * @property {number} [duration]        seconds before auto-advancing (omit to wait for the visitor)
 * @property {() => void} [enter]
 * @property {(t:number, dt:number) => void} [update]   t = seconds since the step began
 * @property {() => void} [exit]
 */
export class Tour {
  /**
   * @param {TourStep[]} steps
   * @param {{ onChange?: (tour: Tour) => void, onFinish?: () => void }} [hooks]
   */
  constructor(steps, hooks = {}) {
    this.steps = steps;
    this.hooks = hooks;
    this.index = -1;
    this.time = 0;
    this.autoplay = true;
    this.reachedEnd = false;
  }

  get step() { return this.steps[this.index]; }
  get last() { return this.index === this.steps.length - 1; }

  go(i) {
    const n = Math.max(0, Math.min(this.steps.length - 1, i));
    if (this.step) this._call(this.step.exit);
    this.index = n;
    this.time = 0;
    this._call(this.step.enter);
    if (this.last && !this.reachedEnd) { this.reachedEnd = true; this.hooks.onFinish?.(); }
    this.hooks.onChange?.(this);
  }

  next() { if (!this.last) this.go(this.index + 1); }
  prev() { if (this.index > 0) this.go(this.index - 1); }

  /** The visitor touched the exhibit: stop driving it for them. */
  pause() { if (this.autoplay) { this.autoplay = false; this.hooks.onChange?.(this); } }
  play() {
    this.autoplay = true;
    if (this.last && this.step.duration !== undefined) this.go(0); else this.hooks.onChange?.(this);
  }

  update(dt) {
    const s = this.step;
    if (!s) return;
    this.time += dt;
    this._call(s.update, this.time, dt);
    if (this.autoplay && s.duration !== undefined && this.time >= s.duration && !this.last) this.next();
  }

  stop() {
    if (this.step) this._call(this.step.exit);
    this.index = -1;
  }

  _call(fn, ...args) {
    if (!fn) return;
    try { fn(...args); } catch (err) { console.error(err); }
  }
}
