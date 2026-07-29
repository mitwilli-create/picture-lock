// Take A: screen-recording-led site tour, cut to the narration beat map.
// Video from live-site Playwright captures; audio = narration + score bed +
// sparse SFX per the pipeline's mix doctrine; two-pass linear loudnorm to
// -16 LUFS / -1.5 dBTP.
// Usage: node scripts/_assemble-take-a.mjs
import { mixStems } from '../lib/ffmpeg.mjs';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';

const CAP = 'output/takes/capture';
const TMP = '.cache/takes-a';
const OUT = 'output/takes';
mkdirSync(TMP, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

// beat timeline (beats.json, b-roll pronunciation retake) → source cuts; 88.60s total
const CUTS = [
  { src: 'hero',          ss: 19.0, t: 3.60 },              // hero            0.00
  { src: 'index-tour',    ss: 19.5, t: 8.16 },              // case            3.60
  { src: 'broll-top',     ss: 17.5, t: 7.90 },              // flagship        11.76
  { src: 'broll-play',    ss: 18.5, t: 8.08 },              //   reel playing
  { src: 'broll-receipt', ss: 12.0, t: 14.50 },             // receipt         27.74
  { src: 'broll-receipt', ss: 24.4, t: 2.00, slow: 3.10 },  //   receipt hold (slowed)
  { src: 'work-hover',    ss: 15.6, t: 5.84 },              // standard        48.44
  { src: 'theater',       ss: 21.5, t: 4.00 },              //   theater open
  { src: 'systems',       ss: 2.6,  t: 10.04 },             // gates           58.28
  { src: 'voice-console', ss: 16.0, t: 6.78 },              // synthetic       68.32
  { src: 'for11',         ss: 4.4,  t: 7.00 },              // path            75.10
  { src: 'closer',        ss: 1.5,  t: 6.50 },              // closer          82.10 → 88.60
];

const pieces = [];
CUTS.forEach((c, i) => {
  const out = `${TMP}/a-${String(i).padStart(2, '0')}.mp4`;
  const vf = `${c.slow ? `setpts=PTS*${c.slow},` : ''}scale=1920:1080,fps=30,format=yuv420p,setsar=1`;
  ff(['-ss', String(c.ss), '-t', String(c.t), '-i', `${CAP}/${c.src}.webm`, '-vf', vf, '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out]);
  pieces.push(out);
  console.log('cut', i, c.src, c.t + 's');
});

writeFileSync(`${TMP}/concat.txt`, pieces.map(p => `file '${p.replace(TMP + '/', '')}'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/concat.txt`, '-c', 'copy', `${TMP}/take-a.video.mp4`]);

// narration on the video (pad silence to video end)
ff(['-i', `${TMP}/take-a.video.mp4`, '-i', `${OUT}/narration.mp3`,
  '-map', '0:v', '-map', '1:a', '-af', 'apad', '-shortest',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', `${TMP}/take-a.va.mp4`]);

// stems: bed ducked under voice, sparse SFX accents on beat cuts
mixStems(`${TMP}/take-a.va.mp4`, `${OUT}/score-bed.mp3`, [
  { path: `${OUT}/sfx/low-whoosh.mp3`, atSec: 11.76 },
  { path: `${OUT}/sfx/key-click.mp3`,  atSec: 27.74 },
  { path: `${OUT}/sfx/page-turn.mp3`,  atSec: 48.44 },
  { path: `${OUT}/sfx/key-click.mp3`,  atSec: 58.28 },
  { path: `${OUT}/sfx/page-turn.mp3`,  atSec: 75.10 },
], `${TMP}/take-a.mix.mp4`, { musicVol: 0.32, sfxVol: 0.4 });

// two-pass linear loudnorm to -16 LUFS / -1.5 dBTP (loudnorm prints JSON on stderr)
import { spawnSync } from 'child_process';
const p1 = spawnSync('ffmpeg', ['-y', '-i', `${TMP}/take-a.mix.mp4`, '-af',
  'loudnorm=I=-16:TP=-1.9:LRA=11:print_format=json', '-f', 'null', '/dev/null'], { encoding: 'utf8' });
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
// TP target -1.9 + limiter: AAC encode overshoots ~0.3 dB, this holds the -1.5 dBTP ceiling
ff(['-i', `${TMP}/take-a.mix.mp4`, '-af',
  `loudnorm=I=-16:TP=-1.9:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,alimiter=limit=0.84:level=false`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${OUT}/take-a.mp4`]);
ff(['-i', `${OUT}/walkthrough.srt`, `${OUT}/take-a.srt`]);
console.log('take-a.mp4 done; measured input', m.input_i, 'LUFS →', '-16 target');
