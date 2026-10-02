import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch();
const shots=[['desk',1440,900,2],['tab',820,1180,2],['mob',390,844,3]];
for (const [n,w,h,dpr] of shots){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr,locale:'fr-FR',reducedMotion:'reduce'});const p=await ctx.newPage();
  await p.goto('file:///home/user/JPS-logistis/index.html',{waitUntil:'load'});
  await p.waitForTimeout(2500);
  // hide install banners / popups if any visible
  await p.addStyleTag({content:'[id*=install i]{display:none!important}'});
  await p.screenshot({path:`img/${n}-full.png`,fullPage:true,type:'png'});
  const H=await p.evaluate(()=>document.documentElement.scrollHeight); console.log(n,H);
  await ctx.close();
}
await b.close();
