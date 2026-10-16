/**
 * A Scope owns everything a room creates while it is active: listeners,
 * timers, tweens, DOM nodes and scene objects. Disposing the scope undoes
 * all of it, in reverse order, which is what lets visitors jump backwards
 * and forwards through the museum without leaks or stray callbacks.
 */
export class Scope {
  /** @param {import('./Tweens.js').Tweens} tweens */
  constructor(tweens) {
    this.tweens = tweens;
    this._disposers = [];
    this.disposed = false;
  }

  /** Register a cleanup function. Runs immediately if the scope is already gone. */
  add(fn) {
    if (this.disposed) { fn(); return fn; }
    this._disposers.push(fn);
    return fn;
  }

  listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.add(() => target.removeEventListener(type, handler, options));
  }

  timeout(fn, ms) {
    const id = setTimeout(() => { if (!this.disposed) fn(); }, ms);
    this.add(() => clearTimeout(id));
    return id;
  }

  /** A tween that is cancelled (its promise resolves false) when the scope is disposed. */
  tween(duration, onUpdate, opts) {
    const h = this.tweens.to(duration, onUpdate, opts);
    this.add(h.cancel);
    return h;
  }

  /** Resolves true after `seconds`, or false if the scope goes away first. */
  wait(seconds) { return this.tween(seconds, () => {}, { ease: 'linear' }).promise; }

  /** Attach a DOM node to `parent` for the lifetime of the scope. */
  mount(node, parent) {
    parent.appendChild(node);
    this.add(() => node.remove());
    return node;
  }

  /** Add a three.js object to a parent for the lifetime of the scope. */
  attach(object, parent) {
    parent.add(object);
    this.add(() => parent.remove(object));
    return object;
  }

  /** Subscribe to an emitter with `on(type, fn)` returning an unsubscribe function. */
  on(emitter, type, fn) { this.add(emitter.on(type, fn)); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    while (this._disposers.length) {
      const fn = this._disposers.pop();
      try { fn(); } catch (err) { console.error(err); }
    }
  }
}
