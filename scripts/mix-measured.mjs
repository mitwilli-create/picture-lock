#!/usr/bin/env node
// Measured mix: gain-stage every stem to a target LUFS BEFORE mixing (the
// 2026-07-08 lesson: voice -22.9, nat -15.0 clipping, amb -38.3 — mixes built
// on relative volumes of unequal sources produced nat-over-voice, buried
// music, and gappy dips). Doc-mix staging under continuous narration:
//   voice -16 (anchor) · nat -24 · music -26.5 · amb -30 (gap glue)
// linear=true loudnorm = static gain, no pumping. Gentle 2:1 duck on nat only.
// Output: output/cover-measured.mp4 + blind review.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COVER = join(ROOT, '.cache', 'cover');
const NAT = join(COVER, 'nat');
const DIR = join(ROOT, 'output', 'sound-loop', 'measured');
mkdirSync(DIR, { recursive: true });
const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') });
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const cover = await import(join(ROOT, 'lib', 'cover.mjs'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });

const N = 14;
const durs = Array.from({ length: N }, (_, i) => fx.probeDuration(join(COVER, 'beat', `beat-${i}.mp4`)));
const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, d) => a + d, 0));
const total = starts[N - 1] + durs[N - 1];
const IMPACT = { 0: 0.12, 13: 0.12 };
// per-beat start nudge: beat 13's VISUAL landing is at 26.8s (Gemini frame
// read), 0.11s BEFORE its cut — shift the track so the slap peak hits 26.85s
const NUDGE = { 13: -0.18 };

function peakTime(path) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'], { maxBuffer: 64 * 1024 * 1024 });
  let max = 0, at = 0;
  for (let i = 0; i < pcm.length - 1; i += 2) { const v = Math.abs(pcm.readInt16LE(i)); if (v > max) { max = v; at = i / 2; } }
  return at / 8000;
}

// nat stem: aligned, gated, LONG dissolves (0.55s) so adjacent tracks mesh
const wavs = Array.from({ length: N }, (_, i) => {
  const va2 = join(NAT, `beat-${i}-va2.mp4`);
  const va = existsSync(va2) ? va2 : join(NAT, `beat-${i}-va.mp4`);
  const wav = join(DIR, `nat-${i}.wav`);
  let take = Math.min(fx.probeDuration(va), durs[i] + 1.2), fadeIn = 0.55;
  if (IMPACT[i] !== undefined) {
    const full = join(DIR, `nat-${i}-full.wav`);
    ff(['-i', va, '-vn', full]);
    const trim = Math.max(0, peakTime(full) - IMPACT[i]);
    take = Math.min(fx.probeDuration(va) - trim, durs[i] + 1.2);
    ff(['-ss', trim.toFixed(3), '-i', full, '-t', take.toFixed(3), wav]);
    fadeIn = 0.03;
  } else ff(['-i', va, '-vn', '-t', take.toFixed(3), wav]);
  if (fx.highBandGapDb(wav) < 8) fx.lowpassAudio(wav, 5000);
  return { wav, at: Math.max(0, starts[i] + (NUDGE[i] ?? 0)), dur: take, fadeIn };
});
const natRaw = join(DIR, 'nat-raw.wav');
execFileSync('ffmpeg', ['-y', '-v', 'error', ...wavs.flatMap((t) => ['-i', t.wav]), '-filter_complex',
  wavs.map((t, i) => {
    const d = Math.round(t.at * 1000);
    return `[${i}:a]afade=t=in:st=0:d=${t.fadeIn},afade=t=out:st=${Math.max(0.1, t.dur - 0.55).toFixed(2)}:d=0.55,adelay=${d}|${d}[n${i}]`;
  }).join(';') + `;${wavs.map((_, i) => `[n${i}]`).join('')}amix=inputs=${N}:duration=longest:normalize=0[out]`,
  '-map', '[out]', '-t', total.toFixed(2), natRaw]);

