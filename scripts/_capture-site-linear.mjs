// Take D re-captures: CONSTANT-velocity scrolls (no ease start/stop) so motion
// reads smooth and is present from the first second of every cut window.
// Usage: node scripts/_capture-site-linear.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'https://thestorytellermitch.com';
const DIR = 'output/takes/d/capture';
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

const forceReveal = page => page.evaluate(() => {
  document.body.classList.add('revealed');
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
});

// constant px/second scroll driven by rAF
async function linearScroll(page, toY, pxPerSec) {
  await page.evaluate(([toY, pxPerSec]) => new Promise(done => {
    const from = window.scrollY, delta = toY - from, ms = Math.abs(delta) / pxPerSec * 1000, t0 = performance.now();
    (function step(now) {
      const t = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, from + delta * t);
      t < 1 ? requestAnimationFrame(step) : done();
    })(performance.now());
  }), [toY, pxPerSec]);
}

const yOf = (page, sel, offset = -120) =>
  page.evaluate(([sel, offset]) => {
    const el = document.querySelector(sel);
    return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY + offset) : null;
  }, [sel, offset]);

const SEGMENTS = [
  { name: 'lin-index', path: '/', async run(page) {           // hero → work band, one steady move
    await forceReveal(page); await page.waitForTimeout(600);
    await linearScroll(page, (await yOf(page, '#work')) ?? 2400, 260);
    await page.waitForTimeout(800);
  }},
  { name: 'lin-broll', path: '/broll-pipeline', async run(page) { // top → player, steady
    await forceReveal(page); await page.waitForTimeout(600);
    await linearScroll(page, ((await yOf(page, '.cs-video', -80)) ?? 1600), 240);
    await page.waitForTimeout(800);
  }},
  { name: 'lin-receipt', path: '/broll-pipeline', async run(page) { // approach → receipt framed
    await forceReveal(page);
    const y = await yOf(page, '.receipt', -140);
    await page.evaluate(y => window.scrollTo(0, Math.max(0, y - 1400)), y);
    await page.waitForTimeout(600);
    await linearScroll(page, y ?? 3000, 300);
    await page.waitForTimeout(1500);
  }},
  { name: 'lin-systems', path: '/systems', async run(page) {
    await forceReveal(page); await page.waitForTimeout(600);
    await linearScroll(page, ((await yOf(page, '.ledger')) ?? 1200) + 900, 240);
    await page.waitForTimeout(800);
  }},
  { name: 'lin-for11', path: '/for-elevenlabs', async run(page) {
    await forceReveal(page); await page.waitForTimeout(600);
    await linearScroll(page, 2600, 280);
    await page.waitForTimeout(800);
  }},
  { name: 'lin-fit', path: '/fit', async run(page) {          // role-fit atlas, steady
    await forceReveal(page); await page.waitForTimeout(600);
    await linearScroll(page, 2200, 260);
    await page.waitForTimeout(800);
  }},
];

for (const seg of SEGMENTS) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    recordVideo: { dir: DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + (seg.path || '/'), { waitUntil: 'networkidle', timeout: 45_000 });
    await seg.run(page);
    const video = page.video();
    await ctx.close();
    await video.saveAs(`${DIR}/${seg.name}.webm`);
    await video.delete();
    console.log('captured', seg.name);
  } catch (e) {
    console.error(`SEGMENT FAILED ${seg.name}:`, e.message);
    await ctx.close().catch(() => {});
  }
}
await browser.close();
console.log('done');
