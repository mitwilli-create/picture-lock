// One-off: headless Playwright screen recordings of the LIVE site for take A
// (and a few beats of take C). 1920x1080 recordVideo over a 2x raster.
// Known artifacts avoided per handover: no fullPage stills, no bare youtube URLs,
// lazy thumbnails captured via scrolled viewports only.
// Usage: node scripts/_capture-site-tour.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'https://thestorytellermitch.com';
const DIR = 'output/takes/capture';
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

async function forceReveal(page) {
  await page.evaluate(() => {
    document.body.classList.add('revealed');
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  });
}

// rAF smooth scroll with easeInOutCubic; runs inside the page
async function smoothScroll(page, toY, ms) {
  await page.evaluate(([toY, ms]) => new Promise(done => {
    const from = window.scrollY, delta = toY - from, t0 = performance.now();
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    (function step(now) {
      const t = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, from + delta * ease(t));
      t < 1 ? requestAnimationFrame(step) : done();
    })(performance.now());
  }), [toY, ms]);
}

const yOf = (page, sel, offset = -120) =>
  page.evaluate(([sel, offset]) => {
    const el = document.querySelector(sel);
    return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY + offset) : null;
  }, [sel, offset]);

const SEGMENTS = [
  { name: 'hero', async run(page) {          // natural hero load-in, no force
    await page.waitForTimeout(6500);
  }},
  { name: 'index-tour', async run(page) {
    await forceReveal(page);
    await page.waitForTimeout(1200);
    const y = await yOf(page, '#work');
    await smoothScroll(page, y ?? 2200, 9000);
    await page.waitForTimeout(2000);
  }},
  { name: 'work-hover', async run(page) {
    await forceReveal(page);
    const y = await yOf(page, '#work', -80);
    if (y) await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(1500);
    const tiles = page.locator('#work .film[data-clip]');
    const n = Math.min(3, await tiles.count());
    for (let i = 0; i < n; i++) { await tiles.nth(i).hover(); await page.waitForTimeout(2600); }
  }},
  { name: 'theater', async run(page) {
    await forceReveal(page);
    const y = await yOf(page, '#work', -80);
    if (y) await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(1200);
    await page.locator('#work .film[data-clip]').first().click();
    await page.waitForTimeout(7500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }},
  { name: 'broll-top', path: '/broll-pipeline', async run(page) {
    await forceReveal(page);
    await page.waitForTimeout(2200);
    const y = await yOf(page, '.cs-video', -100);
    await smoothScroll(page, y ?? 1800, 6500);
    await page.waitForTimeout(1500);
  }},
  { name: 'broll-play', path: '/broll-pipeline', async run(page) {
    await forceReveal(page);
    const y = await yOf(page, '.cs-video', -60);
    if (y) await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const v = document.querySelector('.cs-video video');
      if (v) { v.muted = true; v.play().catch(() => {}); }
    });
    await page.waitForTimeout(500);
    // loader may need the click path too
    await page.locator('.cs-video video').click({ position: { x: 300, y: 300 } }).catch(() => {});
    await page.waitForTimeout(9000);
  }},
  { name: 'broll-receipt', path: '/broll-pipeline', async run(page) {
    await forceReveal(page);
    const y = await yOf(page, '.receipt', -140);
    if (y != null) await page.evaluate(y => window.scrollTo(0, Math.max(0, y - 500)), y);
    await page.waitForTimeout(1200);
    await smoothScroll(page, y ?? 3000, 7000);
    await page.waitForTimeout(2500);
  }},
  { name: 'voice-console', path: '/broll-pipeline', async run(page) {
    await forceReveal(page);
    const y = await yOf(page, '.voice-console', -200);
    if (y != null) await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(1200);
    await page.locator('.vc-transcript summary').click().catch(() => {});
    await page.waitForTimeout(5000);
  }},
  { name: 'systems', path: '/systems', async run(page) {
    await forceReveal(page);
    await page.waitForTimeout(1800);
    const y = await yOf(page, '.ledger', -100);
    await smoothScroll(page, (y ?? 1200) + 700, 9000);
    await page.waitForTimeout(1800);
  }},
  { name: 'for11', path: '/for-elevenlabs', async run(page) {
    await forceReveal(page);
    await page.waitForTimeout(1800);
    await smoothScroll(page, 2400, 8000);
    await page.waitForTimeout(1500);
  }},
  { name: 'closer', path: '/contact', async run(page) {
    await forceReveal(page);
    const y = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
    await smoothScroll(page, y, 4500);
    await page.waitForTimeout(3000);
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
