// v6 recaptures (Mitchell's :18 note: site copy/design changed): fresh home
// hero hold + for-elevenlabs page pass. Instant-scroll fix baked in.
// Outputs: home-hold-v6.webm, pathpage-v6.webm (new names, never overwrite).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const DIR = 'output/takes/e2/capture';
mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const forceReveal = p => p.evaluate(() => { document.body.classList.add('revealed'); document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); });
async function linearScroll(page, toY, pxPerSec) {
  await page.evaluate(([toY, pxPerSec]) => new Promise(done => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    const from = window.scrollY, ms = Math.abs(toY - from) / pxPerSec * 1000, t0 = performance.now();
    (function step(now) { const t = Math.min(1, (now - t0) / ms);
      window.scrollTo({ top: from + (toY - from) * t, behavior: 'instant' });
      t < 1 ? requestAnimationFrame(step) : done(); })(performance.now());
  }), [toY, pxPerSec]);
}
const SEGS = [
  { name: 'home-hold-v6', path: '/', async run(page) { await page.waitForTimeout(5000); } },
  { name: 'pathpage-v6', path: '/for-elevenlabs', async run(page) {
    await page.evaluate(() => { const el = [...document.querySelectorAll('a,button')].find(a => /start|review|path/i.test(a.textContent || '')); if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' }); });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo({ top: Math.max(0, window.scrollY - 500), behavior: 'instant' }));
    await page.waitForTimeout(400);
    await linearScroll(page, await page.evaluate(() => window.scrollY + 500), 200);
    await page.waitForTimeout(2000);
  } },
];
for (const seg of SEGS) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, recordVideo: { dir: DIR, size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  try {
    await page.goto('https://thestorytellermitch.com' + seg.path, { waitUntil: 'networkidle', timeout: 45000 });
    await forceReveal(page);
    await seg.run(page);
    const v = page.video(); await ctx.close(); await v.saveAs(`${DIR}/${seg.name}.webm`); await v.delete();
    console.log('captured', seg.name);
  } catch (e) { console.error('FAILED', seg.name, e.message); await ctx.close().catch(() => {}); }
}
await browser.close();
