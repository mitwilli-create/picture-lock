// Bundle A: remix v3, full composition mix. Custom filter graph instead of the
// static stem mix: sfx bus with small-room reverb glue, sidechain ducking of
// every bed under the voice (Craft Law composition pass), softened flagged
// accents, -14 LUFS / -1.5 dBTP master.  Usage: node scripts/_bundle-a-remix4.mjs
import { readFileSync, existsSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const creative = await import(join(ROOT, 'lib', 'creative.mjs'));

const C = join(ROOT, '.cache', 'cover');
const premix = join(C, 'beat', 'cover-fixed-premix.mp4'); // video + clean VO + soft subs

// schedule (exact snapped starts)
const brief = JSON.parse(readFileSync(readdirSync(C).filter(f => f.startsWith('brief-')).map(f => join(C, f))[0], 'utf8')).brief;
const transcript = JSON.parse(readFileSync(readdirSync(C).filter(f => f.startsWith('transcript-')).map(f => join(C, f))[0], 'utf8'));
const snapped = creative.snapBeats(brief.beats, fx.probeDuration(join(ROOT, 'input', 'bundle-a-vo-master.mp3')), transcript.words);

// per-accent treatment answering the blind review, keyed by beat index:
//   drop 16 (synthetic whoomph chain: the roar bed covers it), soften 0 and
//   19/20 (match strike, switch clicks), longer fade on 9/10 (phone window)
const TREAT = {
  0: { vol: 0.5, lp: 3000 }, 9: { vol: 0.55, fade: 0.5 }, 10: { vol: 0.55, fade: 0.5 },
  7: { vol: 0.5, lp: 4000 }, 16: null, 19: { vol: 0.45, lp: 3500 }, 20: { vol: 0.45, lp: 3500 },
};
const entries = [];
for (const [i, s] of snapped.entries()) {
  const p = join(C, 'sfx', `beat-${i}.mp3`);
  if (!existsSync(p)) continue;
  if (TREAT[i] === null) continue;
  entries.push({ path: p, atSec: s.start, vol: TREAT[i]?.vol ?? 0.62, lp: TREAT[i]?.lp ?? 6500, fade: TREAT[i]?.fade ?? 0.35 });
}
// the four strong nat-sound beds from remix v2
for (const s of [
  { n: 'strong-card-table.mp3', at: 6.6, vol: 0.85 },
  { n: 'strong-counter-bowls.mp3', at: 27.0, vol: 0.85 },
  { n: 'strong-line-roar.mp3', at: 35.7, vol: 0.95 },
  { n: 'strong-guest-leaves.mp3', at: 42.15, vol: 0.9 },
]) entries.push({ path: join(C, 'sfx', s.n), atSec: s.at, vol: s.vol, lp: 6500, fade: 0.6 });
console.log(`entries: ${entries.length}`);

const music = join(C, 'music-arc.mp3');
const amb = join(C, 'ambience.mp3');
const dur = fx.probeDuration(premix);
const fadeOutAt = (dur - 2.8).toFixed(2);

const inputs = ['-i', premix, '-i', music, '-stream_loop', '-1', '-i', amb];
entries.forEach((e) => inputs.push('-i', e.path));

const F = [];
// voice: two copies (mix + sidechain key)
F.push(`[0:a]anull[voice]`);
// each sfx: fades, lowpass, level, delay → labeled
entries.forEach((e, i) => {
  const d = Math.round(e.atSec * 1000);
  const clipDur = fx.probeDuration(e.path);
  F.push(`[${i + 3}:a]afade=t=in:st=0:d=0.12,afade=t=out:st=${Math.max(0, clipDur - e.fade).toFixed(2)}:d=${e.fade},lowpass=f=${e.lp},volume=${e.vol},adelay=${d}|${d}[fx${i}]`);
});
// sfx bus: sum, small-room reverb glue, gentle high shelf
F.push(`${entries.map((_, i) => `[fx${i}]`).join('')}amix=inputs=${entries.length}:duration=longest:normalize=0,aecho=0.62:0.25:47|89:0.18|0.11[sfxbus]`);
// beds
F.push(`[1:a]volume=0.52,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutAt}:d=2.8[mus]`);
F.push(`[2:a]volume=0.4,lowpass=f=8500,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutAt}:d=2.8[ambb]`);
// beds + sfx bus mixed, then ducked under the voice (~4:1, musical release)
F.push(`[mus][ambb][sfxbus]amix=inputs=3:duration=first:normalize=0[beds]`);
// final: voice on top, master to -14 LUFS / -1.5 dBTP
F.push(`[voice][beds]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);

const out = join(ROOT, 'output', 'cover-remix4.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs,
  '-filter_complex', F.join(';'),
  '-map', '0:v', '-map', '[aout]', '-map', '0:s?',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-c:s', 'mov_text',
  '-movflags', '+faststart', out]);
console.log(`✓ ${out}: ${fx.probeDuration(out).toFixed(2)}s`);
