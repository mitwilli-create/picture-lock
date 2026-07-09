// Composition mix pass on the V2A fish cover ($0, all nat tracks cached):
//  1. voice on top: nat + music sidechain-ducked against the vocal, not static
//  2. impact alignment: beat 13's catch slap transient moved onto the cut
//  3. tails: every nat track runs ~0.6s past its shot and fades over the next
//     shot's head (no chopped shouts, natural meshing)
//  4. score audible: music 0.34 ducked under voice, loudnorm -14 LUFS master
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const ROOT = '/Users/mitchellwilliams/Documents/broll-pipeline';
const COVER = join(ROOT, '.cache', 'cover');
const BEAT = join(COVER, 'beat');
const NAT = join(COVER, 'nat');
const MIX = join(COVER, 'nat-mix');
mkdirSync(MIX, { recursive: true });
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });

const N = 14;
const durs = Array.from({ length: N }, (_, i) => fx.probeDuration(join(BEAT, `beat-${i}.mp4`)));
const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, d) => a + d, 0));

// loudest transient position in a wav (mono 8kHz PCM scan)
function peakTime(path) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'], { maxBuffer: 64 * 1024 * 1024 });
  let max = 0, at = 0;
  for (let i = 0; i < pcm.length - 1; i += 2) {
    const v = Math.abs(pcm.readInt16LE(i));
    if (v > max) { max = v; at = i / 2; }
  }
  return at / 8000;
}

// re-extract each nat track from the cached MMAudio result with a tail past
// its shot, re-gate, and transient-align the impact beats
const IMPACT = { 0: 0.12, 13: 0.12 }; // beats whose peak must land this far after their cut
const tracks = [];
for (let i = 0; i < N; i++) {
  // va2 = freeze-frame-extended regen (real tail); fall back to the original
  const va2 = join(NAT, `beat-${i}-va2.mp4`);
  const va = existsSync(va2) ? va2 : join(NAT, `beat-${i}-va.mp4`);
  const maxTail = existsSync(va2) ? 1.2 : 0.6;
  const vaDur = fx.probeDuration(va);
  const wav = join(MIX, `beat-${i}.wav`);
  let take = Math.min(vaDur, durs[i] + maxTail);
  let fadeIn = 0.25;
  if (IMPACT[i] !== undefined) {
    const full = join(MIX, `beat-${i}-full.wav`);
    ff(['-i', va, '-vn', full]);
    const p = peakTime(full);
    const trim = Math.max(0, p - IMPACT[i]);
    take = Math.min(vaDur - trim, durs[i] + maxTail);
    ff(['-ss', trim.toFixed(3), '-i', full, '-t', take.toFixed(3), wav]);
    fadeIn = 0.03;
    console.log(`  beat ${i}: impact peak at ${p.toFixed(2)}s → trimmed ${trim.toFixed(2)}s so it lands ${IMPACT[i]}s after the cut`);
  } else {
    ff(['-i', va, '-vn', '-t', take.toFixed(3), wav]);
  }
  let gap = fx.highBandGapDb(wav);
  if (gap < 8) { fx.lowpassAudio(wav, 5000); gap = fx.highBandGapDb(wav); }
  tracks.push({ wav, at: starts[i], dur: take, fadeIn });
  console.log(`  beat ${i}: ${take.toFixed(2)}s tail=${(take - durs[i]).toFixed(2)}s gap=${gap.toFixed(1)}dB`);
}

// report where the flight/scale/catch transients now sit (sync evidence)
for (const i of [11, 12, 13]) console.log(`  timeline check beat ${i}: cut @${starts[i].toFixed(2)}s, track peak @${(starts[i] + peakTime(tracks[i].wav)).toFixed(2)}s`);

const premix = join(BEAT, 'natplus-premix.mp4'); // visuals + untouched voice
const music = join(COVER, 'music.mp3');
const amb = join(COVER, 'ambience.mp3');
const vidDur = fx.probeDuration(premix);
const fadeOutAt = Math.max(0, vidDur - 2.5);

const inputs = ['-i', premix, '-i', music, '-stream_loop', '-1', '-i', amb];
const parts = [
  '[0:a]asplit=3[voice][key1][key2]',
  `[1:a]volume=0.34,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[mus]`,
  `[2:a]volume=0.12,lowpass=f=8000,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[amb]`,
];
const natLabels = [];
tracks.forEach((t, i) => {
  inputs.push('-i', t.wav);
  const d = Math.round(t.at * 1000);
  parts.push(`[${3 + i}:a]afade=t=in:st=0:d=${t.fadeIn},afade=t=out:st=${Math.max(0.1, t.dur - 0.4).toFixed(2)}:d=0.4,adelay=${d}|${d}[n${i}]`);
  natLabels.push(`[n${i}]`);
});
parts.push(
  `${natLabels.join('')}amix=inputs=${natLabels.length}:duration=longest:normalize=0,volume=0.42[nats]`,
  // voice on top: nat ducks 4:1 when the vocal speaks, music ducks harder
  '[nats][key1]sidechaincompress=threshold=0.035:ratio=4:attack=8:release=300[natd]',
  '[mus][key2]sidechaincompress=threshold=0.03:ratio=8:attack=5:release=400[musd]',
  '[voice][natd][musd][amb]amix=inputs=4:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]',
);

const out = join(ROOT, 'output', 'cover-v2a2.mp4');
execFileSync('ffmpeg', [
  '-y', '-v', 'error', ...inputs,
  '-filter_complex', parts.join(';'),
  '-map', '0:v', '-map', '[aout]', '-map', '0:s?',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text',
  '-movflags', '+faststart', out,
]);
console.log(`✓ ${out} ${fx.probeDuration(out).toFixed(2)}s (sidechain-ducked nat 0.42 + music 0.34, tails meshed, -14 LUFS master)`);
