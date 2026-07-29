// Bundle B v3 build: 8-beat, ~34s Cordoba master + 6 export markets + the FR
// product-only compliance cut, from named shots (.cache/bundle-b/v3/shots).
//
// Client-notes doctrine (2026-07-13 draft review):
//  - music sits ~9dB under the voice (was too loud at 5)
//  - the mix runs the FULL video length: voice branch is apadded, amix uses
//    duration=longest, output pinned with -t (the cut-out-early bug)
//  - VO gets 0.35s of lead-in silence per beat + short lines with real pauses
//    (breathing room); one shared diegetic Cordoba ambience under every cut
//  - per-beat accents from a named SFX map; photos beat carries none
//
// Usage: node --env-file=.env scripts/_bundle-b-v3-build.mjs [langs...]
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw';
const SHOTS = join(ROOT, '.cache/bundle-b/v3/shots');
const STEMS = join(ROOT, '.cache/bundle-b/stems-v2');
const SFX_FIXED = join(ROOT, '.cache/bundle-b/sfx-fixed');
const WORK = join(ROOT, '.cache/bundle-b/v3');
const OUT = join(ROOT, 'output/bundles/bundle-b');
mkdirSync(OUT, { recursive: true });

const LANGS = {
  es: { script: 'input/bundle-b-hero-v3.md' },
  en: { script: 'input/bundle-b-v3-en.md' },
  fr: { script: 'input/bundle-b-v3-fr.md' },
  pt: { script: 'input/bundle-b-v3-pt.md' },
  it: { script: 'input/bundle-b-v3-it.md' },
  de: { script: 'input/bundle-b-v3-de.md' },
  nl: { script: 'input/bundle-b-v3-nl.md' },
};
// beat index (0-based) → named shot; party beats resolve per market
const CLIP = (lang) => [
  'cordoba-wide', 'rooftop-light', 'product-hero', 'pour',
  `party-toast-${lang}`, `party-photos-${lang}`, 'resolution', 'endcard',
];
// per-beat accents (0-based index → file + level under the normalized voice)
const SFX_MAP = {
  // lag = seconds after beat start to the visual contact frame
  2: { path: join(SFX_FIXED, 'beat-1.mp3'), boostDb: -9, lag: 0.2 },   // can into wet ice
  3: { path: join(STEMS, 'sfx-pour-v2.mp3'), boostDb: -8, lag: 0.7 },  // re-sourced pour (client: prior one sounded wrong)
  4: { path: join(STEMS, 'sfx-cheer.mp3'), boostDb: -7, lag: 0.8 },    // goal cheer + clink on the toast
  6: { path: join(STEMS, 'sfx-bell.mp3'), boostDb: -13, lag: 0.2 },    // one distant bell
  7: { path: join(ROOT, '.cache/sfx/beat-5.mp3'), boostDb: -10, lag: 0.2 }, // final fizz
};
// .body.mp3 stems are trimmed to their measured loud window (per-second scan
// in music-trims.json): Eleven Music beds open with long quiet intros and die
// at the tail, and looping the raw files put those dead zones mid-cut
const MUSIC = {
  es: join(STEMS, 'music-es-full.body.mp3'),
  en: join(STEMS, 'music-en.body.mp3'),
  fr: join(STEMS, 'music-fr.body.mp3'),
  pt: join(STEMS, 'music-pt.body.mp3'),
  it: join(STEMS, 'music-it.body.mp3'),
  de: join(STEMS, 'music-de.body.mp3'),
  nl: join(STEMS, 'music-nl.body.mp3'),
};
const AMB = join(STEMS, 'amb-cordoba.mp3');

const manifest = { started: new Date().toISOString(), voiceId: VOICE_ID, note: 'v3 8-beat build', markets: {}, costUsd: 0 };
const log = console.log;

