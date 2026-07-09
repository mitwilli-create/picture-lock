// lib/ffmpeg.mjs: local media ops (no API, no spend).
// Two jobs: (1) mock generators so the whole pipeline runs end-to-end with zero
// API key (placeholder VO via macOS `say`, placeholder visuals via ffmpeg), and
// (2) the real assemble stage that cuts visuals to VO timing and concatenates
// beats into output/short.mp4 with a soft-subtitle (SRT) caption track.
//
// Caption strategy: SOFT subs (mov_text), not burned-in. This ffmpeg build has no
// drawtext filter, and soft subs are what a producer wants anyway: editable in
// Resolve, toggleable, and non-destructive. The mock and live paths assemble
// IDENTICALLY: swap ElevenLabs assets into .cache and stageAssemble does not care
// whether they were generated or mocked.

import { execFileSync, spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';

const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

// Vertical 1080x1920 reads best on LinkedIn/mobile. Per-beat bg varies for rhythm.
const W = 1080, H = 1920, FPS = 30;
const PALETTE = ['0x0e1a2b', '0x1b1030', '0x08221f', '0x2b1410', '0x101b2b', '0x241026'];

export function probeDuration(path) {
  try {
    const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]);
    const d = parseFloat(out.toString().trim());
    return Number.isFinite(d) ? d : 0;
  } catch { return 0; }
}

// Mock voiceover: macOS `say` → aiff. Real, audible narration, $0.
export function mockVoiceover(text, outPath, voice = 'Samantha') {
  run('say', ['-v', voice, '-o', outPath, '--', text || ' ']);
  return outPath;
}

// Fit a source clip's duration to the beat's: trim from the head when long,
// slow-to-fit for small shortfalls, freeze the last frame for big ones.
// Pure string builder so the branches are testable without encoding.
export function fitClipFilter(clipDur, targetDur) {
  if (clipDur >= targetDur) return `trim=duration=${targetDur.toFixed(2)},setpts=PTS-STARTPTS`;
  const deficit = targetDur - clipDur;
  if (deficit / targetDur <= 0.25) return `setpts=PTS*${(targetDur / clipDur).toFixed(5)}`;
  return `tpad=stop_mode=clone:stop_duration=${deficit.toFixed(2)}`;
}

// Shared grade applied to every real clip so the hybrid cut reads as one
// film: slight contrast lift + gentle desaturation everywhere; the vignette
// only on cinematic gen footage (it would dim corner text on mograph beats).
const GRADE_BASE = "curves=all='0/0 0.5/0.49 1/1',eq=saturation=0.93:contrast=1.03";
const GRADE_GEN = `${GRADE_BASE},vignette=angle=PI/6`;

