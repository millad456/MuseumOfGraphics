import { h, richText } from '../core/dom.js';
import { Emitter } from '../core/Emitter.js';

/**
 * The museum's own interface: room label, caption bar with the guided
 * tour, the corridor rail, a small control tray for 3D rooms, placards,
 * toasts and title cards. Rooms never touch this DOM directly; they go
 * through these methods, and everything a room adds is removed when its
 * scope is disposed.
 *
 * Events: 'prev', 'next', 'go' (index), 'sound', 'share', 'secrets'.
 */
export class Chrome extends Emitter {
  constructor(root) {
    super();
    this.root = root;
    this._build();
    this.tour = null;
  }

  _build() {
    const r = this.root;
    this.hud = h('header', { class: 'hud' },
      this.hudNum = h('span', { class: 'hud-num' }),
      h('span', { class: 'hud-sep' }),
      this.hudTitle = h('span', { class: 'hud-title' }),
      this.hudYears = h('span', { class: 'hud-years' }));

    this.secretsBtn = h('button', { class: 'tool', title: 'Hidden things found', onclick: () => this.emit('secrets') }, h('span', { class: 'gem' }), this.secretsCount = h('span', {}, '0/0'));
    this.soundBtn = h('button', { class: 'tool', onclick: () => this.emit('sound') }, 'Sound on');
    this.shareBtn = h('button', { class: 'tool', onclick: () => this.emit('share') }, 'Share');
    this.tools = h('div', { class: 'tools' }, this.secretsBtn, this.soundBtn, this.shareBtn);

    this.capPrev = h('button', { class: 'cap-nav', 'aria-label': 'Previous step', onclick: () => this.tour?.prev() }, '‹');
    this.capNext = h('button', { class: 'cap-nav', 'aria-label': 'Next step', onclick: () => this.emit('next') }, '›');
    this.capText = h('p', { class: 'cap-text', 'aria-live': 'polite' });
    this.capDots = h('div', { class: 'cap-dots' });
    this.capPlay = h('button', { class: 'cap-play', onclick: () => (this.tour?.autoplay ? this.tour.pause() : this.tour?.play()) }, 'Pause');
    this.capInfo = h('button', { class: 'cap-info', title: 'More about this room', 'aria-label': 'More about this room', onclick: () => this.emit('info') }, 'i');
    this.caption = h('section', { class: 'caption', 'aria-label': 'Guide' },
      h('div', { class: 'cap-row' }, this.capPrev, this.capText, this.capNext),
      h('div', { class: 'cap-meta' }, this.capDots, this.capPlay, this.capInfo));

    this.railPrev = h('button', { class: 'rail-btn', 'aria-label': 'Previous room', onclick: () => this.emit('prev') }, '←');
    this.railTicks = h('nav', { class: 'rail-ticks', 'aria-label': 'Rooms' });
    this.railNext = h('button', { class: 'rail-next', onclick: () => this.emit('next') }, 'Next');
    this.rail = h('div', { class: 'rail' }, this.railPrev, this.railTicks, this.railNext);

    this.trayEl = h('aside', { class: 'tray', hidden: true, 'aria-label': 'Controls' });
    this.titlecard = h('div', { class: 'titlecard' });
    this.toasts = h('div', { class: 'toasts' });
    this.modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', onpointerdown: (e) => { if (e.target === this.modal) this.closeModal(); } });
    this.overlay = h('div', { class: 'overlay' });

    r.append(this.overlay, this.hud, this.tools, this.trayEl, this.caption, this.rail, this.titlecard, this.toasts, this.modal);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.modalOpen) { e.stopPropagation(); this.closeModal(); } }, true);
  }

  get modalOpen() { return this.modal.classList.contains('open'); }

  setChromeVisible(on) { document.body.classList.toggle('chrome-hidden', !on); }

  // ------------------------------------------------------------ room label + rail
  setRoom(index, rooms, seen, reachable) {
    const room = rooms[index];
    this.hudNum.textContent = String(index).padStart(2, '0');
    this.hudTitle.textContent = room.title;
    this.hudYears.textContent = room.years || '';
    this.railTicks.replaceChildren(...rooms.flatMap((rm, i) => {
      if (i === 0) return [];
      const can = reachable(i);
      return [h('button', {
        class: `tick${i === index ? ' cur' : ''}${seen.has(rm.id) ? ' seen' : ''}`,
        disabled: !can,
        'aria-label': `${rm.title}${rm.years ? ', ' + rm.years : ''}`,
        'aria-current': i === index ? 'step' : null,
        onclick: () => this.emit('go', i),
      }, h('span', { class: 'tip' }, `${rm.years ? rm.years + ' · ' : ''}${rm.title}`))];
    }));
    this.railPrev.disabled = index <= 1;
    this.capInfo.hidden = !(room.notes && room.notes.length);
    this.setNextLabel(index === rooms.length - 1 ? 'Begin again' : 'Next');
  }

  setNextLabel(text, ready = false) {
    this.railNext.textContent = text;
    this.railNext.classList.toggle('ready', ready);
  }

  // ------------------------------------------------------------ tour captions
  setTour(tour) {
    this.tour = tour;
    this.caption.hidden = !tour;
    if (!tour) return;
    this.capDots.replaceChildren(...tour.steps.map((s, i) => h('button', { class: 'dot', 'aria-label': `Step ${i + 1}`, onclick: () => { tour.pause(); tour.go(i); } })));
    this.updateTour();
  }

  updateTour() {
    const t = this.tour;
    if (!t || t.index < 0) return;
    if (this.capText.textContent !== t.step.caption) {
      this.capText.textContent = t.step.caption;
      this.capText.classList.remove('in'); void this.capText.offsetWidth; this.capText.classList.add('in');
    }
    [...this.capDots.children].forEach((d, i) => { d.classList.toggle('cur', i === t.index); d.classList.toggle('done', i < t.index); });
    this.capPrev.disabled = t.index === 0;
    this.capPlay.textContent = t.autoplay ? 'Pause' : 'Play';
    this.capPlay.hidden = !t.steps.some((s) => s.duration !== undefined);
  }

  // ------------------------------------------------------------ control tray (3D rooms)
  /** Returns a builder whose controls are removed when `scope` is disposed. */
  tray(scope, title = '') {
    const el = this.trayEl;
    el.replaceChildren();
    if (title) el.append(h('div', { class: 'ctl-label' }, title));
    el.hidden = false;
    scope.add(() => { el.replaceChildren(); el.hidden = true; });
    const add = (node) => { el.append(node); return node; };
    return {
      el,
      button(text, onClick, { toggle = false, on = false } = {}) {
        const b = add(h('button', { class: 'ctl-btn', 'aria-pressed': toggle ? String(on) : null }, text));
        b.addEventListener('click', () => {
          if (toggle) { on = !on; b.setAttribute('aria-pressed', String(on)); onClick(on); } else onClick();
        });
        return { el: b, set: (v) => { on = v; b.setAttribute('aria-pressed', String(v)); } };
      },
      slider(text, { min = 0, max = 1, step = 0.01, value = 0, format = (v) => v.toFixed(2) } = {}, onInput) {
        const out = h('output', {}, format(value));
        const input = h('input', { type: 'range', min, max, step, value, 'aria-label': text });
        input.addEventListener('input', () => { const v = parseFloat(input.value); out.textContent = format(v); onInput(v); });
        add(h('label', { class: 'ctl-slider' }, h('span', { class: 'ctl-row' }, h('span', {}, text), out), input));
        return { input, set: (v) => { input.value = v; out.textContent = format(parseFloat(input.value)); } };
      },
      segmented(text, options, value, onChange) {
        const btns = options.map((o) => h('button', { class: `ctl-seg-btn${o.value === value ? ' on' : ''}`, 'aria-pressed': String(o.value === value) }, o.label));
        btns.forEach((b, i) => b.addEventListener('click', () => {
          btns.forEach((x, j) => { x.classList.toggle('on', i === j); x.setAttribute('aria-pressed', String(i === j)); });
          onChange(options[i].value);
        }));
        add(h('div', { class: 'ctl-seg' }, text ? h('span', { class: 'ctl-label' }, text) : null, h('div', { class: 'ctl-seg-row' }, btns)));
        return { set: (v) => btns.forEach((b, i) => { b.classList.toggle('on', options[i].value === v); b.setAttribute('aria-pressed', String(options[i].value === v)); }) };
      },
      readout() { return add(h('div', { class: 'ctl-readout' })); },
      note(text) { return add(h('div', { class: 'ctl-label' }, text)); },
    };
  }

  // ------------------------------------------------------------ overlays
  titleCard(kicker, title, sub = '', ms = 2600) {
    this.titlecard.replaceChildren(h('div', { class: 'tc-in' },
      kicker ? h('div', { class: 'tc-kicker' }, kicker) : null,
      h('div', { class: 'tc-title' }, title),
      sub ? h('div', { class: 'tc-sub' }, sub) : null));
    clearTimeout(this._tc);
    requestAnimationFrame(() => this.titlecard.classList.add('show'));
    this._tc = setTimeout(() => this.titlecard.classList.remove('show'), ms);
  }

  openModal(...content) {
    const close = h('button', { class: 'modal-close', 'aria-label': 'Close', onclick: () => this.closeModal() }, '×');
    this.modal.replaceChildren(h('div', { class: 'card' }, close, ...content));
    this.modal.classList.add('open');
    close.focus({ preventScroll: true });
  }

  closeModal() { this.modal.classList.remove('open'); this.emit('modal-closed'); }

  placard(notes) {
    this.openModal(...notes.flatMap((n, i) => [h(i === 0 ? 'h2' : 'h3', {}, n.title), ...richText(n.body)]));
  }

  toast(title, sub = '', ms = 4200) {
    const t = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'gem' }), h('div', {}, h('b', {}, title), sub ? h('span', {}, sub) : null));
    this.toasts.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, ms);
  }

  setSecrets(found, total) { this.secretsCount.textContent = `${found}/${total}`; }
  setSound(on) { this.soundBtn.textContent = on ? 'Sound on' : 'Sound off'; this.soundBtn.setAttribute('aria-pressed', String(on)); }
}
