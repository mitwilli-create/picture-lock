import { chromium } from 'playwright';
const DIR = 'output/takes/e2/capture';
const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, recordVideo: { dir: DIR, size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage();
await p.goto('https://thestorytellermitch.com/projects', { waitUntil: 'networkidle', timeout: 45000 });
await p.evaluate(() => { document.body.classList.add('revealed'); document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); });
await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.body.style.scrollBehavior = 'auto'; window.scrollTo({ top: 300, behavior: 'instant' }); });
await p.waitForTimeout(700);
// smooth native scroll: 300 -> 1900 over ~3.3s (~485 px/s), slow and steady
await p.evaluate(() => new Promise(done => {
  const from = 300, to = 1900, ms = 3300, t0 = performance.now();
  const ease = x => x < .5 ? 2*x*x : 1-Math.pow(-2*x+2,2)/2;
  (function step(now){ const t = Math.min(1,(now-t0)/ms); window.scrollTo({top: from+(to-from)*ease(t), behavior:'instant'}); t<1?requestAnimationFrame(step):done(); })(performance.now());
}));
await p.waitForTimeout(900);
const v = p.video(); await ctx.close(); await v.saveAs(`${DIR}/projects-v6.webm`); await v.delete();
await b.close();
console.log('projects-v6.webm captured');
