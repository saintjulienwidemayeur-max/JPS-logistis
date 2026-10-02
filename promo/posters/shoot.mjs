// Renders the three 4:5 posters at 2160x2700 (1080x1350 @2x).
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
import path from 'path';
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
pg.on('pageerror', e => console.log('ERR', e.message));
for (const n of [1, 2, 3]) {
  await pg.goto('file://' + path.resolve('poster.html') + '?p=' + n);
  await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: `FredaTech-JPS-affiche-${n}.png` });
}
await b.close();
