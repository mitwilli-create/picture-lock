// Bundle B v2 build: MERIDIEM as canned Spanish white wine, Sevilla master.
// Produces spot-es (master) + en/fr/pt/it/de variants + the FR product-only
// compliance cut, all from the v2 hero visuals in .cache/broll.
//
// Sound doctrine v3 (client notes 2026-07-13: choppy mix, tinny VO):
//  - ambience is DIEGETIC and matches the picture: ONE Sevilla evening bed
//    under every language cut; the market shift lives in the music score
//  - VO chain: highpass, de-esser, treble shelf cut (tinny fix), gentle glue
//  - every stem gain is LINEAR (measured LUFS + static gain), zero dynamic
//    normalizers, so nothing pumps in and out
//  - SFX carry 1.0s ring-out tails; master hits -14 LUFS / -1.5 dBTP linearly
//
// Usage: node --env-file=.env scripts/_bundle-b-v2-build.mjs [langs...]
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw';
const BROLL = join(ROOT, '.cache/broll');
const SFX_DIR = join(ROOT, '.cache/sfx');
const WORK = join(ROOT, '.cache/bundle-b/v2');
const STEMS = join(ROOT, '.cache/bundle-b/stems-v2');
const OUT = join(ROOT, 'output/bundles/bundle-b');
mkdirSync(WORK, { recursive: true });
mkdirSync(STEMS, { recursive: true });

// master es uses the pipeline's own VO cache; variants get scripts
const LANGS = {
  es: { script: 'input/bundle-b-hero-v2.md', music: null }, // music resolved below
  en: { script: 'input/bundle-b-v2-en.md' },
  fr: { script: 'input/bundle-b-v2-fr.md' },
  pt: { script: 'input/bundle-b-v2-pt.md' },
  it: { script: 'input/bundle-b-v2-it.md' },
  de: { script: 'input/bundle-b-v2-de.md' },
  nl: { script: 'input/bundle-b-v2-nl.md' },
};
// party beats (idx 3 toast-cheer, idx 4 photos) are market-specific: the
// rooftop crowd wears that market's plain crest-free kit (jerseys pass)
const MARKET_CLIPS = join(ROOT, '.cache/bundle-b/v2/clips');
const PARTY_BEATS = new Set([3, 4]);
// per-market score beds: existing stems-v2 tracks carry the market character;
// pt is the only new generation
const MUSIC = {
  // -full: the original gentle nylon bed disappears under continuous VO
  // (blind review heard "no music" twice); the master uses the fuller rumba
  es: { path: join(STEMS, 'music-es-full.mp3') },
  en: { path: join(STEMS, 'music-en.mp3') },
  fr: { path: join(STEMS, 'music-fr.mp3') },
  it: { path: join(STEMS, 'music-it.mp3') },
  de: { path: join(STEMS, 'music-de.mp3') },
  pt: { path: join(STEMS, 'music-pt.mp3'), prompt: 'portuguese guitarra-tinged warm underscore, soft fado-colored guitar over a gentle steady pulse, lisbon miradouro at dusk, relaxed and warm, no melody hook, instrumental bed under narration' },
  nl: { path: join(STEMS, 'music-nl.mp3'), prompt: 'warm melodic deep house underscore, soft organ chords over a gentle steady pulse, amsterdam canal-side summer evening, relaxed and warm, no melody hook, instrumental bed under narration' },
};
// one diegetic Sevilla bed for every cut (matches the on-screen world)
const AMBIENCE = { path: join(STEMS, 'amb-cordoba.mp3'), prompt: 'lively but relaxed spanish rooftop terrace atmosphere at golden hour in cordoba, clearly audible and textured: warm evening air moving, swifts calling overhead, continuous soft plaza murmur of distant voices below, faraway church bell once, recorded at natural street level, present and full, no foley events, no impacts, steady and even' };

const manifest = { started: new Date().toISOString(), voiceId: VOICE_ID, note: 'v2 wine repositioning build', markets: {}, costUsd: 0 };
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