// gain-stage each stem to its target (linear = static gain, no pumping)
const stage = (inPath, I, out, extra = []) => {
  ff(['-i', inPath, ...extra, '-af', `loudnorm=I=${I}:TP=-2:LRA=11:linear=true`, '-ar', '48000', out]);
  return out;
};
const voice = stage(join(COVER, 'piece.mp3'), -16, join(DIR, 'voice.wav'));
const nat = stage(natRaw, -24, join(DIR, 'nat.wav'));
const musicRaw = join(DIR, 'mus-raw.wav');
ff(['-i', join(COVER, 'music-v2.mp3'), '-af', 'apad', '-t', total.toFixed(2), musicRaw]);
const music = stage(musicRaw, -26, join(DIR, 'music.wav'));
const ambRaw = join(DIR, 'amb-raw.wav');
ff(['-stream_loop', '-1', '-i', join(COVER, 'ambience.mp3'), '-t', total.toFixed(2), ambRaw]);
const amb = stage(ambRaw, -28, join(DIR, 'amb.wav'));

// mix: staged stems, gentle 2:1 duck on nat only, tail fades, -14 LUFS master
const fadeOutAt = Math.max(0, total - 2.5);
const mixWav = join(DIR, 'mix.wav');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', voice, '-i', nat, '-i', music, '-i', amb, '-filter_complex',
  [
    '[0:a]asplit=3[v][key1][key2]',
    '[1:a][key1]sidechaincompress=threshold=0.06:ratio=2:attack=15:release=400[natd]',
    // music also gives way to the voice (Mitchell 2026-07-08: vocal got lost in the score)
    `[2:a]afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[mus]`,
    '[mus][key2]sidechaincompress=threshold=0.05:ratio=2:attack=15:release=400[musd]',
    `[3:a]afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[ambf]`,
    '[v][natd][musd][ambf]amix=inputs=4:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11:linear=true[out]',
  ].join(';'),
  // -ar 48000: loudnorm upsamples to 192kHz internally; unresampled, the AAC
  // mux clamps to 96kHz and browser decoders refuse the track
  '-map', '[out]', '-ar', '48000', '-t', total.toFixed(2), mixWav]);

const out = join(ROOT, 'output', 'cover-measured.mp4');
cover.muxPieceAudio(join(COVER, 'beat', 'visual-track.mp4'), mixWav, join(COVER, 'captions.srt'), out);
console.log(`✓ ${out} ${fx.probeDuration(out).toFixed(2)}s (staged: voice -16, nat -24 duck 2:1, music-v2 -26 duck 2:1, amb -28, master -14)`);

// blind review the result
const GEMINI = readFileSync('/Users/mitchellwilliams/Documents/career-ops/.env', 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
const proxy = join(DIR, 'review-proxy.mp4');
ff(['-i', out, '-vf', 'scale=-2:480', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', proxy]);
const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI }, signal: AbortSignal.timeout(300_000),
  body: JSON.stringify({
    contents: [{ parts: [
      { inline_data: { mime_type: 'video/mp4', data: readFileSync(proxy).toString('base64') } },
      { text: `You are a veteran re-recording mixer reviewing a 28-second vertical short with narration, for a paying client deciding whether to ship. You have no other context. Judge ONLY the soundtrack, harshly: mix hierarchy, music, natural-sound realism, sync, transitions, artifacts, loudness/polish.\n\nReturn JSON only:\n{"scores":{"hierarchy":0-10,"music":0-10,"nat":0-10,"sync":0-10,"transitions":0-10,"artifacts":0-10,"polish":0-10},"overall":0-10,"ship":true|false,"fixes":[{"t":seconds,"instruction":"specific fix"}]}` },
    ] }],
    generationConfig: { response_mime_type: 'application/json' },
  }),
});
if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
const text = (await r.json()).candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}';
writeFileSync(join(DIR, 'review.json'), text);
const review = [].concat(JSON.parse(text))[0]; // Gemini sometimes array-wraps
console.log(`blind review: ${JSON.stringify(review.scores)} overall ${review.overall} ship=${review.ship}`);
for (const f of review.fixes ?? []) console.log(`  fix @${f.t}s: ${f.instruction}`);
