// Take D: the merge cut. 37 shots, none over 3.0s, cut to the conversational
// narration's 15-anchor beat map. Screen recordings are motion-interpolated to
// 60fps (smooth constant-velocity scrolls); site loops and mograph beats carry
// the graphic language; 6 bespoke section stingers are the transitions.
// Voice is the treated (de-tinny, -1dB) narration; overall target -16.5 LUFS.
// Usage: node scripts/_assemble-take-d.mjs
import { mixStems } from '../lib/ffmpeg.mjs';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';

const D = 'output/takes/d';
const CAP_OLD = 'output/takes/capture';
const CG = `${process.env.HOME}/Documents/storytellermitch-site/assets/cinemagraphs`;
const STILLS = `${process.env.HOME}/Documents/storytellermitch-site/assets/stills`;
const MG = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec/.cache/broll';
const TMP = '.cache/takes-d';
mkdirSync(TMP, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const PAD = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x181818`;
const MCI = 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1';

// kind: rec = screen recording (MCI 60fps) · loop = site cinemagraph (pad, loop)
//       mg = mograph beat window (60fps dup) · st = stinger · still = zoompan push
const SHOTS = [
  { kind: 'st',   src: `${D}/stingers/stinger-01.mp4`, t: 1.10 },                 // 0.00  THE PITCH
  { kind: 'rec',  src: `${D}/capture/lin-index.webm`,  ss: 4.0,  t: 2.60 },       // hero gliding
  { kind: 'rec',  src: `${CAP_OLD}/closer.webm`,       ss: 3.0,  t: 2.98 },       // Mitchell + Let's build
  { kind: 'loop', src: `${CG}/band-signal-flow-b-hd.mp4`,        t: 2.50 },       // 6.68  systems
  { kind: 'rec',  src: `${D}/capture/lin-fit.webm`,    ss: 4.0,  t: 2.30 },
  { kind: 'loop', src: `${CG}/fill-ai-projects-b-hd.mp4`,        t: 1.74 },
  { kind: 'st',   src: `${D}/stingers/stinger-02.mp4`, t: 1.10 },                 // 13.22 THE FLAGSHIP
  { kind: 'rec',  src: `${D}/capture/lin-broll.webm`,  ss: 5.0,  t: 2.30 },
  { kind: 'loop', src: `${CG}/illo-broll-machine-loop.mp4`,      t: 1.96 },
  { kind: 'mg',   src: `${MG}/beat-1.mp4`,             ss: 1.5,  t: 2.46 },       // 18.58 script types
  { kind: 'mg',   src: `${MG}/beat-3.mp4`,             ss: 1.0,  t: 2.20 },       // 21.04 waveform
  { kind: 'rec',  src: `${CAP_OLD}/broll-play.webm`,   ss: 20.0, t: 2.30 },       // reel playing
  { kind: 'mg',   src: `${MG}/beat-4.mp4`,             ss: 1.2,  t: 2.20 },       // dub chips
  { kind: 'st',   src: `${D}/stingers/stinger-03.mp4`, t: 1.10 },                 // 27.74 THE RECEIPT
  { kind: 'mg',   src: `${MG}/beat-5.mp4`,             ss: 1.8,  t: 2.80 },       // receipt printing
  { kind: 'still', src: `${STILLS}/illo-broll-machine-hd.jpg`, t: 2.52, z0: 1.50, z1: 1.64, cx: 0.62 },
  { kind: 'mg',   src: `${MG}/beat-6.mp4`,             ss: 1.5,  t: 2.60 },       // 34.16 manifest scroll
  { kind: 'rec',  src: `${D}/capture/lin-receipt.webm`, ss: 12.0, t: 2.44 },
  { kind: 'rec',  src: `${D}/capture/lin-receipt.webm`, ss: 21.0, t: 3.00 },      // 39.20 receipt framed
  { kind: 'mg',   src: `${MG}/beat-5.mp4`,             ss: 3.6,  t: 1.72 },       // TOTAL lands
  { kind: 'loop', src: `${CG}/fill-work-loop.mp4`,               t: 1.70 },
  { kind: 'rec',  src: `${CAP_OLD}/work-hover.webm`,   ss: 16.0, t: 2.62 },       // 45.62 standard
  { kind: 'loop', src: `${CG}/fill-storiesboard-loop.mp4`,       t: 1.80 },       // 48.24 provenance
  { kind: 'loop', src: `${CG}/illo-agent-fleet-c-hd.mp4`,        t: 1.70 },
  { kind: 'rec',  src: `${CAP_OLD}/theater.webm`,      ss: 22.0, t: 2.10 },       // 51.74 source
  { kind: 'st',   src: `${D}/stingers/stinger-04.mp4`, t: 1.10 },                 // 53.84 THE GATES
  { kind: 'rec',  src: `${D}/capture/lin-systems.webm`, ss: 8.0, t: 2.90 },
  { kind: 'loop', src: `${CG}/illo-triage-agent-c-hd.mp4`,       t: 2.00 },
  { kind: 'rec',  src: `${D}/capture/lin-systems.webm`, ss: 14.0, t: 1.96 },
  { kind: 'st',   src: `${D}/stingers/stinger-05.mp4`, t: 1.10 },                 // 61.80 THE VOICE
  { kind: 'loop', src: `${CG}/illo-voice-os-c-hd.mp4`,           t: 2.60 },
  { kind: 'rec',  src: `${CAP_OLD}/voice-console.webm`, ss: 16.5, t: 2.56 },
  { kind: 'st',   src: `${D}/stingers/stinger-06.mp4`, t: 1.10 },                 // 68.06 THE PATH
  { kind: 'loop', src: `${CG}/fill-fit2-c-hd.mp4`,               t: 2.10 },
  { kind: 'rec',  src: `${D}/capture/lin-for11.webm`,  ss: 5.0,  t: 1.90 },
  { kind: 'rec',  src: `${CAP_OLD}/closer.webm`,       ss: 5.5,  t: 2.10 },       // 73.16 Let's build
  { kind: 'mg',   src: `${MG}/beat-12.mp4`,            ss: 0.4,  t: 3.74 },       // endcard
];

const total = SHOTS.reduce((a, s) => a + s.t, 0);
console.log(`shots: ${SHOTS.length}, total ${total.toFixed(2)}s, max ${Math.max(...SHOTS.map(s => s.t))}s`);

const pieces = [];
SHOTS.forEach((s, i) => {
  const out = `${TMP}/d-${String(i).padStart(2, '0')}.mp4`;
  const enc = ['-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', out];
  if (s.kind === 'rec') {
    ff(['-ss', String(s.ss), '-t', String(s.t + 0.1), '-i', s.src,
      '-vf', `${MCI},format=yuv420p,setsar=1`, '-t', String(s.t), ...enc]);
  } else if (s.kind === 'loop') {
    ff(['-stream_loop', '4', '-i', s.src, '-t', String(s.t),
      '-vf', `${PAD},fps=60,format=yuv420p,setsar=1`, ...enc]);
  } else if (s.kind === 'mg' || s.kind === 'st') {
    ff([...(s.ss ? ['-ss', String(s.ss)] : []), '-t', String(s.t), '-i', s.src,
      '-vf', 'fps=60,format=yuv420p,setsar=1', ...enc]);
  } else if (s.kind === 'still') {
    const N = Math.round(s.t * 60);
    ff(['-loop', '1', '-framerate', '60', '-t', String(s.t), '-i', s.src,
      '-vf', `zoompan=z='${s.z0}+(${s.z1}-${s.z0})*on/${N}':x='iw*${s.cx}-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':d=1:s=1920x1080:fps=60,format=yuv420p,setsar=1`,
      '-t', String(s.t), ...enc]);
  }
  pieces.push(out);
  console.log('shot', i, s.kind, s.t + 's');
});

writeFileSync(`${TMP}/concat.txt`, pieces.map(p => `file '${p.replace(TMP + '/', '')}'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/concat.txt`, '-c', 'copy', `${TMP}/take-d.video.mp4`]);

ff(['-i', `${TMP}/take-d.video.mp4`, '-i', `${D}/narration.mp3`,
  '-map', '0:v', '-map', '1:a', '-af', 'apad', '-shortest',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', `${TMP}/take-d.va.mp4`]);

mixStems(`${TMP}/take-d.va.mp4`, `${D}/score-bed.mp3`, [
  { path: 'output/takes/sfx/low-whoosh.mp3', atSec: 13.22 },
  { path: 'output/takes/sfx/key-click.mp3',  atSec: 27.74 },
  { path: 'output/takes/sfx/page-turn.mp3',  atSec: 45.62 },
  { path: 'output/takes/sfx/key-click.mp3',  atSec: 53.84 },
  { path: 'output/takes/sfx/page-turn.mp3',  atSec: 68.06 },
], `${TMP}/take-d.mix.mp4`, { musicVol: 0.34, sfxVol: 0.38 });

const p1 = spawnSync('ffmpeg', ['-y', '-i', `${TMP}/take-d.mix.mp4`, '-af',
  'loudnorm=I=-16.5:TP=-1.9:LRA=11:print_format=json', '-f', 'null', '/dev/null'], { encoding: 'utf8' });
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
ff(['-i', `${TMP}/take-d.mix.mp4`, '-af',
  `loudnorm=I=-16.5:TP=-1.9:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,alimiter=limit=0.84:level=false`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output/takes/take-d.mp4']);
ff(['-i', `${D}/take-d.srt`, 'output/takes/take-d.srt']);
ff(['-i', `${D}/take-d.srt`, 'output/takes/take-d.vtt']);
console.log('take-d.mp4 done; measured input', m.input_i, 'LUFS → -16.5 target');
