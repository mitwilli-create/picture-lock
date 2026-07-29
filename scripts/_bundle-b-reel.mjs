// Bundle B: cut the side-by-side market reel. Sequence: title card, then each
// market spot preceded by a 1.4s label card (EN, DE, FR, ES, IT). Cards are
// Playwright-rendered HTML (this ffmpeg build has no drawtext), encoded with
// the exact same codec settings as beat clips so the concat path stays safe.
//
// Usage: node --env-file=.env scripts/_bundle-b-reel.mjs
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'output/bundles/bundle-b');
const WORK = join(ROOT, '.cache/bundle-b/reel');
mkdirSync(WORK, { recursive: true });
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

const CARDS = [
  { id: 'title', big: 'ONE SCRIPT.<br>EVERY MARKET.', small: 'MERIDIEM · a fictional Spanish canned white wine · one Cordoba match night, revoiced and re-dressed for every market · ElevenLabs + AI visuals', dur: 2.8 },
  { id: 'es', big: 'ES', small: 'MASTER · Córdoba · la Roja on the roof', dur: 1.4 },
  { id: 'en', big: 'EN', small: 'ENGLAND · same rooftop, white shirts', dur: 1.4 },
  { id: 'fr', big: 'FR', small: 'FRANCE · l’heure dorée (sport-free tier)', dur: 1.4 },
  { id: 'pt', big: 'PT', small: 'PORTUGAL · a hora dourada', dur: 1.4 },
  { id: 'it', big: 'IT', small: 'ITALIA · l’ora dorata (sport-free tier)', dur: 1.4 },
  { id: 'de', big: 'DE', small: 'DEUTSCHLAND · die goldene Stunde', dur: 1.4 },
  { id: 'nl', big: 'NL', small: 'NEDERLAND · Oranje · het gouden uur', dur: 1.4 },
];

const html = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1080px;height:1920px;background:radial-gradient(120% 90% at 50% 30%,#2b1a08 0%,#120b04 60%,#0a0603 100%);
  font-family:'Avenir Next','Helvetica Neue',Arial,sans-serif;color:#f4e3c2;display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center;padding:0 90px}
  .big{font-size:${c.id === 'title' ? 150 : 320}px;font-weight:700;letter-spacing:${c.id === 'title' ? 2 : 18}px;line-height:1.06;margin:0}
  .rule{width:220px;height:3px;background:#c98f3d;margin:70px auto 60px}
  .small{font-size:44px;font-weight:500;letter-spacing:6px;text-transform:uppercase;color:#cdb086;line-height:1.5;margin:0}
</style></head><body><div class="wrap"><p class="big">${c.big}</p><div class="rule"></div><p class="small">${c.small}</p></div></body></html>`;

const pw = await import('playwright');
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const c of CARDS) {
  const png = join(WORK, `${c.id}.png`);
  const htmlPath = join(WORK, `${c.id}.html`);
  writeFileSync(htmlPath, html(c));
  await page.goto('file://' + htmlPath);
  await page.screenshot({ path: png });
  // still → clip with a gentle fade, silent stereo bed, same codec family as beats
  run('ffmpeg', ['-y', '-loop', '1', '-i', png, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(c.dur), '-vf', `fade=t=in:st=0:d=0.25,fade=t=out:st=${(c.dur - 0.3).toFixed(2)}:d=0.3,fps=30,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', '-shortest', join(WORK, `${c.id}.mp4`)]);
  console.log(`card ${c.id} rendered (${c.dur}s)`);
}
await browser.close();

// normalize each spot to the same codec params (and strip soft subs; the reel
// is a comparison artifact, per-market SRTs ship separately)
const seq = [join(WORK, 'title.mp4')];
for (const lang of ['es', 'en', 'fr', 'pt', 'it', 'de', 'nl']) {
  const src = join(OUT, `spot-${lang}.mp4`);
  if (!existsSync(src)) throw new Error(`missing ${src}: build the spots first`);
  const norm = join(WORK, `spot-${lang}.norm.mp4`);
  run('ffmpeg', ['-y', '-i', src, '-vf', 'fps=30,scale=1080:1920,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-sn', norm]);
  seq.push(join(WORK, `${lang}.mp4`), norm);
}
const listFile = join(WORK, 'concat.txt');
writeFileSync(listFile, seq.map((p) => `file '${p}'`).join('\n'));
const final = join(OUT, 'reel-one-script-seven-markets.mp4');
run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', final]);
console.log(`✓ reel → ${final.replace(ROOT + '/', '')}`);
