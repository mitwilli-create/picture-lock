// Bundle B: remix pass answering the blind reviewer's notes (EN 6/10, DE 4/10,
// both no-ship): per-SFX fade tails instead of blocky edges, longer pour foley,
// naturalistic re-source of the citrus foley (material + acoustic space spec),
// gentle VO glue compression, bus glue, and a -14 LUFS / -1.5 dBTP master.
// Leaves lib/ and the pipeline caches untouched; fixed SFX live under
// .cache/bundle-b/sfx-fixed/. Overwrites the bundle spot-<lang>.mp4 files.
//
// Usage: node --env-file=.env scripts/_bundle-b-remix.mjs [en de fr es it]
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

const OUT = join(ROOT, 'output/bundles/bundle-b');
const WORK = join(ROOT, '.cache/bundle-b');
const SFX_FIXED = join(WORK, 'sfx-fixed');
mkdirSync(SFX_FIXED, { recursive: true });

// Foley re-sources per the FOLEY PROMPT ACOUSTIC AND MATERIAL SPEC rule:
// explicit physical material + explicit acoustic space, soft and rounded.
const SFX_FIXES = {
  1: { dur: 2.8, text: 'a slim aluminum can pressed slowly into wet crushed ice in a copper bucket, soft wet granular crunch settling, gentle low carbonation, open-air evening acoustic with natural decay, rounded and soft, no metallic ring, no clank' },
  3: { dur: 4.0, text: 'a slow continuous pour of sparkling liquid over large clear ice cubes in a thin glass, lively soft carbonation bed and gentle ice crackle ringing out naturally, close glass acoustic in open evening air, rounded and warm, no hiss' },
};
// beat 2 (botanicals on linen): both blind passes flagged every candidate
// accent as synthetic ("liquid squeeze"); the ambience bed covers the moment,
// so the accent is deleted rather than re-sourced (restraint as craft).
const SFX_DROP = new Set([2]);
// copy says LOUD ice (beat 3): audio verb literalism, the pour rides higher
const SFX_VOL = { default: 0.4, 3: 0.5, 4: 0.45 };
// contact-frame sync (not cut sync): the toast clink lands where the glasses
// actually meet, ~1.5s into beat 4 (verified on extracted frames)
const SFX_DELAY = { 4: 1.5 };

// Round-3 content fixes. The council's EN ambience prompt baked foley events
// into the bed (the phantom "citrus squeeze"); regenerate as pure air. All
// five music beds read as ambient drones in blind review; regenerate with a
// steady soft pulse, keeping each market's character.
const MUSIC_V2 = {
  en: 'warm nu-disco groove with a clear soft four-on-the-floor pulse, live rhodes, muted funk guitar, upright bass, brushed kit, golden hour glow, steady commercial momentum, instrumental bed mixed under narration',
  de: 'minimal deep house with a steady soft kick pulse and warm analog bass groove, precise clean percussion, golden Feierabend evening mood, steady momentum, instrumental bed under narration',
  fr: 'jazz-tinged groove, brushed drums keeping a steady light swing, upright bass walking softly, warm electric piano, parisian aperitif at dusk, steady momentum, instrumental bed under narration',
  es: 'spanish nylon guitar over a soft steady rumba pulse, gentle palmas keeping time far in the background, warm mediterranean dusk, steady momentum, instrumental bed under narration',
  it: 'italian riviera groove, soft bossa-influenced pulse with brushed percussion, muted trumpet far back, piazza aperitivo at dusk, steady momentum, instrumental bed under narration',
};
const AMB_V2 = {
  en: 'continuous open-air rooftop terrace at golden hour, low distant city hum, soft traffic wash, faint faraway voices, gentle breeze moving over linen, warm evening air, pure environmental tone, no foley events, no impacts, steady and even',
};

const manifest = { started: new Date().toISOString(), note: 'remix pass after blind review (EN 6/10, DE 4/10 no-ship)', calls: [], costUsd: 0 };

// [1] regenerate the two flagged foley elements once (shared by all markets)
for (const [beat, f] of Object.entries(SFX_FIXES)) {
  const out = join(SFX_FIXED, `beat-${beat}.mp3`);
  if (existsSync(out)) { console.log(`[sfx-fix ${beat}] cached`); continue; }
  writeFileSync(out, await el.soundEffect({ text: f.text, durationSeconds: f.dur }));
  const gap = fx.highBandGapDb(out);
  if (gap < 8) fx.lowpassAudio(out, 4200);
  const c = (f.dur / 60) * 0.12;
  manifest.costUsd += c;
  manifest.calls.push({ stage: 'sfx-fix', beat: +beat, duration_s: f.dur, gapDb: +gap.toFixed(1), costUsd: c });
  console.log(`[sfx-fix ${beat}] ${f.dur}s gap ${gap.toFixed(1)}dB $${c.toFixed(4)}`);
}

// [1b] round-3 stems: leveled per-market music with pulse, pure-air EN ambience
const STEMS_V2 = join(WORK, 'stems-v2');
mkdirSync(STEMS_V2, { recursive: true });
async function ensureStem(kind, lang, prompt, seconds, gen) {
  const out = join(STEMS_V2, `${kind}-${lang}.mp3`);
  const side = out + '.json';
  let cached = null;
  try { cached = JSON.parse(readFileSync(side, 'utf8')); } catch {}
  if (cached?.prompt === prompt && existsSync(out)) { console.log(`[${kind}-v2 ${lang}] cached`); return out; }
  writeFileSync(out, await gen());
  const gap = fx.highBandGapDb(out);
  if (gap < 8) fx.lowpassAudio(out, 4200);
  writeFileSync(side, JSON.stringify({ prompt, seconds }));
  const c = kind === 'music' ? (seconds / 60) * 0.15 : (seconds / 60) * 0.12;
  manifest.costUsd += c;
  manifest.calls.push({ stage: `${kind}-v2`, lang, seconds, costUsd: c });
  console.log(`[${kind}-v2 ${lang}] ${seconds}s $${c.toFixed(4)}`);
  return out;
}

