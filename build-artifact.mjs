// Bundles the site into one self-contained HTML body for hosting as a single page.
// Usage: node build-artifact.mjs [shareBaseUrl]
import { build } from 'esbuild';
import fs from 'fs';
const share = process.argv[2] || '';
const out = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', write: false, target: 'es2020' });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = fs.readFileSync('styles.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<canvas id="gl"'), html.indexOf('<script type="module"'));
const page = `<title>Museum of Graphics</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=IBM+Plex+Sans:wght@400;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&family=Silkscreen&family=VT323&display=swap">
<style>${css}</style>
${body}
<script>${share ? `window.MOG_SHARE_BASE=${JSON.stringify(share)};` : ''}</script>
<script type="module">${js}</script>
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/museum-of-graphics.html', page);
console.log('dist/museum-of-graphics.html', (page.length / 1024).toFixed(0) + ' KB');
