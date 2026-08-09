// Bundle A: repair the clipped ending. The assembled visual track (48.77s) ran
// shorter than the master take (49.44s), truncating the whispered button word.
// Fix: hold the final frame (lights-out shot) to 50.5s, re-mux the FULL master
// VO padded with a short breath of silence, and re-run the exact stem mix with
// snapped beat starts recomputed from the cached brief + transcript.
// Usage: node scripts/_bundle-a-fix-tail.mjs
import { readFileSync, existsSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const cover = await import(join(ROOT, 'lib', 'cover.mjs'));
const creative = await import(join(ROOT, 'lib', 'creative.mjs'));

const C = join(ROOT, '.cache', 'cover');
const OUT = join(ROOT, 'output');
const MASTER_VO = join(ROOT, 'input', 'bundle-a-vo-master.mp3');
const pieceDur = fx.probeDuration(MASTER_VO); // 49.44

// 1. extend the visual track with a last-frame hold
const vt = join(C, 'beat', 'visual-track.mp4');
const vtExt = join(C, 'beat', 'visual-track-ext.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', vt,
  '-vf', 'tpad=stop_mode=clone:stop_duration=2.0', '-an',
  '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', vtExt]);
console.log(`visual track: ${fx.probeDuration(vt).toFixed(2)}s → ${fx.probeDuration(vtExt).toFixed(2)}s`);

// 2. pad the master VO with 0.8s of silence (breathing room for the button)
const voPad = join(C, 'vo-padded.wav');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', MASTER_VO,
  '-af', 'apad=pad_dur=0.8', voPad]);

// 3. mux full audio onto the extended track (word-timed captions unchanged).
// Direct mux, no -shortest: the sparse subtitle stream must not set the
// output length; explicit -t leaves air after the whispered button.
const srt = join(C, 'captions.srt');
const premix = join(C, 'beat', 'cover-fixed-premix.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', vtExt, '-i', voPad, '-i', srt,
  '-map', '0:v', '-map', '1:a', '-map', '2:0',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
  '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng',
  '-t', '50.3', '-movflags', '+faststart', premix]);
console.log(`premix: ${fx.probeDuration(premix).toFixed(2)}s`);

// 4. exact sfx schedule: same snapBeats call the pipeline made
const brief = JSON.parse(readFileSync(readdirSync(C).filter(f => f.startsWith('brief-')).map(f => join(C, f))[0], 'utf8')).brief;
const transcript = JSON.parse(readFileSync(readdirSync(C).filter(f => f.startsWith('transcript-')).map(f => join(C, f))[0], 'utf8'));
const snapped = creative.snapBeats(brief.beats, pieceDur, transcript.words);
const sfxEntries = [];
for (const [i, s] of snapped.entries()) {
  const p = join(C, 'sfx', `beat-${i}.mp3`);
  if (existsSync(p)) sfxEntries.push({ path: p, atSec: s.start });
}
console.log(`sfx entries: ${sfxEntries.length}, beats: ${snapped.length}`);

// 5. stem mix (same lib call, same defaults as the pipeline run)
const fixed = join(OUT, 'cover-fixed.mp4');
fx.mixStems(premix, join(C, 'music.mp3'), sfxEntries, fixed, { ambientPath: join(C, 'ambience.mp3') });
console.log(`✓ ${fixed}: ${fx.probeDuration(fixed).toFixed(2)}s`);
