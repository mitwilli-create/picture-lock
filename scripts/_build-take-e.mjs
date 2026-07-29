// Take E build: render the 9 explainer scenes through the worktree's landscape
// mograph engine, cut to the narration's 22-anchor beat map, then assemble,
// mix (treated voice, bed, sparse SFX), and loudnorm to -16.5 LUFS.
// Usage: node scripts/_build-take-e.mjs [--scenes-only|--assemble-only]
import { mixStems } from '../lib/ffmpeg.mjs';
import { execFileSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const WT = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec';
const { renderMograph } = await import(`${WT}/lib/mograph.mjs`);
const E = 'output/takes/e';
const TMP = '.cache/takes-e';
mkdirSync(`${E}/scenes`, { recursive: true });
mkdirSync(TMP, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

const { beats, total } = JSON.parse(readFileSync(`${E}/beats.json`, 'utf8'));
const at = id => beats.find(b => b.id === id).start;
const words = JSON.parse(readFileSync(`${E}/narration-words.json`, 'utf8')).words.filter(w => w.type === 'word');
const wordAt = (txt, after) => {
  const w = words.find(w => w.start >= after && w.text.toLowerCase().replace(/[^a-z]/g, '') === txt);
  return w ? w.start : null;
};

const MACHINE = `file://${process.env.HOME}/Documents/storytellermitch-site/assets/stills/illo-broll-machine-hd.jpg`;
const BED_S = 74.6;

// scene windows from the beat map; ev = scene-relative anchor offsets.
// Anticipatory sync: events fire 0.45s before their word so arrivals settle on it.
const lead = 0.45;
const s6start = at('step1');
const nouns = ['voice', 'score', 'shots', 'captions', 'dub']
  .map(n => wordAt(n, at('step2') - 0.5))
  .map(t => t === null ? null : Math.max(0.2, +(t - s6start - lead).toFixed(2)));
if (nouns.some(n => n === null)) throw new Error('noun sync words not all found');

const PL = `${process.cwd()}/output/takes/e/plates`;
const SCENES = [
  { scene: 'hook',     from: 0,              to: at('problem'),  ev: { clone: at('clone') - lead, facts: at('facts') - lead } },
  { scene: 'problem',  from: at('problem'),  to: at('different'), ev: { reel: at('reel') - lead }, plate: `file://${PL}/portfolio-stack-c1.jpg` },
  { scene: 'newsroom', from: at('different'), to: at('public'),  ev: { source: at('source') - lead, illo: at('illo') - lead }, plate: `file://${PL}/newsroom-desk-c2.jpg` },
  { scene: 'pub',      from: at('public'),   to: at('flagship'), ev: {} },
  { scene: 'flagship', from: at('flagship'), to: at('step1'),    ev: {} },
  { scene: 'steps',    from: at('step1'),    to: at('proof'),    ev: { step2: at('step2') - lead, step3: at('step3') - lead, nouns } },
  { scene: 'proof',    from: at('proof'),    to: at('voice'),    ev: { gates: at('gates') - lead, flags: at('flags') - lead } },
  { scene: 'voice',    from: at('voice'),    to: at('path'),     ev: { consent: at('consent') - lead, mitchell: at('mitchell') - lead }, plate: `file://${PL}/voice-profile-c1.jpg` },
  { scene: 'cta',      from: at('path'),     to: BED_S,          ev: { closer: at('closer') - lead } },
];
// make ev offsets scene-relative
for (const s of SCENES) {
  s.dur = +(s.to - s.from).toFixed(2);
  for (const k of Object.keys(s.ev)) {
    if (Array.isArray(s.ev[k])) continue; // nouns already relative
    s.ev[k] = +(s.ev[k] - s.from).toFixed(2);
  }
}
console.log(SCENES.map(s => `${s.scene}:${s.dur}s`).join(' '), '→', SCENES.reduce((a, s) => a + s.dur, 0).toFixed(1) + 's');

const mode = process.argv[2] || '';
const only = (process.env.TAKE_E_ONLY ?? '').split(',').filter(Boolean);
if (mode !== '--assemble-only') {
  for (const s of SCENES) {
    if (only.length && !only.includes(s.scene)) continue;
    await renderMograph({
      template: 'explainer',
      seconds: s.dur,
      data: { scene: s.scene, dur: s.dur, ev: s.ev, machine: MACHINE, plate: s.plate ?? null },
      outPath: `${E}/scenes/${s.scene}.mp4`,
      log: m => process.stdout.write('\r' + m + '    '),
    });
    console.log('\nscene', s.scene, s.dur + 's');
  }
}
if (mode === '--scenes-only') process.exit(0);

// assemble: hard cuts at scene seams (route-line carries continuity), 60fps out
const pieces = [];
SCENES.forEach((s, i) => {
  const out = `${TMP}/e-${String(i).padStart(2, '0')}.mp4`;
  ff(['-i', `${E}/scenes/${s.scene}.mp4`, '-vf', 'fps=60,format=yuv420p,setsar=1',
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', out]);
  pieces.push(out);
});
writeFileSync(`${TMP}/concat.txt`, pieces.map(p => `file '${p.replace(TMP + '/', '')}'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/concat.txt`, '-c', 'copy', `${TMP}/take-e.video.mp4`]);

ff(['-i', `${TMP}/take-e.video.mp4`, '-i', `${E}/narration.mp3`,
  '-map', '0:v', '-map', '1:a', '-af', 'apad', '-shortest',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', `${TMP}/take-e.va.mp4`]);

// event-synced sound design: every draw-on, counter, stamp, pop lands with its
// picture (Kurzgesagt-grade UI foley, restrained levels, voice stays on top)
const BED_RAW = process.env.TAKE_E_BED ?? `${E}/bed-a.mp3`;
// climax silence-drop: bed dips to near-zero for ~450ms as "That clone" lands
const BED = `${TMP}/bed-ducked.mp3`;
ff(['-i', BED_RAW, '-af', `volume=enable='between(t,${(at('voice') - 0.15).toFixed(2)},${(at('voice') + 0.35).toFixed(2)})':volume=0.06`, '-c:a', 'libmp3lame', '-b:a', '192k', BED]);
const SFX = f => `${E}/sfx/${f}`;
const s6 = at('step1');
const sfxMap = [
  { path: SFX('synth-pad.mp3'),  atSec: 0.02 },
  { path: SFX('scratch1.mp3'),  atSec: 0.15 },
  { path: SFX('tick-roll.mp3'), atSec: 0.65 },
  { path: SFX('pop.mp3'),       atSec: at('clone') - 0.2 },
  { path: SFX('printer.mp3'),   atSec: at('facts') - 0.2 },
  { path: SFX('whoosh.mp3'),    atSec: at('problem') },
  { path: SFX('slide.mp3'),     atSec: at('problem') + 0.5 },
  { path: SFX('scratch2.mp3'),  atSec: at('problem') + 0.58 },
  { path: SFX('stamp.mp3'),     atSec: at('reel') + 0.75 },
  { path: SFX('whoosh.mp3'),    atSec: at('different') },
  { path: SFX('scratch2.mp3'),  atSec: at('different') + 0.3 },
  { path: SFX('pop.mp3'),       atSec: at('source') + 0.3 },
  { path: SFX('scratch1.mp3'),  atSec: at('illo') },
  { path: SFX('pop-lo.mp3'),    atSec: at('public') + 0.3 },
  { path: SFX('stamp-lo.mp3'),  atSec: at('public') + 1.1 },
  { path: SFX('whoosh.mp3'),    atSec: at('flagship') },
  { path: SFX('slide.mp3'),     atSec: s6 + 1.4 },
  ...nouns.map(n => ({ path: SFX('pop.mp3'), atSec: s6 + n + 0.45 })),
  { path: SFX('printer-lo.mp3'), atSec: at('step3') + 1.0 },
  { path: SFX('tick-roll.mp3'), atSec: at('proof') },
  { path: SFX('scratch2.mp3'),  atSec: at('gates') - 0.2 },
  { path: SFX('stamp.mp3'),     atSec: at('gates') + 0.5 },
  { path: SFX('stamp-lo.mp3'),  atSec: at('gates') + 1.35 },
  { path: SFX('stamp-hi.mp3'),  atSec: at('gates') + 2.1 },
  { path: SFX('pop.mp3'),       atSec: at('flags') + 0.2 },
  { path: SFX('pop-lo.mp3'),    atSec: at('flags') + 0.5 },
  { path: SFX('pop-hi.mp3'),    atSec: at('flags') + 0.95 },
  { path: SFX('glitch.mp3'),    atSec: at('voice') + 0.05 },
  { path: SFX('scratch1.mp3'),  atSec: at('voice') + 1.8 },
  { path: SFX('stamp.mp3'),     atSec: at('consent') + 0.35 },
  { path: SFX('whoosh.mp3'),    atSec: at('path') },
  { path: SFX('clock.mp3'),     atSec: at('path') + 1.3 },
  { path: SFX('clock.mp3'),     atSec: at('path') + 2.3 },
  { path: SFX('printer-hi.mp3'), atSec: at('closer') + 0.4 },
];
mixStems(`${TMP}/take-e.va.mp4`, BED, sfxMap, `${TMP}/take-e.mix.mp4`, { musicVol: 0.34, sfxVol: 0.27 });

const p1 = spawnSync('ffmpeg', ['-y', '-i', `${TMP}/take-e.mix.mp4`, '-af',
  'loudnorm=I=-16.5:TP=-1.9:LRA=11:print_format=json', '-f', 'null', '/dev/null'], { encoding: 'utf8' });
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
ff(['-i', `${TMP}/take-e.mix.mp4`, '-af',
  `loudnorm=I=-16.5:TP=-1.9:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,alimiter=limit=0.84:level=false`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output/takes/take-e.mp4']);
ff(['-i', `${E}/take-e.srt`, 'output/takes/take-e.srt']);
ff(['-i', `${E}/take-e.srt`, 'output/takes/take-e.vtt']);
console.log('take-e.mp4 done; measured input', m.input_i, 'LUFS → -16.5 target');
