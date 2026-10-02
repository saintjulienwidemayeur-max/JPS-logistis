import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const b=await chromium.launch();const c=await b.newContext({viewport:{width:420,height:900},deviceScaleFactor:2});const p=await c.newPage();
for(const i of [0,1,2,3]){ await p.goto(`file://${process.cwd()}/mail${i}.html`); await p.waitForTimeout(400); await p.screenshot({path:`img/mail${i}.png`,fullPage:true}); }
await b.close();
