import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
import path from 'path';
const times = process.argv.slice(2).map(Number);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('file://' + path.resolve('promo.html'));
await p.evaluate(() => document.fonts.ready);
await p.evaluate(()=>window.fit()); await p.waitForTimeout(500);
for (const t of times) {
  await p.evaluate(t => render(t), t);
  await p.screenshot({ path: `/tmp/claude-0/prev_${t}.png` });
}
await b.close();