// measured integrated loudness (ebur128), for LINEAR stem gains
function lufs(path) {
  const r = spawnSync('ffmpeg', ['-i', path, '-af', 'ebur128', '-f', 'null', '/dev/null'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = (r.stderr ?? '').match(/I:\s*(-?[\d.]+)\s*LUFS/g);
  const last = m?.[m.length - 1]?.match(/(-?[\d.]+)/);
  return last ? parseFloat(last[1]) : -23;
}
const gainDb = (path, targetLufs) => +(targetLufs - lufs(path)).toFixed(1);

async function ensureGen(spec, kind, seconds) {
  if (existsSync(spec.path)) return spec.path;
  if (!spec.prompt) throw new Error(`missing stem ${spec.path} and no prompt to generate it`);
  writeFileSync(spec.path, kind === 'music'
    ? await el.music({ prompt: spec.prompt, lengthMs: seconds * 1000 })
    : await el.soundEffect({ text: spec.prompt, durationSeconds: Math.min(28, seconds) }));
  if (fx.highBandGapDb(spec.path) < 8) fx.lowpassAudio(spec.path, 4200);
  const c = kind === 'music' ? (seconds / 60) * 0.15 : (Math.min(28, seconds) / 60) * 0.12;
  manifest.costUsd += c;
  log(`  [${kind}] generated ${spec.path.split('/').pop()} $${c.toFixed(4)}`);
  return spec.path;
}

// v3 mix: linear gains only
function mixV3(flatPath, musicPath, ambPath, sfxEntries, outPath) {
  const vidDur = fx.probeDuration(flatPath);
  const fadeOutAt = Math.max(0, vidDur - 3.2);
  const musGain = gainDb(musicPath, -16) - 5;   // bed ~5dB under normalized voice
  const ambGain = gainDb(ambPath, -16) - 10;    // both gains are vs MEASURED stem
                                                // loudness: a quiet generation
                                                // still lands at the same level
  const inputs = ['-i', flatPath, '-i', musicPath, '-stream_loop', '-1', '-i', ambPath];
  for (const s of sfxEntries) inputs.push('-i', s.path);
  const parts = [
    `[0:a]highpass=f=70,deesser=i=0.5,treble=g=-3.5:f=6000:width_type=q:width=0.7,acompressor=threshold=-20dB:ratio=2:attack=12:release=220:makeup=1.5[voc]`,
    `[1:a]volume=${musGain}dB,afade=t=in:st=0:d=1.0,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=3.2[mus]`,
    `[2:a]volume=${ambGain}dB,lowpass=f=9000,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=3.2[amb]`,
  ];
  const mix = ['[voc]', '[mus]', '[amb]'];
  sfxEntries.forEach((s, i) => {
    const d = Math.max(0, Math.round(s.atSec * 1000));
    const sd = fx.probeDuration(s.path) || 2;
    const g = gainDb(s.path, -16) + (s.boostDb ?? -8);
    parts.push(`[${3 + i}:a]lowpass=f=7500,volume=${g}dB,afade=t=in:st=0:d=0.15,afade=t=out:st=${Math.max(0.2, sd - 1.0).toFixed(2)}:d=1.0,adelay=${d}|${d}[fx${i}]`);
    mix.push(`[fx${i}]`);
  });
  parts.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0,acompressor=threshold=-18dB:ratio=1.3:attack=25:release=400[aout]`);
  const pre = outPath.replace(/\.mp4$/, '.pre.mp4');
  run('ffmpeg', ['-y', ...inputs, '-filter_complex', parts.join(';'),
    '-map', '0:v', '-map', '[aout]', '-map', '0:s?',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text', pre]);
  // linear master: measured static gain to -14 LUFS, brickwall at -1.5 dBTP
  const g = +( -14 - lufs(pre) ).toFixed(1);
  run('ffmpeg', ['-y', '-i', pre, '-map', '0:v', '-map', '0:a', '-map', '0:s?',
    '-af', `volume=${g}dB,alimiter=limit=0.84`,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text', '-movflags', '+faststart', outPath]);
  return outPath;
}

const only = process.argv.slice(2).filter((a) => LANGS[a]);
const langs = only.length ? only : Object.keys(LANGS);

// shared Sevilla ambience once
await ensureGen(AMBIENCE, 'amb', 25);

for (const lang of langs) {
  const L = LANGS[lang];
  const beats = parseBeats(L.script);
  const dir = join(WORK, lang);
  const voDir = join(dir, 'vo'), beatDir = join(dir, 'beat');
  mkdirSync(voDir, { recursive: true });
  mkdirSync(beatDir, { recursive: true });
  let cost = 0;
  log(`\n▶ ${lang.toUpperCase()} v2 (${beats.length} beats)${lang === 'es' ? ' [master]' : ''}`);

  for (const [i, b] of beats.entries()) {
    // master reuses the pipeline's ES VO cache; variants TTS with sidecar cache
    if (lang === 'es') { b.voPath = join(ROOT, '.cache/vo', `beat-${i}.mp3`); continue; }
    b.voPath = join(voDir, `beat-${i}.mp3`);
    const side = join(voDir, `beat-${i}.json`);
    let cached = null;
    try { cached = JSON.parse(readFileSync(side, 'utf8')); } catch {}
    if (cached?.text === b.vo && existsSync(b.voPath)) continue;
    writeFileSync(b.voPath, await el.tts({ text: b.vo, voiceId: VOICE_ID }));
    const c = (b.vo.length / 1000) * 0.10;
    cost += c;
    writeFileSync(side, JSON.stringify({ text: b.vo, costUsd: c }));
    log(`  [vo ${i}] ${b.vo.length} chars`);
  }

  const clips = [], sfxEntries = [], durs = [];
  let offset = 0;
  for (const [i, b] of beats.entries()) {
    const clipPath = PARTY_BEATS.has(i) ? join(MARKET_CLIPS, `beat-${i}-${lang}.mp4`) : join(BROLL, `beat-${i}.mp4`);
    if (!existsSync(clipPath)) throw new Error(`missing v2 visual ${clipPath}${PARTY_BEATS.has(i) ? ' (run the jerseys pass first)' : ''}`);
    const { out, dur } = fx.renderBeat({ index: i, seconds: b.seconds, voPath: b.voPath, clipPath, visualMode: 'gen', cacheDir: beatDir });
    clips.push(out); durs.push(dur);
    // beat 3 carries the goal-cheer accent; pour (2) rides slightly higher;
    // beat 4 gets NO accent (isolated generated laughter reads canned; the
    // crowd texture lives in the ambience and the cheer's tail)
    const sfxFile = i === 3 ? join(STEMS, 'sfx-cheer.mp3') : join(SFX_DIR, `beat-${i}.mp3`);
    if (i !== 4 && existsSync(sfxFile)) sfxEntries.push({ path: sfxFile, atSec: offset, boostDb: i === 2 ? -6 : i === 3 ? -7 : -8 });
    offset += dur;
  }
  const totalS = Math.ceil(offset) + 2;
  const music = await ensureGen(MUSIC[lang], 'music', totalS);

  const srt = join(beatDir, 'captions.srt');
  fx.buildSrt(beats, durs, srt);
  const flat = join(dir, 'flat.mp4');
  fx.assembleBeats(clips, srt, flat, beatDir);
  const final = join(OUT, `spot-${lang}.mp4`);
  mixV3(flat, music, AMBIENCE.path, sfxEntries, final);
  copyFileSync(srt, join(OUT, `spot-${lang}.srt`));
  log(`  ✓ spot-${lang}.mp4 (${fx.probeDuration(final).toFixed(1)}s)`);
  manifest.markets[lang] = { out: `spot-${lang}.mp4`, duration_s: +fx.probeDuration(final).toFixed(2), marketCostUsd: +cost.toFixed(4) };
  manifest.costUsd += cost;

  // FR compliance cut: product-only beats (1,2,3,6 in script order = idx 0,1,2,5),
  // no people, no celebration: the shape Loi Evin permits. Same assets, $0.
  if (lang === 'fr') {
    const keep = [0, 1, 2, 5];
    const kBeats = keep.map((i) => beats[i]);
    const kClips = keep.map((i) => clips[i]);
    const kDurs = keep.map((i) => durs[i]);
    const kSfx = [];
    let off2 = 0;
    keep.forEach((i, k) => {
      const sfxFile = join(SFX_DIR, `beat-${i}.mp3`);
      if (existsSync(sfxFile)) kSfx.push({ path: sfxFile, atSec: off2, boostDb: i === 2 ? -6 : -8 });
      off2 += kDurs[k];
    });
    const srt2 = join(beatDir, 'captions-product-only.srt');
    fx.buildSrt(kBeats, kDurs, srt2);
    const flat2 = join(dir, 'flat-product-only.mp4');
    fx.assembleBeats(kClips, srt2, flat2, beatDir);
    const final2 = join(OUT, 'spot-fr-product-only.mp4');
    mixV3(flat2, music, AMBIENCE.path, kSfx, final2);
    log(`  ✓ spot-fr-product-only.mp4 (${fx.probeDuration(final2).toFixed(1)}s, Loi Evin shape)`);
    manifest.markets['fr-product-only'] = { out: 'spot-fr-product-only.mp4', duration_s: +fx.probeDuration(final2).toFixed(2), note: 'people/celebration beats removed', marketCostUsd: 0 };
  }
}

manifest.finished = new Date().toISOString();
manifest.costUsd = +manifest.costUsd.toFixed(4);
writeFileSync(join(OUT, 'receipts/v2-build-manifest.json'), JSON.stringify(manifest, null, 2));
log(`\n✓ v2 build complete, fresh spend $${manifest.costUsd}`);