// per-language stem locations
const LANGS = {
  en: { flatFrom: 'cache-beat', music: join(ROOT, '.cache/music.mp3'), amb: join(ROOT, '.cache/ambience.mp3'), beatDir: join(ROOT, '.cache/beat'), srt: join(ROOT, '.cache/beat/captions.srt') },
  de: null, fr: null, es: null, it: null, // filled below from .cache/bundle-b/<lang>
};
for (const l of ['de', 'fr', 'es', 'it']) {
  const d = join(WORK, l);
  LANGS[l] = { flat: join(d, 'flat.mp4'), music: join(d, 'music.mp3'), amb: join(d, 'ambience.mp3'), beatDir: join(d, 'beat'), srt: join(d, 'beat/captions.srt') };
}

function sfxPath(i) {
  const fixed = join(SFX_FIXED, `beat-${i}.mp3`);
  return existsSync(fixed) ? fixed : join(ROOT, '.cache/sfx', `beat-${i}.mp3`);
}

// [2] remix: voice glue + faded stems + bus glue + loudness-normalized master
function remix(flatPath, musicPath, ambPath, sfxEntries, outPath) {
  const vidDur = fx.probeDuration(flatPath);
  const fadeOutAt = Math.max(0, vidDur - 3.2);
  const inputs = ['-i', flatPath, '-i', musicPath, '-stream_loop', '-1', '-i', ambPath];
  for (const s of sfxEntries) inputs.push('-i', s.path);
  const parts = [
    // narration bed: tame lows, gentle glue compression so the VO sits IN the mix
    `[0:a]highpass=f=70,acompressor=threshold=-21dB:ratio=2.5:attack=15:release=250:makeup=1.5[voc]`,
    // dynaudnorm first: Eleven Music beds open ~6dB quieter than their body,
    // which read as "music enters at 0:09" in blind review; level, then set
    `[1:a]dynaudnorm=f=700:g=21:m=6:p=0.6,volume=0.42,afade=t=in:st=0:d=1.0,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=3.2[mus]`,
    `[2:a]volume=0.28,lowpass=f=9000,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=3.2[amb]`,
  ];
  const mix = ['[voc]', '[mus]', '[amb]'];
  sfxEntries.forEach((s, i) => {
    const d = Math.max(0, Math.round(s.atSec * 1000));
    const sd = fx.probeDuration(s.path) || 2;
    // every clip edge fades: no blocky starts, tails ring out (0.7s decay)
    parts.push(`[${3 + i}:a]lowpass=f=7500,volume=${s.vol ?? 0.3},afade=t=in:st=0:d=0.15,afade=t=out:st=${Math.max(0.2, sd - 0.7).toFixed(2)}:d=0.7,adelay=${d}|${d}[fx${i}]`);
    mix.push(`[fx${i}]`);
  });
  parts.push(
    `${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0,` +
    `acompressor=threshold=-18dB:ratio=1.6:attack=25:release=400,` + // bus glue
    `loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.95[aout]`
  );
  run('ffmpeg', ['-y', ...inputs, '-filter_complex', parts.join(';'),
    '-map', '0:v', '-map', '[aout]', '-map', '0:s?',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text',
    '-movflags', '+faststart', outPath]);
}

const only = process.argv.slice(2).filter((a) => LANGS[a]);
const langs = only.length ? only : Object.keys(LANGS);

for (const lang of langs) {
  const L = LANGS[lang];
  // flat (pre-mix) cut: variants keep theirs; EN rebuilds from cached beats
  let flat = L.flat;
  if (lang === 'en') {
    flat = join(WORK, 'en-flat.mp4');
    const clips = [0, 1, 2, 3, 4, 5].map((i) => join(L.beatDir, `beat-${i}.mp4`));
    clips.forEach((c) => { if (!existsSync(c)) throw new Error(`missing ${c}`); });
    fx.assembleBeats(clips, L.srt, flat, WORK);
  }
  // sfx offsets = cumulative measured beat durations for THIS language's cut
  const sfxEntries = [];
  let offset = 0;
  for (let i = 0; i < 6; i++) {
    const b = join(L.beatDir, `beat-${i}.mp4`);
    if (!SFX_DROP.has(i)) sfxEntries.push({ path: sfxPath(i), atSec: offset + (SFX_DELAY[i] ?? 0), vol: SFX_VOL[i] ?? SFX_VOL.default });
    offset += fx.probeDuration(b);
  }
  const dur = Math.ceil(offset) + 2;
  const music = await ensureStem('music', lang, MUSIC_V2[lang], dur, () => el.music({ prompt: MUSIC_V2[lang], lengthMs: dur * 1000 }));
  const amb = AMB_V2[lang]
    ? await ensureStem('amb', lang, AMB_V2[lang], Math.min(28, dur), () => el.soundEffect({ text: AMB_V2[lang], durationSeconds: Math.min(28, dur) }))
    : L.amb;
  const out = join(OUT, `spot-${lang}.mp4`);
  remix(flat, music, amb, sfxEntries, out);
  console.log(`✓ remixed spot-${lang}.mp4 (${fx.probeDuration(out).toFixed(1)}s)`);
}

manifest.finished = new Date().toISOString();
manifest.costUsd = +manifest.costUsd.toFixed(4);
writeFileSync(join(OUT, 'receipts/remix-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`✓ remix complete, fresh spend $${manifest.costUsd}`);
