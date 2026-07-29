// Bundle B: persona-review QC fixes (adjudicated blockers/majors, 2026-07-13).
// 1. endcard: REBUILT DETERMINISTICALLY — real typography composited over the
//    actual product-hero footage (no generated type, no label hallucination).
// 2. pour: regenerate, serve explicitly FROM THE CAN (bottle appeared).
// 3. resolution: regenerate, PALE GOLD white wine in both glasses, can label
//    implied at angle (no close generated text).
// Usage: node --env-file=.env scripts/_bundle-b-qc-fixes.mjs
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fal = await import(join(ROOT, 'lib/fal.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const SHOTS = join(ROOT, '.cache/bundle-b/v3/shots');
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const receipts = { started: new Date().toISOString(), note: 'persona-review QC fixes', calls: [], costUsd: 0 };
const log = console.log;
const STYLE = 'naturalistic golden-hour palette, amber highlights, honest neutral midtones, believable observed low-sun light, never orange-crushed advertising saturation';

const keepTake = (mp4) => { const p = mp4.replace(/\.mp4$/, ''); let n = 1; while (existsSync(`${p}.take${n}.mp4`)) n++; if (existsSync(mp4)) renameSync(mp4, `${p}.take${n}.mp4`); };

async function regen(name, prompt, seconds) {
  const out = join(SHOTS, `${name}.mp4`);
  const tmp = out + '.new.mp4';
  const r = await fal.generateClip({ prompt, seconds, outPath: tmp, log });
  keepTake(out);
  renameSync(tmp, out);
  writeFileSync(out + '.json', JSON.stringify({ key: hash(`${prompt}:${seconds}`), name, qcFix: true }));
  receipts.calls.push({ stage: 'qc-fix', name, requestId: r.requestId, costUsd: r.estCostUsd });
  receipts.costUsd += r.estCostUsd;
  log(`✓ ${name} regenerated $${r.estCostUsd}`);
}

// [2] pour: serve from THE CAN, no bottle anywhere
await regen('pour',
  `Vertical 9:16 slow-motion beverage shot: a hand tilts a slim matte cream-and-gold ALUMINUM CAN and pours a clean arc of pale gold white wine DOWN from the can's drinking opening INTO a stemmed wine glass below, fine bubbles rising inside the glass bowl as it fills, condensation beading on the matte can and the glass, backlit by low sun through a row of Moorish horseshoe arches in soft bokeh, there is NO BOTTLE anywhere in the frame, the only vessel pouring is the aluminum can, ${STYLE}`, 6);

// [3] resolution: white wine reads white, label implied
await regen('resolution',
  `Vertical 9:16 quiet closing shot: two stemmed wine glasses filled with PALE STRAW-GOLD white wine, clearly light-colored and translucent with the low sun glowing THROUGH the pale liquid, beside a slim matte cream-and-gold can angled softly away so its label is implied not readable, resting together on a rooftop ledge as the last sun sinks behind the bell tower skyline of Cordoba, light going honey-colored, very slow push-in, calm and settled, ${STYLE}`, 4);

// [1] endcard: deterministic composite. Base plate = the resolution shot's
// final look (regenerated above); real type via Playwright; slow push-in.
const plate = join(SHOTS, 'endcard-plate.png');
run('ffmpeg', ['-y', '-v', 'error', '-sseof', '-0.5', '-i', join(SHOTS, 'resolution.mp4'), '-frames:v', '1', plate]);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1920px;position:relative;font-family:'Avenir Next','Helvetica Neue',Arial,sans-serif}
img{position:absolute;inset:0;width:1080px;height:1920px;object-fit:cover;filter:brightness(0.82) saturate(0.95)}
.veil{position:absolute;inset:0;background:radial-gradient(90% 60% at 50% 62%,rgba(10,6,2,0) 30%,rgba(10,6,2,0.55) 100%)}
.type{position:absolute;left:0;right:0;bottom:340px;text-align:center;color:#f6ead2}
.brand{font-size:118px;font-weight:700;letter-spacing:26px;margin:0 0 26px;text-indent:26px}
.rule{width:200px;height:3px;background:#d8a95c;margin:0 auto 30px}
.tag{font-size:52px;font-weight:500;letter-spacing:4px;margin:0;font-style:italic}
.sub{font-size:30px;letter-spacing:8px;color:#cdb086;margin:26px 0 0;text-transform:uppercase}
</style></head><body><img src="endcard-plate.png"><div class="veil"></div>
<div class="type"><p class="brand">MERIDIEM</p><div class="rule"></div>
<p class="tag">Disfruta la hora dorada</p><p class="sub">Vino blanco de España · 250 ml · 12,5% vol</p></div></body></html>`;
writeFileSync(join(SHOTS, 'endcard-card.html'), html);
const pw = await import('playwright');
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + join(SHOTS, 'endcard-card.html'));
const still = join(SHOTS, 'endcard-composited.png');
await page.screenshot({ path: still });
await browser.close();
// still → 4s clip with a gentle zoompan push-in (deterministic, $0)
const ec = join(SHOTS, 'endcard.mp4');
keepTake(ec);
run('ffmpeg', ['-y', '-loop', '1', '-i', still, '-vf',
  "zoompan=z='1+0.04*in/120':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=120:s=1080x1920:fps=30,format=yuv420p",
  '-t', '4', '-an', '-c:v', 'libx264', '-preset', 'veryfast', ec]);
writeFileSync(ec + '.json', JSON.stringify({ name: 'endcard', note: 'deterministic composite: real type over the resolution plate, zoompan push-in, $0' }));
receipts.calls.push({ stage: 'qc-fix', name: 'endcard-composite', costUsd: 0 });
log('✓ endcard rebuilt deterministically (real typography, $0)');

receipts.finished = new Date().toISOString();
receipts.costUsd = +receipts.costUsd.toFixed(4);
writeFileSync(join(ROOT, 'output/bundles/bundle-b/receipts/qc-fixes-manifest.json'), JSON.stringify(receipts, null, 2));
log(`✓ QC fixes complete, fresh spend $${receipts.costUsd}`);
