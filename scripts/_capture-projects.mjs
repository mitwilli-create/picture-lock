// Capture: projects page steady scroll + a hold on the GitHub link (for the
// post crop-zoom on "the systems are public"). Also home→for-elevenlabs hero
// holds for the :18 navigation sequence.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const DIR = 'output/takes/e2/capture';
mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const forceReveal = p => p.evaluate(() => { document.body.classList.add('revealed'); document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); });
async function linearScroll(page, toY, pxPerSec) {
  await page.evaluate(([toY, pxPerSec]) => new Promise(done => {
    const from = window.scrollY, ms = Math.abs(toY - from) / pxPerSec * 1000, t0 = performance.now();
    (function step(now) { const t = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, from + (toY - from) * t);
      t < 1 ? requestAnimationFrame(step) : done(); })(performance.now());
  }), [toY, pxPerSec]);
}
const SEGS = [
  { name: 'projects', path: '/projects', async run(page) {
    await forceReveal(page); await page.waitForTimeout(600);
    await linearScroll(page, 2600, 300);
    // settle on the github link zone
    const y = await page.evaluate(() => {
      const el = [...document.querySelectorAll('a')].find(a => /github\.com\/mitwilli/.test(a.href));
      return el ? el.getBoundingClientRect().top + window.scrollY - 420 : null;
    });
    if (y) await linearScroll(page, y, 340);
    await page.waitForTimeout(2200);
  }},
  { name: 'home-hold', path: '/', async run(page) { await page.waitForTimeout(4200); }},
];
for (const seg of SEGS) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, recordVideo: { dir: DIR, size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  try {
    await page.goto('https://thestorytellermitch.com' + seg.path, { waitUntil: 'networkidle', timeout: 45000 });
    await seg.run(page);
    const v = page.video(); await ctx.close(); await v.saveAs(`${DIR}/${seg.name}.webm`); await v.delete();
    console.log('captured', seg.name);
  } catch (e) { console.error('FAILED', seg.name, e.message); await ctx.close().catch(() => {}); }
}
await browser.close();