function parseBeats(path) {
  const raw = readFileSync(join(ROOT, path), 'utf8');
  const beats = [];
  for (const block of raw.split(/^##\s+/m).slice(1)) {
    const vo = (block.match(/^VO:\s*(.+)/im) || [])[1]?.trim() || '';
    const seconds = parseFloat((block.match(/^SECONDS:\s*([\d.]+)/im) || [])[1] || '4');
    if (vo) beats.push({ vo, seconds, caption: '' });
  }
  return beats;
}

function lufs(path) {
  const r = spawnSync('ffmpeg', ['-i', path, '-af', 'ebur128', '-f', 'null', '/dev/null'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = (r.stderr ?? '').match(/I:\s*(-?[\d.]+)\s*LUFS/g);
  const last = m?.[m.length - 1]?.match(/(-?[\d.]+)/);
  return last ? parseFloat(last[1]) : -23;
}
const gainDb = (path, target) => +(target - lufs(path)).toFixed(1);

function mixV4(flatPath, musicPath, sfxEntries, outPath) {
  const vidDur = fx.probeDuration(flatPath);
  const fadeOutAt = Math.max(0, vidDur - 3.4);
  const musGain = gainDb(musicPath, -16) - 6.5; // client: -5 too loud; blind gate: -9 inaudible
  const ambGain = gainDb(AMB, -16) - 14; // client: birds too loud (was -10)
  const inputs = ['-i', flatPath, '-stream_loop', '-1', '-i', musicPath, '-stream_loop', '-1', '-i', AMB];
  for (const s of sfxEntries) inputs.push('-i', s.path);
  const parts = [
    // aresample async first: the concat-assembled flat carries PTS gaps that
    // otherwise survive the mix as audible dropouts (zero-frame windows at
    // ~2.6s/6.5s were measured on the v3 first build)
    `[0:a]aresample=async=1:first_pts=0,highpass=f=70,deesser=i=0.5,treble=g=-3.5:f=6000:width_type=q:width=0.7,acompressor=threshold=-20dB:ratio=2:attack=12:release=220:makeup=1.5,apad[voc]`,
    // music dies WITH the picture, not before it (client: music cuts out)
    `[1:a]volume=${musGain}dB,afade=t=in:st=0:d=1.2,afade=t=out:st=${(vidDur - 2.2).toFixed(2)}:d=2.2[mus]`,
    `[2:a]volume=${ambGain}dB,lowpass=f=6000,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=3.4[amb]`, // 6k lowpass tames the swift calls specifically
  ];
  const mix = ['[voc]', '[mus]', '[amb]'];
  sfxEntries.forEach((s, i) => {
    const d = Math.max(0, Math.round(s.atSec * 1000));
    const sd = fx.probeDuration(s.path) || 2;
    const g = gainDb(s.path, -16) + s.boostDb;
    parts.push(`[${3 + i}:a]lowpass=f=7500,volume=${g}dB,afade=t=in:st=0:d=0.15,afade=t=out:st=${Math.max(0.2, sd - 1.0).toFixed(2)}:d=1.0,adelay=${d}|${d}[fx${i}]`);
    mix.push(`[fx${i}]`);
  });
  // duration=longest + explicit -t: the mix must never end before the picture
  parts.push(`${mix.join('')}amix=inputs=${mix.length}:duration=longest:normalize=0,acompressor=threshold=-18dB:ratio=1.3:attack=25:release=400[aout]`);
  const pre = outPath.replace(/\.mp4$/, '.pre.mp4');
  run('ffmpeg', ['-y', ...inputs, '-filter_complex', parts.join(';'),
    '-map', '0:v', '-map', '[aout]', '-map', '0:s?', '-t', vidDur.toFixed(2),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text', pre]);
  const g = +(-14 - lufs(pre)).toFixed(1);
  run('ffmpeg', ['-y', '-i', pre, '-map', '0:v', '-map', '0:a', '-map', '0:s?',
    '-af', `volume=${g}dB,alimiter=limit=0.84:level=false`,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text', '-movflags', '+faststart', outPath]);
  // verify-and-trim: limiter interaction can land hot (measured -12.7 on a
  // -14 target once); one corrective pass keeps every master at -14 ±0.5
  const landed = lufs(outPath);
  if (Math.abs(landed - -14) > 0.5) {
    const trim = +(-14 - landed).toFixed(1);
    const tmp2 = outPath.replace(/\.mp4$/, '.trim.mp4');
    run('ffmpeg', ['-y', '-i', outPath, '-map', '0:v', '-map', '0:a', '-map', '0:s?',
      '-af', `volume=${trim}dB,alimiter=limit=0.84:level=false`,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text', '-movflags', '+faststart', tmp2]);
    renameSync(tmp2, outPath);
  }
  return outPath;
}

// burned-in captions: Playwright-rendered styled cards (this ffmpeg has no
// subtitles/drawtext), overlaid per beat window; audio copied untouched
let _browser = null;
async function captionPage() {
  if (!_browser) { const pw = await import('playwright'); _browser = await pw.chromium.launch(); }
  return _browser.newPage({ viewport: { width: 1080, height: 1920 } });
}
async function burnCaptions(videoPath, beats, durs, capDir) {
  mkdirSync(capDir, { recursive: true });
  const page = await captionPage();
  const pngs = [];
  for (const [i, b] of beats.entries()) {
    // the end card is a designed type object; captioning it doubles the text
    if (!b.vo || i === beats.length - 1) { pngs.push(null); continue; }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:1080px;height:1920px;background:transparent;font-family:'Avenir Next','Helvetica Neue',Arial,sans-serif}
      .wrap{position:absolute;left:70px;right:70px;bottom:300px;display:flex;justify-content:center}
      .cap{display:inline-block;max-width:900px;text-align:center;font-size:50px;line-height:1.32;font-weight:600;
        color:#f6ead2;background:rgba(12,7,3,0.42);padding:18px 34px;border-radius:14px;
        text-shadow:0 2px 10px rgba(0,0,0,0.55);letter-spacing:0.4px}
    </style></head><body><div class="wrap"><span class="cap">${b.vo.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span></div></body></html>`;
    const hp = join(capDir, `cap-${i}.html`);
    writeFileSync(hp, html);
    await page.goto('file://' + hp);
    const png = join(capDir, `cap-${i}.png`);
    await page.screenshot({ path: png, omitBackground: true });
    pngs.push(png);
  }
  await page.close();
  const inputs = ['-i', videoPath];
  const parts = [];
  let t = 0, prev = '[0:v]', k = 0;
  for (const [i, png] of pngs.entries()) {
    const start = t, end = t + durs[i];
    t = end;
    if (!png) continue;
    inputs.push('-i', png);
    const out = `[v${k + 1}]`;
    parts.push(`${prev}[${k + 1}:v]overlay=0:0:enable='between(t,${(start + 0.15).toFixed(2)},${(end - 0.1).toFixed(2)})'${out}`);
    prev = out; k++;
  }
  const tmp = videoPath.replace(/\.mp4$/, '.cap.mp4');
  run('ffmpeg', ['-y', ...inputs, '-filter_complex', parts.join(';'),
    '-map', prev, '-map', '0:a', '-map', '0:s?',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'copy', '-c:s', 'mov_text', '-movflags', '+faststart', tmp]);
  renameSync(tmp, videoPath);
}

// 0.35s of lead-in air on every VO line (breathing room)
function padVo(src, dst) {
  run('ffmpeg', ['-y', '-i', src, '-af', 'adelay=350|350', '-c:a', 'libmp3lame', '-q:a', '2', dst]);
  return dst;
}

const only = process.argv.slice(2).filter((a) => LANGS[a]);
const langs = only.length ? only : Object.keys(LANGS);

for (const lang of langs) {
  const beats = parseBeats(LANGS[lang].script);
  const dir = join(WORK, lang);
  const voDir = join(dir, 'vo'), beatDir = join(dir, 'beat');
  mkdirSync(voDir, { recursive: true });
  mkdirSync(beatDir, { recursive: true });
  let cost = 0;
  log(`\n▶ ${lang.toUpperCase()} v3 (${beats.length} beats)${lang === 'es' ? ' [master]' : ''}`);

  for (const [i, b] of beats.entries()) {
    const raw = join(voDir, `beat-${i}.raw.mp3`);
    b.voPath = join(voDir, `beat-${i}.mp3`);
    const side = join(voDir, `beat-${i}.json`);
    let cached = null;
    try { cached = JSON.parse(readFileSync(side, 'utf8')); } catch {}
    if (!(cached?.text === b.vo && existsSync(b.voPath))) {
      writeFileSync(raw, await el.tts({ text: b.vo, voiceId: VOICE_ID }));
      padVo(raw, b.voPath);
      const c = (b.vo.length / 1000) * 0.10;
      cost += c;
      writeFileSync(side, JSON.stringify({ text: b.vo, costUsd: c }));
      log(`  [vo ${i}] ${b.vo.length} chars`);
    }
  }

  const clipNames = CLIP(lang);
  const clips = [], sfxEntries = [], durs = [];
  let offset = 0;
  for (const [i, b] of beats.entries()) {
    const clipPath = join(SHOTS, `${clipNames[i]}.mp4`);
    if (!existsSync(clipPath)) throw new Error(`missing shot ${clipNames[i]} (run _bundle-b-shots-v3.mjs first)`);
    const { out, dur } = fx.renderBeat({ index: i, seconds: b.seconds, voPath: b.voPath, clipPath, visualMode: 'gen', cacheDir: beatDir });
    clips.push(out); durs.push(dur);
    const s = SFX_MAP[i];
    if (s && existsSync(s.path)) sfxEntries.push({ ...s, atSec: offset + (s.lag ?? 0.2) });
    offset += dur;
  }

  const srt = join(beatDir, 'captions.srt');
  fx.buildSrt(beats, durs, srt);
  const flat = join(dir, 'flat.mp4');
  fx.assembleBeats(clips, srt, flat, beatDir);
  const final = join(OUT, `spot-${lang}.mp4`);
  mixV4(flat, MUSIC[lang], sfxEntries, final);
  await burnCaptions(final, beats, durs, join(dir, 'captions'));
  copyFileSync(srt, join(OUT, `spot-${lang}.srt`));
  log(`  ✓ spot-${lang}.mp4 (${fx.probeDuration(final).toFixed(1)}s)`);
  manifest.markets[lang] = { out: `spot-${lang}.mp4`, duration_s: +fx.probeDuration(final).toFixed(2), marketCostUsd: +cost.toFixed(4) };
  manifest.costUsd += cost;

  // FR compliance cut: product and place only (no people, no celebration)
  if (lang === 'fr') {
    const keep = [0, 1, 2, 3, 7];
    const kBeats = keep.map((i) => beats[i]);
    const kClips = keep.map((i) => clips[i]);
    const kDurs = keep.map((i) => durs[i]);
    const kSfx = [];
    let off2 = 0;
    keep.forEach((i, k) => {
      const s = SFX_MAP[i];
      if (s && existsSync(s.path)) kSfx.push({ ...s, atSec: off2 + (s.lag ?? 0.2) });
      off2 += kDurs[k];
    });
    const srt2 = join(beatDir, 'captions-product-only.srt');
    fx.buildSrt(kBeats, kDurs, srt2);
    const flat2 = join(dir, 'flat-product-only.mp4');
    fx.assembleBeats(kClips, srt2, flat2, beatDir);
    const final2 = join(OUT, 'spot-fr-product-only.mp4');
    mixV4(flat2, MUSIC.fr, kSfx, final2);
    await burnCaptions(final2, kBeats, kDurs, join(dir, 'captions-product-only'));
    log(`  ✓ spot-fr-product-only.mp4 (Loi Evin shape)`);
    manifest.markets['fr-product-only'] = { out: 'spot-fr-product-only.mp4', note: 'people/celebration beats removed', marketCostUsd: 0 };
  }
}

if (_browser) await _browser.close();
manifest.finished = new Date().toISOString();
manifest.costUsd = +manifest.costUsd.toFixed(4);
writeFileSync(join(OUT, 'receipts/v3-build-manifest.json'), JSON.stringify(manifest, null, 2));
log(`\n✓ v3 build complete, fresh spend $${manifest.costUsd}`);
