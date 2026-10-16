/**
 * Minimal, injection-safe element builder. Text is always assigned as text
 * nodes; markup is never parsed from strings.
 *
 *   h('button', { class: 'btn', onclick: fn, 'aria-label': 'Next' }, 'Next', child)
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/**
 * Placard content: strings become paragraphs, `{ eq }` becomes a formula
 * block, `{ list }` a bullet list.
 */
export function richText(blocks) {
  return blocks.map((b) => {
    if (typeof b === 'string') return h('p', {}, b);
    if (b.eq) return h('pre', { class: 'eq' }, b.eq);
    if (b.list) return h('ul', { class: 'plain' }, b.list.map((li) => h('li', {}, li)));
    return null;
  });
}
