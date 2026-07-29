// Bundle B round 4 (client notes): (a) regenerate all 7 music beds at 45s so
// no looping ever occurs under the ~35s cuts (loop seams read as "music cuts
// out"), trimmed to their measured loud body; (b) rebuild the end card as a
// CONTINUATION: plate is the exact final frame of the resolution shot, the
// zoom keeps moving, and the veil+type fade IN over the motion (kills the
// jump cut at the end).
// Usage: node --env-file=.env scripts/_bundle-b-round4.mjs
import { writeFileSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const STEMS = join(ROOT, '.cache/bundle-b/stems-v2');
const SHOTS = join(ROOT, '.cache/bundle-b/v3/shots');
const receipts = { started: new Date().toISOString(), note: 'round 4: 45s seamless music beds + continuation end card', calls: [], costUsd: 0 };
const log = console.log;

const PROMPTS = {
  es: 'warm spanish nylon guitar underscore over a soft steady rumba pulse, gentle palmas far in the background, cordoba rooftop at dusk, relaxed and warm, steady momentum, no melody hook, instrumental bed under narration',
  en: 'warm nu-disco groove with a clear soft four-on-the-floor pulse, live rhodes, muted funk guitar, upright bass, golden hour glow, steady momentum, no melody hook, instrumental bed under narration',
  fr: 'jazz-tinged groove, brushed drums keeping a steady light swing, upright bass walking softly, warm electric piano, parisian aperitif at dusk, steady momentum, no melody hook, instrumental bed under narration',
  pt: 'portuguese guitarra-tinged warm underscore, soft fado-colored guitar over a gentle steady pulse, lisbon miradouro at dusk, relaxed and warm, steady momentum, no melody hook, instrumental bed under narration',
  it: 'italian riviera groove, soft bossa-influenced pulse with brushed percussion, muted trumpet far back, piazza aperitivo at dusk, steady momentum, no melody hook, instrumental bed under narration',
  de: 'minimal deep house with a steady soft kick pulse and warm analog bass groove, precise clean percussion, golden evening mood, steady momentum, no melody hook, instrumental bed under narration',
  nl: 'warm melodic deep house underscore, soft organ chords over a gentle steady pulse, amsterdam canal-side summer evening, relaxed and warm, steady momentum, no melody hook, instrumental bed under narration',
};

// per-second mean scan → loud body window
function bodyWindow(path) {
  const dur = Math.floor(parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).toString()));
  const means = [];
  for (let s = 0; s < dur; s++) {
    const r = spawnSync('ffmpeg', ['-ss', String(s), '-t', '1', '-i', path, '-af', 'volumedetect', '-f', 'null', '/dev/null'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const m = (r.stderr ?? '').match(/mean_volume:\s*(-?[\d.]+)/);
    means.push(m ? parseFloat(m[1]) : -99);
  }
  const peak = Math.max(...means);
  const start = means.findIndex((v) => v >= peak - 12);
  let end = dur;
  for (let i = means.length - 1; i >= 0; i--) { if (means[i] >= peak - 12) { end = i + 1; break; } }
  return { start, end };
}

// [1] 45s beds, trimmed to body, replacing the looped short stems
const MARK = join(STEMS, 'music45.json');
if (!existsSync(MARK)) {
  for (const [lang, prompt] of Object.entries(PROMPTS)) {
    const raw = join(STEMS, `music-${lang}-45.mp3`);
    writeFileSync(raw, await el.music({ prompt, lengthMs: 45000 }));
    if (fx.highBandGapDb(raw) < 8) fx.lowpassAudio(raw, 4200);
    const { start, end } = bodyWindow(raw);
    const body = join(STEMS, lang === 'es' ? 'music-es-full.body.mp3' : `music-${lang}.body.mp3`);
    run('ffmpeg', ['-y', '-v', 'error', '-ss', String(start), '-to', String(end), '-i', raw, '-c:a', 'libmp3lame', '-q:a', '2', body]);
    const c = (45 / 60) * 0.15;
    receipts.calls.push({ stage: 'music-45', lang, bodyStart: start, bodyEnd: end, costUsd: +c.toFixed(4) });
    receipts.costUsd += c;
    log(`  ✓ ${lang} bed 45s, body ${start}->${end}s`);
  }
  writeFileSync(MARK, JSON.stringify({ done: true, createdAt: new Date().toISOString() }));
} else log('  [music-45] already regenerated');

// [2] continuation end card: exact last frame of resolution, zoom continues,
// veil + type fade in over the motion
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
// base motion continues the resolution push-in; type layer fades in at 0.3s
run('ffmpeg', ['-y', '-loop', '1', '-i', plate, '-loop', '1', '-i', typePng, '-filter_complex',
  "[0:v]zoompan=z='1+0.05*in/120':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=120:s=1080x1920:fps=30[base];" +
  "[1:v]format=rgba,fade=t=in:st=0.3:d=0.9:alpha=1[type];" +
  "[base][type]overlay=0:0:shortest=1,format=yuv420p[v]",
  '-map', '[v]', '-t', '4', '-an', '-c:v', 'libx264', '-preset', 'veryfast', tmp]);
renameSync(tmp, ec);
writeFileSync(ec + '.json', JSON.stringify({ name: 'endcard', note: 'continuation end card: exact resolution last frame, continued zoom, type fades in (jump-cut fix)' }));
log('  ✓ continuation end card rebuilt');

receipts.finished = new Date().toISOString();
receipts.costUsd = +receipts.costUsd.toFixed(4);
writeFileSync(join(ROOT, 'output/bundles/bundle-b/receipts/round4-manifest.json'), JSON.stringify(receipts, null, 2));
log(`✓ round 4 complete $${receipts.costUsd}`);
