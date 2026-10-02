// Captures real UI states of the site with mocked Supabase responses (demo data only).
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const SITE='file:///home/user/JPS-logistis/index.html';
const now=new Date('2026-10-02T14:20:00Z').toISOString();
const client={id:'c1',name:'Marie Joseph',email:'marie.joseph@email.com',phone:'+509 3456-7890',address:'Rue Grégoire',city:'Pétion-Ville',country:'Haïti',box_number:'JPS-1042',lang:'fr',avatar_url:null,created_at:now};
const ships=[
 {id:'s1',client_id:'c1',tracking_number:'JPS-2026-48213',type:'Air',description:'iPhone 15 + accessoires',weight:'4.2',price_per_lb:4.5,logistics_fee:10,status:2,created_at:'2026-09-26T15:00:00Z',updated_at:now},
 {id:'s2',client_id:'c1',tracking_number:'JPS-2026-51877',type:'Mer',description:'Baril — vêtements & chaussures',weight:'68',price_per_lb:1.25,logistics_fee:15,status:1,created_at:'2026-09-20T15:00:00Z',updated_at:'2026-09-29T12:00:00Z'},
 {id:'s3',client_id:'c1',tracking_number:'JPS-2026-39025',type:'Air',description:'Documents administratifs',weight:'0.5',price_per_lb:6,logistics_fee:5,status:3,created_at:'2026-09-12T15:00:00Z',updated_at:'2026-09-18T12:00:00Z'}];
const clients=[client,{...client,id:'c2',name:'Jean-Robert Pierre',email:'jr.pierre@email.com',box_number:'JPS-1043'},{...client,id:'c3',name:'Nadège Louis',email:'nadege.l@email.com',box_number:'JPS-1044'},{...client,id:'c4',name:'Samuel Étienne',email:'s.etienne@email.com',box_number:'JPS-1045'}];
let trackStatus=0;
async function mock(page){
  await page.route('**/rest/v1/**', async route=>{
    const u=decodeURIComponent(route.request().url()); const single=(route.request().headers()['accept']||'').includes('vnd.pgrst.object');
    let body=[];
    if(u.includes('/rpc/list_staff')) body=[{id:'a1',name:'JP Saint-Julien',email:'owner@jps.com',role:'owner'},{id:'a2',name:'Agent Miami',email:'agent@jps.com',role:'agent'}];
    else if(u.includes('/rpc/')) body=[];
    else if(u.includes('/clients')) body=single?client:clients;
    else if(u.includes('/shipments')){
      if(u.includes('ilike')) body=[{...ships[0],status:trackStatus}];
      else if(u.includes('client_id=eq')) body=ships;
      else body=[...ships.map(s=>({...s,clients:{name:client.name,email:client.email}})),{...ships[1],id:'s4',tracking_number:'JPS-2026-60411',description:'Pièces auto',status:0,clients:{name:'Jean-Robert Pierre',email:'jr.pierre@email.com'}},{...ships[0],id:'s5',tracking_number:'JPS-2026-60502',description:'Ordinateur portable',status:1,clients:{name:'Nadège Louis',email:'nadege.l@email.com'}}];
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(single&&Array.isArray(body)?body[0]:body)});
  });
}
const b=await chromium.launch();
async function ctx(w,h,dpr,init){ const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr,locale:'fr-FR',reducedMotion:'reduce'});
  if(init) await c.addInitScript(init); const p=await c.newPage(); await mock(p); await p.goto(SITE,{waitUntil:'load'}); await p.waitForTimeout(1500); return [c,p]; }
// --- tracking states (desktop card + mobile viewport) ---
for(const [tag,w,h,dpr] of [['d',1440,900,1],['m',390,844,2]]){
  const [c,p]=await ctx(w,h,dpr);
  for(let st=0;st<4;st++){ trackStatus=st;
    await p.fill('#trackInput','JPS-2026-48213'); await p.evaluate(()=>document.getElementById('trackForm').requestSubmit()); await p.waitForTimeout(700);
    const card=await p.evaluateHandle(()=>{let e=document.getElementById('trackForm');while(e&&!e.contains(document.getElementById('trackResult')))e=e.parentElement;return e;});
    if(tag==='d') await card.asElement().screenshot({path:`img/track-d${st}.png`});
    else { await p.evaluate(()=>{const e=document.getElementById('trackForm');window.scrollTo(0,e.getBoundingClientRect().top+scrollY-150)}); await p.waitForTimeout(200); await p.screenshot({path:`img/track-m${st}.png`}); }
  }
  await c.close();
}
// --- client dashboard ---
for(const [tag,w,h,dpr] of [['d',1440,900,1],['m',390,844,2]]){
  const [c,p]=await ctx(w,h,dpr,()=>{localStorage.setItem('jps_client_session',JSON.stringify({id:'c1',name:'Marie Joseph',email:'marie.joseph@email.com'}))});
  await p.evaluate(()=>document.querySelector('[data-open-client]').click()); await p.waitForTimeout(1500);
  await p.screenshot({path:`img/dash-${tag}.png`});
  await p.evaluate(()=>{const e=document.getElementById('clientPage');e.scrollTop=420;}); await p.waitForTimeout(300);
  await p.screenshot({path:`img/dash-${tag}2.png`});
  await c.close();
}
// --- admin dashboard ---
{ const [c,p]=await ctx(1440,900,1,()=>{sessionStorage.setItem('jps_admin_session',JSON.stringify({id:'a1',name:'JP Saint-Julien',email:'owner@jps.com',password:'x',role:'owner'}))});
  await p.evaluate(()=>document.querySelector('[data-open-client]').click()); await p.waitForTimeout(1500);
  await p.screenshot({path:'img/admin-d.png',fullPage:false});
  await c.close(); }
await b.close(); console.log('ok');
