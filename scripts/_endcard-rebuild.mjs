// Re-derive the round-4 continuation end card after a resolution-shot regen
// (alignment-audit fix D1, 2026-07-13: the prior resolution take carried a
// hallucinated different-product can, so its derived end card did too).
// Verbatim extraction of the round-4 [2] block: plate is the exact final
// frame of resolution.mp4, the zoom keeps moving, veil+type fade in over the
// motion. $0, ffmpeg + playwright only.
// Usage: node scripts/_endcard-rebuild.mjs
import { writeFileSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const SHOTS = join(ROOT, '.cache/bundle-b/v3/shots');
const log = console.log;

const plate = join(SHOTS, 'endcard-plate.png');
run('ffmpeg', ['-y', '-v', 'error', '-sseof', '-0.05', '-i', join(SHOTS, 'resolution.mp4'), '-frames:v', '1', plate]);
const typeHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1920px;background:transparent;font-family:'Avenir Next','Helvetica Neue',Arial,sans-serif}
.veil{position:absolute;inset:0;background:radial-gradient(90% 60% at 50% 62%,rgba(10,6,2,0) 30%,rgba(10,6,2,0.55) 100%)}
.type{position:absolute;left:0;right:0;bottom:340px;text-align:center;color:#f6ead2}
.brand{font-size:118px;font-weight:700;letter-spacing:26px;margin:0 0 26px;text-indent:26px}
.rule{width:200px;height:3px;background:#d8a95c;margin:0 auto 30px}
.tag{font-size:52px;font-weight:500;letter-spacing:4px;margin:0;font-style:italic}
.sub{font-size:30px;letter-spacing:7px;color:#cdb086;margin:26px 0 0;text-transform:uppercase}
</style></head><body><div class="veil"></div>
<div class="type"><p class="brand">MERIDIEM</p><div class="rule"></div>
<p class="tag">Disfruta la hora dorada</p><p class="sub">100% Pedro Ximénez · Montilla-Moriles · 250 ml · 12,5% vol</p></div></body></html>`;
writeFileSync(join(SHOTS, 'endcard-type.html'), typeHtml);
const pw = await import('playwright');
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + join(SHOTS, 'endcard-type.html'));
const typePng = join(SHOTS, 'endcard-type.png');
await page.screenshot({ path: typePng, omitBackground: true });
await browser.close();
const ec = join(SHOTS, 'endcard.mp4');
const tmp = ec + '.new.mp4';
run('ffmpeg', ['-y', '-loop', '1', '-i', plate, '-loop', '1', '-i', typePng, '-filter_complex',
  "[0:v]zoompan=z='1+0.05*in/120':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=120:s=1080x1920:fps=30[base];" +
  "[1:v]format=rgba,fade=t=in:st=0.3:d=0.9:alpha=1[type];" +
  "[base][type]overlay=0:0:shortest=1,format=yuv420p[v]",
  '-map', '[v]', '-t', '4', '-an', '-c:v', 'libx264', '-preset', 'veryfast', tmp]);
renameSync(tmp, ec);
writeFileSync(ec + '.json', JSON.stringify({ name: 'endcard', note: 'continuation end card rebuilt off the alignment-audit resolution retake (wrong-can fix)' }));
log('✓ continuation end card rebuilt from new resolution take');
