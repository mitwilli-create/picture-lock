// lib/mograph.mjs: deterministic motion graphics via Playwright frame capture.
// Each template in templates/mograph/ exposes window.renderFrame(frame, total,
// data) and draws the exact state for that frame: no CSS animations, no
// requestAnimationFrame clocks, so frame N is identical on every run. Frames
// are screenshotted at 1080x1920 and encoded with the same ffmpeg settings as
// every other beat, which is what keeps the concat path safe.
//
// $0 stage: renders the pipeline's own real artifacts (script, waveform,
// manifest) instead of generating footage.

import { execFileSync } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const W = 1080, H = 1920, FPS = 30;

const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

async function chromium() {
  try {
    const pw = await import('playwright');
    return pw.chromium;
  } catch {
    throw new Error("playwright not installed: run `npm install` (it is a devDependency; mograph beats need it, gen/card beats do not).");
  }
}

// Decode audio to mono 8kHz PCM and reduce to per-bucket peak amplitudes
// (0..1). Feeds the waveform template with the beat's actual narration audio.
export function extractWaveformPeaks(audioPath, buckets = 720) {
  const raw = run('ffmpeg', ['-v', 'error', '-i', audioPath, '-f', 's16le', '-ac', '1', '-ar', '8000', '-']);
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
  const per = Math.max(1, Math.floor(samples.length / buckets));
  const peaks = [];
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    for (let i = b * per; i < Math.min((b + 1) * per, samples.length); i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    peaks.push(+(max / 32768).toFixed(4));
  }
  return peaks;
}

// Render one template to a silent 1080x1920@30 mp4 at outPath.
export async function renderMograph({ template, seconds, data = {}, outPath, framesDir, log = () => {} }) {
  const total = Math.round(seconds * FPS);
  const dir = framesDir ?? join(ROOT, '.cache', 'mograph-frames', template);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const browser = await (await chromium()).launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto(`file://${join(ROOT, 'templates', 'mograph', `${template}.html`)}`);
    await page.waitForFunction('typeof window.renderFrame === "function"');
    // hand the data over once; templates cache it
    await page.evaluate((d) => window.setData?.(d), data);
    for (let f = 0; f < total; f++) {
      await page.evaluate(({ f, total }) => window.renderFrame(f, total), { f, total });
      await page.screenshot({ path: join(dir, `frame-${String(f).padStart(4, '0')}.png`) });
      if (f % 60 === 0) log(`  mograph ${template}: frame ${f}/${total}`);
    }
    const shot = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    if (shot[0] !== W || shot[1] !== H) throw new Error(`mograph viewport drifted: ${shot.join('x')} (expected ${W}x${H})`);
  } finally {
    await browser.close();
  }

  run('ffmpeg', [
    '-y', '-framerate', String(FPS), '-i', join(dir, 'frame-%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    outPath,
  ]);
  rmSync(dir, { recursive: true, force: true });
  return outPath;
}
