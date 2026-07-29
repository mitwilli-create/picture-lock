// Re-capture of the broll-play segment: the first pass paused the reel with a
// safety click. This pass plays programmatically only and verifies currentTime.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  recordVideo: { dir: 'output/takes/capture', size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
await page.goto('https://thestorytellermitch.com/broll-pipeline', { waitUntil: 'networkidle', timeout: 45_000 });
await page.evaluate(() => {
  document.body.classList.add('revealed');
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
});
const y = await page.evaluate(() => {
  const el = document.querySelector('.cs-video');
  return el.getBoundingClientRect().top + window.scrollY - 60;
});
await page.evaluate(y => window.scrollTo(0, y), y);
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const v = document.querySelector('.cs-video video');
  v.muted = true;
  v.play();
});
await page.waitForTimeout(10_000);
const t = await page.evaluate(() => document.querySelector('.cs-video video').currentTime);
console.log('reel currentTime after 10s:', t);
const video = page.video();
await ctx.close();
if (t < 5) { await video.delete(); await browser.close(); throw new Error('reel did not play'); }
await video.saveAs('output/takes/capture/broll-play.webm');
await video.delete();
await browser.close();
console.log('recaptured broll-play');
