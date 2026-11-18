// Render frames [a,b) of promo.html at 4K (2160x3840: 1080x1920 CSS @ DPR 2) into one H.264 segment.
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
import path from 'path';
import { spawn } from 'child_process';
const FPS = 30;
const [a, b, out] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('file://' + path.resolve('promo.html'));
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
await p.evaluate(() => window.fit());
await p.waitForTimeout(800);
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '5.1', out], { stdio: ['pipe', 'inherit', 'inherit'] });
for (let i = a; i < b; i++) {
  await p.evaluate(t => render(t), i / FPS);
  const buf = await p.screenshot({ type: 'jpeg', quality: 94 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if ((i - a) % 60 === 0) console.log(out, i, '/', b);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await br.close();
console.log('done', out);
