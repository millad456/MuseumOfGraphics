// Drive the site in headless Chromium and take screenshots.
// usage: node tools/shot.mjs <outdir> <hash|-> '<steps json>' [width] [height]
// steps: ["wait",ms] ["click",x,y] ["move",x,y] ["drag",[x,y],[[x,y],...]] ["shot",name]
//        ["key",key] ["type",text] ["eval",js] ["sel",selector]
import { chromium } from 'playwright';
const [, , outDir, hash, stepsJson, w = '1440', h = '900'] = process.argv;
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ERR_TUNNEL|fonts\.g/.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 600)}`); });
page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`));
await page.goto(`http://127.0.0.1:8765/index.html?fast${hash && hash !== '-' ? '#' + hash : ''}`, { waitUntil: 'load' });
for (const [op, a, b] of steps) {
  if (op === 'wait') await page.waitForTimeout(a);
  else if (op === 'click') await page.mouse.click(a, b);
  else if (op === 'move') await page.mouse.move(a, b, { steps: 4 });
  else if (op === 'drag') { await page.mouse.move(a[0], a[1]); await page.mouse.down(); for (const p of b) await page.mouse.move(p[0], p[1], { steps: 4 }); await page.mouse.up(); }
  else if (op === 'shot') await page.screenshot({ path: `${outDir}/${a}.png`, timeout: 120000 });
  else if (op === 'key') await page.keyboard.press(a);
  else if (op === 'type') await page.keyboard.type(a, { delay: 25 });
  else if (op === 'sel') await page.click(a);
  else if (op === 'eval') { const r = await page.evaluate(a); if (r !== undefined) console.log('EVAL:', JSON.stringify(r).slice(0, 3000)); }
}
console.log(logs.slice(0, 40).join('\n') || 'no errors');
await browser.close();
