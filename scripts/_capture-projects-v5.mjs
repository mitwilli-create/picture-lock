// Capture v5 (Mitchell's note 3): projects page with NO header hold — start
// ~300px into the page, one steady linear scroll through cards + repos, then
// settle and hold on the GitHub repos link area. Output: projects-v5.webm
// (new name, never overwrite). Push-in happens in the assembler, not here.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const DIR = 'output/takes/e2/capture';
const PX_PER_SEC = 280;
const TAIL_HOLD_MS = 2000;
mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const forceReveal = p => p.evaluate(() => { document.body.classList.add('revealed'); document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); });
async function linearScroll(page, toY, pxPerSec) {
  await page.evaluate(([toY, pxPerSec]) => new Promise(done => {
    // the site smooth-scrolls (CSS/JS); force instant so the ramp is OURS —
    // without this every scrollTo eases and the capture crawls then races
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    const from = window.scrollY, ms = Math.abs(toY - from) / pxPerSec * 1000, t0 = performance.now();
    (function step(now) { const t = Math.min(1, (now - t0) / ms);
      window.scrollTo({ top: from + (toY - from) * t, behavior: 'instant' });
      t < 1 ? requestAnimationFrame(step) : done(); })(performance.now());
  }), [toY, pxPerSec]);
}
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, recordVideo: { dir: DIR, size: { width: 1920, height: 1080 } } });
const page = await ctx.newPage();
await page.goto('https://thestorytellermitch.com/projects', { waitUntil: 'networkidle', timeout: 45000 });
await forceReveal(page);
await page.evaluate(() => window.scrollTo(0, 300)); // skip the header entirely
await page.waitForTimeout(400);
const markIn = await page.evaluate(() => performance.now()); // scroll start, for the log
const y = await page.evaluate(() => {
  // bottom-most GitHub link = the repos/profile block, not a card's View-repo
  const els = [...document.querySelectorAll('a')].filter(a => /github\.com\/mitwilli/.test(a.href));
  const el = els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).at(-1);
  return el ? Math.round(el.getBoundingClientRect().top + window.scrollY - 420) : 2600;
});
await linearScroll(page, y, PX_PER_SEC); // ONE steady scroll, no second gear change
const scrollMs = await page.evaluate(t0 => performance.now() - t0, markIn);
await page.waitForTimeout(TAIL_HOLD_MS);
const v = page.video(); await ctx.close(); await v.saveAs(`${DIR}/projects-v5.webm`); await v.delete();
await browser.close();
console.log(`captured projects-v5.webm; scroll ${(scrollMs / 1000).toFixed(2)}s to y=${y}, tail hold ${TAIL_HOLD_MS / 1000}s`);
