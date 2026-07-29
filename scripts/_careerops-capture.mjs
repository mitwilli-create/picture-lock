// Career-ops demo v1: capture per adjudicated build plan (council report §BUILD PLAN).
// Tall 2560×3200 viewport so the ffmpeg virtual camera has travel; the page is
// mostly static on capture — ALL continuous motion is synthesized at 60fps in
// compose. Real UI state changes fire at scheduled offsets and are logged to
// events.json for the compositor.
// Prereq: demo server on :3098. Usage: node scripts/_careerops-capture.mjs
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';

const BASE = 'http://localhost:3098';
const OUT = 'output/career-ops-demo';
const DIR = `${OUT}/capture`;
mkdirSync(DIR, { recursive: true });

const { beats } = JSON.parse(readFileSync(`${OUT}/beats.json`, 'utf8'));
const durOf = id => beats.find(b => b.id === id).dur;
const PAD = 4;

const browser = await chromium.launch({ headless: true });

// Beat definitions. scrollY positions the tall window; events fire at fixed
// offsets (seconds after settle) and are logged with recording-relative stamps.
const SEGMENTS = [
  { name: 'b1-open', id: 'open', scrollY: 0, async run(page, log) {
    // hover a top-of-pipe row so the open isn't sterile
    await page.hover('#top-of-pipe >> text=Northwind Signal').catch(() => {});
    log('hover-row', 0);
  }},
  { name: 'b2-board', id: 'board', scrollY: 300, async run(page, log) {
    // real interaction: open the first evaluations-table row (role drawer)
    await page.waitForTimeout(9000);
    try {
      await page.locator('#all-evaluations-section tbody tr').first().click({ timeout: 3000 });
      log('row-open', 9);
    } catch { log('row-open-failed', 9); }
  }},
  { name: 'b3-observe', id: 'observe', scrollY: 443, async run(page, log) {
    // real interaction: the system-tasks/health chip on the "health agent" line
    await page.waitForTimeout(12000);
    try {
      await page.locator('text=system tasks').first().click({ timeout: 3000 });
      log('health-open', 12);
      await page.waitForTimeout(6000);
      await page.keyboard.press('Escape');
      log('health-close', 18);
    } catch { log('health-open-failed', 12); }
  }},
  { name: 'b4-incident', id: 'incident', scrollY: 443, async run(page, log) {
    // real interaction: open the batch-status popout on the incident beat
    await page.waitForTimeout(6000);
    try {
      await page.locator('text=Open batch status').first().click({ timeout: 3000 });
      log('batch-open', 6);
    } catch { log('batch-open-failed', 6); }
  }},
  { name: 'b5-close', id: 'close', scrollY: 0, async run() { /* static wide; receipt rail is an overlay */ }},
];

const allEvents = {};
for (const seg of SEGMENTS) {
  const secs = durOf(seg.id) + PAD;
  const ctx = await browser.newContext({
    viewport: { width: 2560, height: 3200 },
    deviceScaleFactor: 1,
    recordVideo: { dir: DIR, size: { width: 2560, height: 3200 } },
  });
  const t0ctx = Date.now();
  const page = await ctx.newPage();
  const events = [];
  const log = (name, plannedOffset) =>
    events.push({ name, planned: plannedOffset, recAt: +((Date.now() - t0ctx) / 1000).toFixed(2) });
  try {
    await page.goto(BASE, { waitUntil: 'load', timeout: 45_000 });
    await page.waitForTimeout(2500);
    if (seg.scrollY) await page.evaluate(y => window.scrollTo(0, y), seg.scrollY);
    await page.waitForTimeout(300);
    log('settled', 0);
    const tRun = Date.now();
    await seg.run(page, log);
    const spent = (Date.now() - tRun) / 1000;
    if (spent < secs) await page.waitForTimeout((secs - spent) * 1000);
    const video = page.video();
    await ctx.close();
    await video.saveAs(`${DIR}/${seg.name}.webm`);
    await video.delete();
    allEvents[seg.name] = events;
    console.log('captured', seg.name, `${secs.toFixed(1)}s`, JSON.stringify(events));
  } catch (e) {
    console.error(`SEGMENT FAILED ${seg.name}:`, e.message);
    await ctx.close().catch(() => {});
  }
}
writeFileSync(`${DIR}/events.json`, JSON.stringify(allEvents, null, 2) + '\n');
await browser.close();
console.log('done');
