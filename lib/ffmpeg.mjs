// lib/ffmpeg.mjs — local media ops (no API, no spend).
// Two jobs: (1) mock generators so the whole pipeline runs end-to-end with zero
// API key (placeholder VO via macOS `say`, placeholder visuals via ffmpeg), and
// (2) the real assemble stage that cuts visuals to VO timing and concatenates
// beats into output/short.mp4 with a soft-subtitle (SRT) caption track.
//
// Caption strategy: SOFT subs (mov_text), not burned-in. This ffmpeg build has no
// drawtext filter, and soft subs are what a producer wants anyway — editable in
// Resolve, toggleable, and non-destructive. The mock and live paths assemble
// IDENTICALLY: swap ElevenLabs assets into .cache and stageAssemble does not care
// whether they were generated or mocked.

import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
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

// One self-contained beat clip: colored canvas sized to the beat's duration
// (max of requested seconds and the VO length), VO muxed. No burned text.
export function renderBeat({ index, seconds, voPath, cacheDir }) {
  mkdirSync(cacheDir, { recursive: true });
  const out = join(cacheDir, `beat-${index}.mp4`);
  const dur = Math.max(seconds || 3, voPath ? probeDuration(voPath) : 0) || 3;
  const bg = PALETTE[index % PALETTE.length];

  const vArgs = ['-y', '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:r=${FPS}:d=${dur.toFixed(2)}`];
  const aArgs = voPath ? ['-i', voPath] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  run('ffmpeg', [
    ...vArgs, ...aArgs,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    out,
  ]);
  return { out, dur };
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
    out += `${i + 1}\n${tc(start)} --> ${tc(end)}\n${b.vo}\n\n`;
  });
  writeFileSync(outPath, out);
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
    outPath,
  ];
  run('ffmpeg', args);
  return outPath;
}
