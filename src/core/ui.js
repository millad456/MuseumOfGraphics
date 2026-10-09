import { audio } from './audio.js';

// DOM interface layer. Chapters describe controls; the era stylesheet decides
// how those controls look. Same markup, fifty years of fashion.

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class UI {
  constructor(app) {
    this.app = app;
    this.root = $('#ui');
    this.hud = $('#hud');
    this.controls = $('#controls');
    this.controlsBody = $('#controls .bd');
    this.notesWin = $('#notes');
    this.notesBody = $('#notes .bd');
    this.modal = $('#modal');
    this.toasts = $('#toasts');
    this.timeline = $('#timeline');
    this.nextBtn = $('#next');
    this.prevBtn = $('#prev');
    this.titlecard = $('#titlecard');
    this.era = 'museum';
    this._makeDraggable(this.controls);
    this._makeDraggable(this.notesWin);
    this.modal.addEventListener('pointerdown', (e) => { if (e.target === this.modal) this.closeModal(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.modal.classList.contains('open')) { this.closeModal(); e.stopPropagation(); } }, true);
    $('#notes .tb .x').addEventListener('click', () => this.notesWin.classList.toggle('collapsed'));
    $('#controls .tb .x').addEventListener('click', () => this.controls.classList.toggle('collapsed'));
    if (window.innerWidth < 760) this.notesWin.classList.add('collapsed');
  }

  get modalOpen() { return this.modal.classList.contains('open'); }

  setEra(name) {
    this.era = name;
    document.body.dataset.ui = name;
  }

  sfxEra() {
    const e = this.era;
    if (e === 'tui') return 'terminal';
    if (e === 'bit84' || e === 'bench87') return 'chip';
    return 'modern';
  }

  _makeDraggable(win) {
    const tb = win.querySelector('.tb');
    let sx, sy, ox, oy, drag = false;
    tb.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('x') || window.innerWidth < 760) return;
      drag = true; sx = e.clientX; sy = e.clientY;
      const r = win.getBoundingClientRect(); ox = r.left; oy = r.top;
      tb.setPointerCapture(e.pointerId); e.preventDefault();
    });
    tb.addEventListener('pointermove', (e) => {
      if (!drag) return;
      win.style.left = Math.max(0, Math.min(window.innerWidth - 80, ox + e.clientX - sx)) + 'px';
      win.style.top = Math.max(0, Math.min(window.innerHeight - 40, oy + e.clientY - sy)) + 'px';
      win.style.right = 'auto';
    });
    tb.addEventListener('pointerup', () => { drag = false; });
  }

  extraWindow(title, pos = {}, width = 380) {
    this.extras = this.extras || [];
    const w = el('section', 'win extra');
    w.style.width = width + 'px';
    for (const k of ['left', 'top', 'right', 'bottom']) if (pos[k] !== undefined) w.style[k] = typeof pos[k] === 'number' ? pos[k] + 'px' : pos[k];
    w.innerHTML = `<div class="tb"><span class="t">${title}</span><span class="x" role="button" aria-label="Collapse">–</span></div><div class="bd"></div>`;
    w.querySelector('.x').addEventListener('click', () => w.classList.toggle('collapsed'));
    if (window.innerWidth < 760) w.classList.add('collapsed');
    this.root.insertBefore(w, this.modal);
    this._makeDraggable(w);
    this.extras.push(w);
    return w.querySelector('.bd');
  }
  clearExtras() { (this.extras || []).forEach((w) => w.remove()); this.extras = []; }

  resetWindows() {
    for (const w of [this.controls, this.notesWin]) { w.style.left = ''; w.style.top = ''; w.style.right = ''; }
  }

  // --------------------------------------------------------------- HUD
  setChapter(ch, idx, chapters, visited) {
    $('.num', this.hud).textContent = String(idx).padStart(2, '0') + ' / ' + String(chapters.length - 1).padStart(2, '0');
    $('.ttl', this.hud).textContent = ch.title;
    $('.yr', this.hud).textContent = ch.year || '';
    this.timeline.innerHTML = '';
    chapters.forEach((c, i) => {
      if (i === 0) return;
      const b = el('button', 'tk');
      b.setAttribute('aria-label', `${c.title}, ${c.year || ''}`);
      if (i === idx) b.classList.add('cur');
      if (visited.has(i)) b.classList.add('visited');
      const reachable = visited.has(i) || visited.has(i - 1) || this.app.unlockedAll;
      if (!reachable) b.classList.add('locked');
      b.appendChild(el('span', 'tip', `${c.year ? c.year + ' · ' : ''}${c.title}`));
      b.addEventListener('click', () => { if (reachable) this.app.go(i); });
      this.timeline.appendChild(b);
    });
    this.prevBtn.hidden = idx <= 1;
  }

  showChrome(on) {
    for (const s of ['#hud', '#topright', '#bottom']) $(s).style.opacity = on ? 1 : 0;
    $('#bottom').style.pointerEvents = on ? '' : 'none';
    $('#topright').style.pointerEvents = on ? '' : 'none';
  }

  titleCard(year, title, sub, ms = 2600) {
    const tc = this.titlecard;
    tc.innerHTML = `<div class="in"><div class="y">${year || ''}</div><div class="h">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    clearTimeout(this._tct);
    requestAnimationFrame(() => tc.classList.add('show'));
    this._tct = setTimeout(() => tc.classList.remove('show'), ms);
  }

  // --------------------------------------------------------------- Controls window
  clearControls(title = 'Controls') {
    this.controlsBody.innerHTML = '';
    $('#controls .tb .t').textContent = title;
    this.controls.classList.remove('hidden', 'collapsed');
    return this.controlsBody;
  }
  hideControls(h = true) { this.controls.classList.toggle('hidden', h); }

  section(parent = this.controlsBody) { const s = el('div', 'ctl'); parent.appendChild(s); return s; }

  objective(text, parent = this.controlsBody) {
    const o = el('div', 'objective', `<span class="chk"></span><span>${text}</span>`);
    parent.appendChild(o);
    return { el: o, done: (d = true) => o.classList.toggle('done', d) };
  }

  hint(text, parent = this.controlsBody) { const h = el('div', 'hint', text); parent.appendChild(h); return h; }
  readout(parent = this.controlsBody) { const r = el('div', 'readout'); parent.appendChild(r); return r; }

  button(label, onClick, parent = this.controlsBody, cls = '') {
    const b = el('button', 'btn ' + cls, label);
    b.addEventListener('click', (e) => { audio.click(this.sfxEra()); onClick(e, b); });
    parent.appendChild(b);
    return b;
  }

  row(parent = this.controlsBody) { const r = el('div', 'row'); parent.appendChild(r); return r; }

  slider(label, { min = 0, max = 1, step = 0.01, value = 0, fmt = (v) => v.toFixed(2), id } = {}, onInput, parent = this.controlsBody) {
    const c = el('label', 'ctl');
    const top = el('div', 'top', `<span class="lbl">${label}</span><span class="val"></span>`);
    const inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
    inp.id = id || 'r-' + label.replace(/\W+/g, '-').toLowerCase();
    const val = top.querySelector('.val');
    const upd = () => { const v = parseFloat(inp.value); val.textContent = fmt(v); onInput && onInput(v); };
    inp.addEventListener('input', upd);
    c.append(top, inp); parent.appendChild(c);
    val.textContent = fmt(value);
    return { el: c, input: inp, set: (v, fire = false) => { inp.value = v; val.textContent = fmt(parseFloat(inp.value)); if (fire) onInput && onInput(v); }, get value() { return parseFloat(inp.value); } };
  }

  segmented(label, options, value, onChange, parent = this.controlsBody) {
    const c = el('div', 'ctl');
    if (label) c.appendChild(el('span', 'lbl', label));
    const s = el('div', 'seg');
    const btns = options.map((o) => {
      const opt = typeof o === 'string' ? { v: o, l: o } : o;
      const b = el('button', 'btn' + (opt.v === value ? ' on' : ''), opt.l);
      b.addEventListener('click', () => {
        audio.click(this.sfxEra());
        btns.forEach((x) => x.classList.remove('on')); b.classList.add('on'); onChange(opt.v);
      });
      s.appendChild(b); return b;
    });
    c.appendChild(s); parent.appendChild(c);
    return { el: c, set: (v) => options.forEach((o, i) => btns[i].classList.toggle('on', (o.v ?? o) === v)) };
  }

  toggle(label, value, onChange, parent = this.controlsBody) {
    const b = el('button', 'btn' + (value ? ' on' : ''), label);
    b.addEventListener('click', () => { value = !value; b.classList.toggle('on', value); audio.click(this.sfxEra()); onChange(value); });
    parent.appendChild(b);
    return { el: b, set: (v) => { value = v; b.classList.toggle('on', v); } };
  }

  // --------------------------------------------------------------- Exhibit notes
  setNotes(notes) {
    this.notesBody.innerHTML = '';
    if (!notes || !notes.length) { this.notesWin.classList.add('hidden'); return; }
    this.notesWin.classList.remove('hidden');
    notes.forEach((n, i) => {
      const b = el('button', 'btn note-item', `<span class="k">${String.fromCharCode(65 + i)}</span>${n.title}`);
      b.addEventListener('click', () => { b.classList.add('read'); audio.click(this.sfxEra()); this.placard(n); });
      this.notesBody.appendChild(b);
    });
  }

  placard(n) {
    const body = el('div', 'placard');
    body.innerHTML = `${n.meta ? `<div class="meta">${n.meta}</div>` : ''}<h2>${n.title}</h2>${n.body}`;
    this.openModal(n.window || 'Exhibit note', body);
    if (n.diagram) {
      const cv = el('canvas'); cv.width = 520; cv.height = n.diagramH || 220;
      body.appendChild(cv);
      this._diagramStop = n.diagram(cv);
    }
  }

  openModal(title, content) {
    this.modal.innerHTML = '';
    const w = el('div', 'win');
    w.innerHTML = `<div class="tb"><span class="t">${title}</span><span class="x" role="button" aria-label="Close">✕</span></div>`;
    const bd = el('div', 'bd'); bd.appendChild(content);
    w.appendChild(bd);
    w.querySelector('.x').addEventListener('click', () => this.closeModal());
    this.modal.appendChild(w);
    this.modal.classList.add('open');
    audio.whoosh(0.25, true, 0.06);
    return bd;
  }

  closeModal() {
    this.modal.classList.remove('open');
    if (typeof this._diagramStop === 'function') this._diagramStop();
    this._diagramStop = null;
    this.app.canvas.focus({ preventScroll: true });
  }

  // --------------------------------------------------------------- Toasts
  toast(title, sub = '', ms = 3800) {
    const t = el('div', 'toast', `<div class="gem"></div><div><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>`);
    this.toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, ms);
  }

  setNext(ready, label) {
    this.nextBtn.classList.toggle('ready', !!ready);
    if (label) this.nextBtn.textContent = label;
  }
}
