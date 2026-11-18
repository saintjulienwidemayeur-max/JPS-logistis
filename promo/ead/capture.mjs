// Captures real screens of the Elite Auto Deal site (local server with demo data) for the showcase video.
// Usage: node capture.mjs <adminToken> <clientCookie> <dossierRef> <devisToken> [<paidDevisRef>]
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const [adm, cookie, ref, jeton] = process.argv.slice(2);
const B = 'http://localhost:3000';
const b = await chromium.launch();
async function shot(name, [w, h, dpr], url, o = {}) {
  const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, locale: 'fr-FR', reducedMotion: 'reduce' });
  if (o.cookie) { const i = cookie.indexOf('='); await c.addCookies([{ name: cookie.slice(0, i), value: cookie.slice(i + 1), domain: 'localhost', path: '/' }]); }
  if (o.admin) await c.addInitScript(t => sessionStorage.setItem('ead-admin-token', t), adm);
  if (o.ls) await c.addInitScript(kv => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, o.ls);
  const p = await c.newPage(); p.on('pageerror', e => console.log('ERR', name, e.message));
  await p.goto(B + url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  // trigger lazy images
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); });
  await p.waitForTimeout(800);
  if (o.act) await o.act(p);
  await p.waitForTimeout(o.wait || 300);
  await p.screenshot({ path: `img/${name}.png`, fullPage: !!o.full });
  console.log('ok', name);
  await c.close();
}
const D = [1440, 900, 2], M = [390, 844, 3];
const hideFab = p => p.addStyleTag({ content: '.wa-fab,.fab-wa,[class*="wa-float"],a.whatsapp-float{display:none!important}' });
await shot('d-home-full', D, '/', { full: true });
await shot('d-veh-full', D, '/vehicules', { full: true });
await shot('d-fiche', D, '/vehicules/q8-882');
await shot('d-suivi', D, '/suivi-dossier', { act: async p => { await p.fill('#suivi-ref', ref); await p.press('#suivi-ref', 'Enter'); await p.waitForTimeout(2500); } });
await shot('d-devis-full', D, '/devis/' + jeton, { full: true });
await shot('d-espace', D, '/mon-espace', { cookie: 1 });
for (const r of ['apercu', 'dossiers', 'vehicules', 'devis', 'paiements']) await shot('d-admin-' + r, D, '/admin#' + r, { admin: 1, wait: 1200 });
await shot('m-home-full', M, '/', { full: true });
await shot('m-veh', M, '/vehicules', { act: async p => { await p.evaluate(() => { const c = document.querySelector('[class*="carte"],article'); if (c) scrollTo(0, c.getBoundingClientRect().top + scrollY - 90); }); } });
await shot('m-fiche', M, '/vehicules/q8-882');
await shot('m-fiche2', M, '/vehicules/gle-coupe-475');
await shot('m-suivi', M, '/suivi-dossier', { act: async p => { await p.fill('#suivi-ref', ref); await p.press('#suivi-ref', 'Enter'); await p.waitForTimeout(2500); await p.evaluate(() => { const e = document.getElementById('suivi-ref'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 160); }); } });
await shot('m-espace', M, '/mon-espace', { cookie: 1 });
await shot('m-espace2', M, '/mon-espace', { cookie: 1, act: async p => { await p.evaluate(() => scrollTo(0, 430)); } });
await shot('m-dossier', M, '/mon-espace', { cookie: 1, act: async p => { await p.getByText('Toyota RAV4 2016').first().click(); await p.waitForTimeout(2000); await p.evaluate(() => scrollTo(0, 0)); } });
await shot('m-devis', M, '/devis/' + jeton);
await shot('m-devis-pay', M, '/devis/' + jeton, { act: async p => { await hideFab(p); const t = p.getByText('Payer maintenant').first(); await t.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, 330)); } });
await shot('m-retour', M, '/retour-paiement', { ls: { 'ead-derniere-ref': ref, 'ead-derniere-methode': 'moncash' }, wait: 3000 });
await shot('m-preco', M, '/precommande');
// devis paid with MonCash (dossier created by the real /api/devis/:jeton/payer flow)
if (process.argv[6]) {
  const ref2 = process.argv[6];
  await shot('m-retour2', M, '/retour-paiement', { ls: { 'ead-derniere-ref': ref2, 'ead-derniere-methode': 'moncash' }, wait: 3000 });
  await shot('m-suivi2', M, '/suivi-dossier', { act: async p => { await p.fill('#suivi-ref', ref2); await p.press('#suivi-ref', 'Enter'); await p.waitForTimeout(2500); await p.evaluate(() => { const e = document.getElementById('suivi-ref'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 160); }); } });
  await shot('t-home-full', [820, 1180, 2], '/', { full: true });
  await shot('m-devis-full', M, '/devis/' + process.argv[5], { full: true });
}
await b.close();
