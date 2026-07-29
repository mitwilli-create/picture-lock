// Bundle B polish pass (client notes round 3): re-sourced pour foley (the
// prior one read wrong), and the end card recomposited with the named wine:
// 100% Pedro Ximenez, Montilla-Moriles (Cordoba's own DO).
// Usage: node --env-file=.env scripts/_bundle-b-polish.mjs
import { writeFileSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const SHOTS = join(ROOT, '.cache/bundle-b/v3/shots');
const STEMS = join(ROOT, '.cache/bundle-b/stems-v2');
const receipts = { started: new Date().toISOString(), note: 'client round 3 polish: pour foley + PX end card', calls: [], costUsd: 0 };

// [1] pour foley, re-sourced: soft liquid into glass, no weird texture
const pour = join(STEMS, 'sfx-pour-v2.mp3');
if (!existsSync(pour)) {
  writeFileSync(pour, await el.soundEffect({
    text: 'white wine pouring gently from a small can into a stemmed wine glass, a soft round liquid glug and delicate rising fizz as the glass fills, close and intimate, warm open-air acoustic with natural decay, smooth and pleasant, no metallic ring, no splashing, no hiss, no white noise',
    durationSeconds: 4.0,
  }));
  if (fx.highBandGapDb(pour) < 8) fx.lowpassAudio(pour, 4200);
  receipts.calls.push({ stage: 'sfx', name: 'pour-v2', costUsd: 0.008 });
  receipts.costUsd += 0.008;
  console.log('✓ pour foley re-sourced');
} else console.log('[pour-v2] cached');

// [2] end card recomposite with the named wine (real type, $0)
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1920px;position:relative;font-family:'Avenir Next','Helvetica Neue',Arial,sans-serif}
img{position:absolute;inset:0;width:1080px;height:1920px;object-fit:cover;filter:brightness(0.82) saturate(0.95)}
.veil{position:absolute;inset:0;background:radial-gradient(90% 60% at 50% 62%,rgba(10,6,2,0) 30%,rgba(10,6,2,0.55) 100%)}
.type{position:absolute;left:0;right:0;bottom:340px;text-align:center;color:#f6ead2}
.brand{font-size:118px;font-weight:700;letter-spacing:26px;margin:0 0 26px;text-indent:26px}
.rule{width:200px;height:3px;background:#d8a95c;margin:0 auto 30px}
.tag{font-size:52px;font-weight:500;letter-spacing:4px;margin:0;font-style:italic}
.sub{font-size:30px;letter-spacing:7px;color:#cdb086;margin:26px 0 0;text-transform:uppercase}
</style></head><body><img src="endcard-plate.png"><div class="veil"></div>
<div class="type"><p class="brand">MERIDIEM</p><div class="rule"></div>
<p class="tag">Disfruta la hora dorada</p><p class="sub">100% Pedro Ximénez · Montilla-Moriles · 250 ml · 12,5% vol</p></div></body></html>`;
writeFileSync(join(SHOTS, 'endcard-card.html'), html);
const pw = await import('playwright');
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + join(SHOTS, 'endcard-card.html'));
const still = join(SHOTS, 'endcard-composited.png');
await page.screenshot({ path: still });
await browser.close();
const ec = join(SHOTS, 'endcard.mp4');
const tmp = ec + '.new.mp4';
run('ffmpeg', ['-y', '-loop', '1', '-i', still, '-vf',
  "zoompan=z='1+0.04*in/120':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=120:s=1080x1920:fps=30,format=yuv420p",
  '-t', '4', '-an', '-c:v', 'libx264', '-preset', 'veryfast', tmp]);
renameSync(tmp, ec);
writeFileSync(ec + '.json', JSON.stringify({ name: 'endcard', note: 'PX Montilla-Moriles recomposite, real type, $0' }));
console.log('✓ end card recomposited with 100% Pedro Ximenez, Montilla-Moriles');

receipts.finished = new Date().toISOString();
receipts.costUsd = +receipts.costUsd.toFixed(4);
writeFileSync(join(ROOT, 'output/bundles/bundle-b/receipts/polish-manifest.json'), JSON.stringify(receipts, null, 2));
console.log(`✓ polish complete $${receipts.costUsd}`);
