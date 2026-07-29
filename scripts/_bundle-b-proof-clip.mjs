// Bundle B: the voice-consistency proof clip ("meeting cut"). Dealbreaker
// optimization #2: a 60-90s artifact that proves the cloned brand voice holds
// across all seven markets, and is short enough to forward. Zero new
// generation: cuts the product beats (script beats 3-4, the ones where the
// brand name is spoken) straight from the seven finished market masters, so
// the shots stay identical while the language, captions, and market music bed
// change around the same voice. Label cards are Playwright-rendered HTML in
// the reel's card style (this ffmpeg build has no drawtext).
//
// Usage: node scripts/_bundle-b-proof-clip.mjs
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'output/bundles/bundle-b');
const WORK = join(ROOT, '.cache/bundle-b/proof');
mkdirSync(WORK, { recursive: true });
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const probe = (f) => parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// beats 3-4 start after beats 1-2 (4.0 + 3.5 = 7.5s in every market master);
// beat lengths are read from the v3 beat cache so a re-render stays correct
const SEG_START = 7.5;
const LANGS = [
  { id: 'es', name: 'ESPAÑOL', note: 'the master' },
  { id: 'en', name: 'ENGLISH', note: 'export' },
  { id: 'fr', name: 'FRANÇAIS', note: 'sport-free tier' },
  { id: 'pt', name: 'PORTUGUÊS', note: 'export' },
  { id: 'it', name: 'ITALIANO', note: 'sport-free tier' },
  { id: 'de', name: 'DEUTSCH', note: 'export' },
  { id: 'nl', name: 'NEDERLANDS', note: 'export' },
];
for (const l of LANGS) {
  const b2 = join(ROOT, `.cache/bundle-b/v3/${l.id}/beat/beat-2.mp4`);
  const b3 = join(ROOT, `.cache/bundle-b/v3/${l.id}/beat/beat-3.mp4`);
  if (!existsSync(b2) || !existsSync(b3)) throw new Error(`missing v3 beat cache for ${l.id}`);
  l.segDur = probe(b2) + probe(b3);
}

const CARDS = [
  { id: 'title', big: 'ONE VOICE.<br>SEVEN LANGUAGES.', small: 'MERIDIEM · the same cloned brand voice speaks every market · the product beats, cut straight from the seven finished masters · no re-recording', dur: 3.2 },
  ...LANGS.map((l) => ({ id: l.id, big: l.id.toUpperCase(), small: `${l.name} · ${l.note}`, dur: 0.9 })),
];

const html = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1080px;height:1920px;background:radial-gradient(120% 90% at 50% 30%,#2b1a08 0%,#120b04 60%,#0a0603 100%);
  font-family:'Avenir Next','Helvetica Neue',Arial,sans-serif;color:#f4e3c2;display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center;padding:0 90px}
  .big{font-size:${c.id === 'title' ? 130 : 320}px;font-weight:700;letter-spacing:${c.id === 'title' ? 2 : 18}px;line-height:1.06;margin:0}
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
  run('ffmpeg', ['-y', '-loop', '1', '-i', png, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(c.dur), '-vf', `fade=t=in:st=0:d=0.2,fade=t=out:st=${(c.dur - 0.25).toFixed(2)}:d=0.25,fps=30,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '160k', '-shortest', join(WORK, `card-${c.id}.mp4`)]);
  console.log(`card ${c.id} rendered (${c.dur}s)`);
}
await browser.close();

// cut beats 3-4 from each finished master (captions, market bed, and master
// mix already in place); short audio fades so the mid-bed cut never pops
const seq = [join(WORK, 'card-title.mp4')];
for (const l of LANGS) {
  const src = join(OUT, `spot-${l.id}.mp4`);
  if (!existsSync(src)) throw new Error(`missing ${src}: build the spots first`);
  const seg = join(WORK, `seg-${l.id}.mp4`);
  run('ffmpeg', ['-y', '-ss', String(SEG_START), '-t', l.segDur.toFixed(3), '-i', src,
    '-vf', 'fps=30,scale=1080:1920,format=yuv420p',
    '-af', `afade=t=in:st=0:d=0.08,afade=t=out:st=${(l.segDur - 0.18).toFixed(2)}:d=0.18`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-sn', seg]);
  seq.push(join(WORK, `card-${l.id}.mp4`), seg);
  console.log(`segment ${l.id} cut (${l.segDur.toFixed(2)}s)`);
}
const listFile = join(WORK, 'concat.txt');
writeFileSync(listFile, seq.map((p) => `file '${p}'`).join('\n'));
const final = join(OUT, 'proof-one-voice-seven-languages.mp4');
run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', final]);
console.log(`✓ proof clip → ${final.replace(ROOT + '/', '')} (${probe(final).toFixed(1)}s)`);
