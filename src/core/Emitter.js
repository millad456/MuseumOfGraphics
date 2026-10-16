/** Tiny event emitter. `on` returns an unsubscribe function. */
export class Emitter {
  constructor() { this._listeners = new Map(); }

  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this._listeners.get(type)?.delete(fn);
  }

  emit(type, value) {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(value); } catch (err) { console.error(err); }
    }
  }

  clear() { this._listeners.clear(); }
}
