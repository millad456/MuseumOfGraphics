import { encodeSprite } from './state.js';

// Shareable postcard: the current frame, the visitor's sprite, and their run.

export function shareURL(app) {
  const base = window.MOG_SHARE_BASE || (location.origin + location.pathname);
  const q = app.state.spriteEdited && !window.MOG_SHARE_BASE ? '?s=' + encodeSprite(app.state.sprite) : '';
  return base + q;
}

export function drawSprite(ctx, sprite, palette, x, y, scale) {
  for (let i = 0; i < 256; i++) {
    const v = sprite[i]; if (!v) continue;
    ctx.fillStyle = palette[v];
    ctx.fillRect(x + (i % 16) * scale, y + Math.floor(i / 16) * scale, scale, scale);
  }
}

export function postcard(app) {
  const W = 1200, H = 630;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#050505'; x.fillRect(0, 0, W, H);
  // grab the live frame
  try {
    app.renderChapter(app.cur, null, 0);
    const src = app.renderer.domElement;
    const s = Math.max(W / src.width, H / src.height);
    x.drawImage(src, (W - src.width * s) / 2, (H - src.height * s) / 2, src.width * s, src.height * s);
  } catch (e) {}
  const g = x.createLinearGradient(0, 0, W * 0.75, 0);
  g.addColorStop(0, 'rgba(5,5,5,.94)'); g.addColorStop(0.55, 'rgba(5,5,5,.7)'); g.addColorStop(1, 'rgba(5,5,5,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  const all = app.allSecrets();
  const found = all.filter((s) => app.state.secrets.has(s.id)).length;
  const reached = Math.max(...[...app.state.visited], 0);
  const ch = app.chapters[reached] || app.chapters[1];

  x.fillStyle = '#ffb547'; x.font = '500 18px "JetBrains Mono", monospace';
  x.fillText('MUSEUM OF GRAPHICS', 64, 84);
  x.fillStyle = '#ece6da'; x.font = '72px "Instrument Serif", Georgia, serif';
  x.fillText('From one dot', 64, 178);
  x.fillText('to a ray of light.', 64, 250);
  x.font = '400 22px "Geist", sans-serif'; x.fillStyle = 'rgba(236,230,218,.8)';
  x.fillText(`Reached era ${String(reached).padStart(2, '0')} · ${ch.title}`, 64, 316);
  x.fillText(`${found} of ${all.length} secrets found`, 64, 350);
  const st = app.state.stats;
  const lines = [];
  if (st.magicErr !== undefined) lines.push(`best magic constant: ${(st.magicErr * 100).toFixed(4)}% max error`);
  if (st.mazeTime !== undefined) lines.push(`escaped the raycast maze in ${st.mazeTime.toFixed(1)} s`);
  if (st.optics !== undefined) lines.push(`optics bench: ${st.optics} puzzles solved`);
  if (st.runBits !== undefined) lines.push(`parallax run: ${st.runBits} bits collected`);
  x.font = '400 16px "JetBrains Mono", monospace'; x.fillStyle = 'rgba(236,230,218,.6)';
  lines.slice(0, 3).forEach((l, i) => x.fillText(l, 64, 400 + i * 26));

  // sprite badge
  x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(64, 488, 92, 92);
  drawSprite(x, app.state.sprite, app.state.palette, 70, 494, 5);
  x.fillStyle = 'rgba(236,230,218,.75)'; x.font = '400 15px "Geist", sans-serif';
  x.fillText(app.state.spriteEdited ? 'my sprite travelled through' : 'the cursor travelled through', 176, 524);
  x.fillText('fifty years of computer graphics', 176, 548);
  x.fillStyle = 'rgba(236,230,218,.4)'; x.font = '400 13px "JetBrains Mono", monospace';
  x.fillText(location.host + location.pathname, 176, 574);
  return c;
}

export function openShare(app) {
  const card = postcard(app);
  const box = document.createElement('div'); box.className = 'placard';
  const url = shareURL(app);
  box.innerHTML = `<div class="meta">Postcard</div><h2>Send someone through the museum</h2>
    <p>${window.MOG_SHARE_BASE ? 'Copy the link to send someone through, and right-click (or long-press) the postcard to save it.' : `The link carries ${app.state.spriteEdited ? 'the sprite you drew, so it travels with them too' : 'them to the start. Draw a sprite in the Pixel era and the link will carry it'}.`}</p>`;
  const img = new Image(); img.src = card.toDataURL('image/png'); img.alt = 'Postcard image'; img.style.width = '100%'; img.style.display = 'block';
  box.appendChild(img);
  const row = document.createElement('div'); row.className = 'row';
  const link = document.createElement('input'); link.value = url; link.readOnly = true; link.id = 'share-link';
  Object.assign(link.style, { flex: '1 1 220px', minWidth: '0', font: '12px var(--font-mono)', padding: '8px', background: 'rgba(127,127,127,.15)', color: 'var(--ui-fg)', border: 'var(--ui-border)' });
  row.appendChild(link);
  const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.onclick = fn; row.appendChild(b); return b; };
  const copy = mk('Copy link', async () => {
    try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; } catch (e) { link.select(); copy.textContent = 'Press ⌘/Ctrl+C'; }
  });
  if (!window.MOG_SHARE_BASE) mk('Save image', () => {
    try { const a = document.createElement('a'); a.href = img.src; a.download = 'museum-of-graphics.png'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) {}
  });
  if (navigator.share && !window.MOG_SHARE_BASE) mk('Share…', async () => {
    try {
      const blob = await (await fetch(img.src)).blob();
      const file = new File([blob], 'museum-of-graphics.png', { type: 'image/png' });
      const data = { title: 'Museum of Graphics', text: 'Fifty years of computer graphics, playable.', url };
      if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
      await navigator.share(data);
    } catch (e) {}
  });
  box.appendChild(row);
  app.ui.openModal('Share', box);
}
