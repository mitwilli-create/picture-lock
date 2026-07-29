// Take B: illustration-led, engraved motion. Built entirely from the site's own
// generated art (cinemagraph loops + illo stills with slow pushes), cut to the
// narration beat map. Bone linework / near-black ground / oxblood accent; no
// text in frame. Same mix doctrine + loudnorm as take A.
// Usage: node scripts/_assemble-take-b.mjs
import { mixStems } from '../lib/ffmpeg.mjs';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const SITE = `${process.env.HOME}/Documents/storytellermitch-site/assets`;
const CG = `${SITE}/cinemagraphs`;
const TMP = '.cache/takes-b';
const OUT = 'output/takes';
mkdirSync(TMP, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const GROUND = '0x181818'; // sampled from the loops' ground

// loop pieces: {loop, t} → stream_loop + scale/pad to 1920x1080
// still pieces: {still, t, z0, z1, cx} → zoompan slow push
const PIECES = [
  { loop: 'hero-machine-plate-loop',    t: 3.60 },              // hero      0.00
  { loop: 'band-signal-flow-b-hd',      t: 4.30 },              // case      3.60
  { loop: 'fill-ai-projects-b-hd',      t: 3.86 },
  { loop: 'illo-broll-machine-loop',    t: 5.30 },              // flagship  11.76
  { still: 'illo-broll-machine-hd.jpg', t: 5.30, z0: 1.35, z1: 1.45, cx: 0.5 },
  { loop: 'fill-work-loop',             t: 5.38 },
  { still: 'illo-broll-machine-hd.jpg', t: 7.00, z0: 1.50, z1: 1.75, cx: 0.62 }, // receipt 27.74
  { loop: 'fill-timeline-c-hd',         t: 7.00 },
  { loop: 'band-signal-flow-b-hd',      t: 6.70 },
  { loop: 'fill-storiesboard-loop',     t: 4.90 },              // standard  48.44
  { loop: 'illo-agent-fleet-c-hd',      t: 4.94 },
  { loop: 'illo-triage-agent-c-hd',     t: 5.00 },              // gates     58.28
  { loop: 'fill-ai-projects-hd',        t: 5.04 },
  { loop: 'illo-voice-os-c-hd',         t: 6.78 },              // synthetic 68.32
  { loop: 'fill-fit2-c-hd',             t: 7.00 },              // path      75.10
  { loop: 'fill-contact-loop',          t: 6.50 },              // closer    82.10 → 88.60
];

const FIT = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=${GROUND},fps=30,format=yuv420p,setsar=1`;

const pieces = [];
PIECES.forEach((p, i) => {
  const out = `${TMP}/b-${String(i).padStart(2, '0')}.mp4`;
  if (p.loop) {
    const src = `${CG}/${p.loop}.mp4`;
    if (!existsSync(src)) throw new Error('missing loop ' + src);
    ff(['-stream_loop', '4', '-i', src, '-t', String(p.t), '-vf', FIT, '-an',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out]);
  } else {
    const src = `${SITE}/stills/${p.still}`;
    const N = Math.round(p.t * 30);
    const vf = `zoompan=z='${p.z0}+(${p.z1}-${p.z0})*on/${N}'` +
      `:x='iw*${p.cx}-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':d=1:s=1920x1080:fps=30,format=yuv420p,setsar=1`;
    ff(['-loop', '1', '-framerate', '30', '-t', String(p.t), '-i', src, '-vf', vf, '-an',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-t', String(p.t), out]);
  }
  pieces.push(out);
  console.log('piece', i, p.loop || p.still, p.t + 's');
});

writeFileSync(`${TMP}/concat.txt`, pieces.map(p => `file '${p.replace(TMP + '/', '')}'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/concat.txt`, '-c', 'copy', `${TMP}/take-b.video.mp4`]);

ff(['-i', `${TMP}/take-b.video.mp4`, '-i', `${OUT}/narration.mp3`,
  '-map', '0:v', '-map', '1:a', '-af', 'apad', '-shortest',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', `${TMP}/take-b.va.mp4`]);

mixStems(`${TMP}/take-b.va.mp4`, `${OUT}/score-bed.mp3`, [
  { path: `${OUT}/sfx/page-turn.mp3`,  atSec: 11.76 },
  { path: `${OUT}/sfx/key-click.mp3`,  atSec: 27.74 },
  { path: `${OUT}/sfx/page-turn.mp3`,  atSec: 48.44 },
  { path: `${OUT}/sfx/key-click.mp3`,  atSec: 58.28 },
  { path: `${OUT}/sfx/low-whoosh.mp3`, atSec: 75.10 },
], `${TMP}/take-b.mix.mp4`, { musicVol: 0.32, sfxVol: 0.4 });

const p1 = spawnSync('ffmpeg', ['-y', '-i', `${TMP}/take-b.mix.mp4`, '-af',
  'loudnorm=I=-16:TP=-1.9:LRA=11:print_format=json', '-f', 'null', '/dev/null'], { encoding: 'utf8' });
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
// TP target -1.9 + limiter: AAC encode overshoots ~0.3 dB, this holds the -1.5 dBTP ceiling
ff(['-i', `${TMP}/take-b.mix.mp4`, '-af',
  `loudnorm=I=-16:TP=-1.9:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,alimiter=limit=0.84:level=false`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${OUT}/take-b.mp4`]);
ff(['-i', `${OUT}/walkthrough.srt`, `${OUT}/take-b.srt`]);
console.log('take-b.mp4 done; measured input', m.input_i, 'LUFS → -16 target');