// One self-contained beat clip sized to the beat's duration (max of requested
// seconds and the VO length), VO muxed. clipPath composites real footage
// (cover-fit to 1080x1920, duration-fit, graded); without it, the original
// solid-color card (mock mode and the fallback path). No burned text.
export function renderBeat({ index, seconds, voPath, clipPath = null, visualMode = 'card', grade = null, cacheDir }) {
  mkdirSync(cacheDir, { recursive: true });
  const out = join(cacheDir, `beat-${index}.mp4`);
  const dur = Math.max(seconds || 3, voPath ? probeDuration(voPath) : 0) || 3;

  // optional director-specified grade overrides the house grade
  const base = grade
    ? `curves=all='0/0 0.5/0.49 1/1',eq=saturation=${grade.saturation.toFixed(2)}:contrast=${grade.contrast.toFixed(2)}`
    : GRADE_BASE;
  let vArgs, filter;
  if (clipPath) {
    const clipDur = probeDuration(clipPath) || dur;
    vArgs = ['-y', '-i', clipPath];
    filter = ['-vf', [
      `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`,
      fitClipFilter(clipDur, dur),
      `fps=${FPS}`,
      visualMode === 'gen' ? `${base},vignette=angle=PI/6` : base,
    ].join(',')];
  } else {
    const bg = PALETTE[index % PALETTE.length];
    vArgs = ['-y', '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:r=${FPS}:d=${dur.toFixed(2)}`];
    filter = [];
  }
  const aArgs = voPath ? ['-i', voPath] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  run('ffmpeg', [
    ...vArgs, ...aArgs, ...filter,
    '-map', '0:v', '-map', '1:a', '-t', dur.toFixed(2),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '128k',
    out,
  ]);
  return { out, dur };
}

// Poster frame for the site embed.
export function extractPoster(videoPath, outPath, atSec = 1.0) {
  run('ffmpeg', ['-y', '-ss', atSec.toFixed(2), '-i', videoPath, '-frames:v', '1', '-q:v', '3', outPath]);
  return outPath;
}

// SRT timecode: seconds → HH:MM:SS,mmm
function tc(sec) {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const mm = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${mm}`;
}

// Build an SRT from beats + their measured durations (cumulative timing).
export function buildSrt(beats, durations, outPath) {
  let t = 0, out = '';
  beats.forEach((b, i) => {
    const start = t, end = t + (durations[i] || b.seconds || 3);
    t = end;
    if (!b.vo) return;
    out += `${i + 1}\n${tc(start)} --> ${tc(end)}\n${b.caption || b.vo}\n\n`;
  });
  writeFileSync(outPath, out);
  return outPath;
}

// Harshness check (Craft Law rule 10): how far the high band (4kHz+) sits
// below the full-band level, in dB. Small gaps mean screechy audio.
export function highBandGapDb(path) {
  const meanOf = (filter) => {
    const r = spawnSync('ffmpeg', ['-y', '-i', path, '-af', filter, '-f', 'null', '/dev/null'], { encoding: 'utf8' });
    const m = (r.stderr ?? '').match(/mean_volume:\s*(-?[\d.]+)/);
    return m ? parseFloat(m[1]) : NaN;
  };
  const full = meanOf('volumedetect');
  const high = meanOf('highpass=f=4000,volumedetect');
  if (!Number.isFinite(full) || !Number.isFinite(high)) return 99; // can't judge: pass
  return full - high; // positive gap = highs quieter than overall (good); < ~8 = harsh
}

// Hard lowpass an audio file in place (harshness-gate last resort when a
// regenerated take still fails highBandGapDb).
export function lowpassAudio(path, freq = 4200) {
  const tmp = path.replace(/(\.\w+)$/, '.lp$1');
  run('ffmpeg', ['-y', '-v', 'error', '-i', path, '-af', `lowpass=f=${freq}`, tmp]);
  renameSync(tmp, path);
  return path;
}

// Mix stems over an assembled cut (Craft Law rule 10, three layers under the
// voice): continuous scene ambience (looped, low), music bed (audible, ducked,
// faded), sparse SFX accents (low-passed, level-capped, on their cut offsets).
// Video stream is copied untouched.
export function mixStems(videoPath, musicPath, sfxEntries, outPath, opts = {}) {
  const { ambientPath = null, musicVol = 0.32, sfxVol = 0.4, ambVol = 0.2 } = opts;
  const vidDur = probeDuration(videoPath);
  const inputs = ['-i', videoPath];
  if (musicPath) inputs.push('-i', musicPath);
  if (ambientPath) inputs.push('-stream_loop', '-1', '-i', ambientPath);
  for (const s of sfxEntries) inputs.push('-i', s.path);
  const parts = [];
  const mix = ['[0:a]'];
  let idx = 1;
  const fadeOutAt = Math.max(0, vidDur - 2.5);
  if (musicPath) {
    parts.push(`[${idx}:a]volume=${musicVol},afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[mus]`);
    mix.push('[mus]'); idx++;
  }
  if (ambientPath) {
    parts.push(`[${idx}:a]volume=${ambVol},lowpass=f=9000,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[amb]`);
    mix.push('[amb]'); idx++;
  }
  sfxEntries.forEach((s, i) => {
    const d = Math.max(0, Math.round(s.atSec * 1000));
    parts.push(`[${idx}:a]lowpass=f=7500,volume=${sfxVol},adelay=${d}|${d}[fx${i}]`);
    mix.push(`[fx${i}]`); idx++;
  });
  parts.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0,alimiter=limit=0.95[aout]`);
  run('ffmpeg', [
    '-y', ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', '0:v', '-map', '[aout]', '-map', '0:s?',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text',
    '-movflags', '+faststart', // moov up front: streams over dumb static servers
    outPath,
  ]);
  return outPath;
}

// Concatenate beat clips → output/short.mp4, muxing the SRT as a soft-sub track.
export function assembleBeats(beatClips, srtPath, outPath, cacheDir) {
  const listFile = join(cacheDir, 'concat.txt');
  writeFileSync(listFile, beatClips.map(p => `file '${p}'`).join('\n'));
  const args = [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-i', srtPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '128k',
    '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng',
    '-movflags', '+faststart',
    outPath,
  ];
  run('ffmpeg', args);
  return outPath;
}
