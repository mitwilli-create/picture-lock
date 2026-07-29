// Explainer v2 hybrid build: engine scenes interleaved with REAL footage
// (demo-film excerpts on "shots", the actual Spanish dub with its own audio in
// a narration gap, the real /for-elevenlabs page before the CTA button, and
// four vérité doc shots when present). Driving bed, loudnorm -16.5.
// Usage: node scripts/_build-e2.mjs [--scenes-only|--assemble-only]
import { mixStems } from '../lib/ffmpeg.mjs';
import { execFileSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const WT = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec';
const { renderMograph } = await import(`${WT}/lib/mograph.mjs`);
const E = 'output/takes/e2';
const TMP = '.cache/takes-e2';
mkdirSync(`${E}/scenes`, { recursive: true });
mkdirSync(TMP, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

// UNGAPPED beats drive scene-render clocks; GAPPED beats drive the assembly timeline
const U = JSON.parse(readFileSync(`${E}/beats.json`, 'utf8'));
const G = JSON.parse(readFileSync(`${E}/beats-gapped.json`, 'utf8'));
const at = id => U.beats.find(b => b.id === id).start;   // ungapped
const gat = id => G.beats.find(b => b.id === id).start;  // gapped (post-insert)
const GAP = G.gap, GAP_AT = G.gap_at;
const words = JSON.parse(readFileSync(`${E}/narration-words.json`, 'utf8')).words.filter(w => w.type === 'word');
const wordAt = (txt, after) => words.find(w => w.start >= after && w.text.toLowerCase().replace(/[^a-z]/g, '') === txt)?.start ?? null;

const MACHINE = `file://${process.env.HOME}/Documents/storytellermitch-site/assets/stills/illo-picture-lock-machine-hd.jpg`;
const PL = `${process.cwd()}/output/takes/e2/../e/plates`;
const lead = 0.45;
const stepsFrom = at('flagship');
const nouns = ['voice', 'score', 'shots', 'captions', 'dub']
  .map(n => wordAt(n, at('step2') - 0.5))
  .map(t => Math.max(0.2, +(t - stepsFrom - lead).toFixed(2)));
const shotsWordU = wordAt('shots', at('step2') - 0.5); // ungapped abs, cutaway point

const TAIL = 3.2;
const END_U = U.total + TAIL;          // ungapped video end
const END_G = END_U + GAP;             // real timeline end

const SCENES = [
  { scene: 'hook',     from: 0,               to: at('problem'),  ev: { allin: at('allin') - lead, document: at('document') - lead } },
  { scene: 'problem',  from: at('problem'),   to: at('different'), ev: { word: at('word') - lead, reel: at('reel') - lead }, plate: `file://${PL}/portfolio-stack-c1.jpg` },
  { scene: 'newsroom', from: at('different'), to: at('public'),   ev: { source: at('source') - lead, illo: at('illo') - lead }, plate: `file://${PL}/newsroom-desk-c2.jpg` },
  { scene: 'pub',      from: at('public'),    to: at('flagship'), ev: {} },
  { scene: 'steps',    from: at('flagship'),  to: at('proof'),    ev: { step1: at('step1') - lead - stepsFrom, step2: at('step2') - lead - stepsFrom, step3: at('step3') - stepsFrom + 0.15, nouns } },
  { scene: 'proof',    from: at('proof'),     to: at('voice'),    ev: { gates: at('gates') - lead, flags: at('flags') - lead } },
  { scene: 'voice',    from: at('voice'),     to: at('path'),     ev: { mitchell: at('mitchell') - lead }, plate: `file://${PL}/voice-profile-c1.jpg`, photo: `file://${process.env.HOME}/Documents/storytellermitch-site/assets/stills/mitchell-portrait-bw.jpg` },
  { scene: 'cta',      from: at('path'),      to: END_U,          ev: { closer: at('closer') - lead } },
];
for (const s of SCENES) {
  s.dur = +(s.to - s.from).toFixed(2);
  for (const k of Object.keys(s.ev)) {
    if (Array.isArray(s.ev[k]) || s.scene === 'steps' && k !== 'nouns') continue;
    if (!Array.isArray(s.ev[k]) && s.scene !== 'steps') s.ev[k] = +(s.ev[k] - s.from).toFixed(2);
  }
}
console.log(SCENES.map(s => `${s.scene}:${s.dur}`).join(' '));

const mode = process.argv[2] || '';
const only = (process.env.E2_ONLY ?? '').split(',').filter(Boolean);
if (mode !== '--assemble-only') {
  for (const s of SCENES) {
    if (only.length && !only.includes(s.scene)) continue;
    await renderMograph({
      template: 'explainer', seconds: s.dur,
      data: { scene: s.scene, dur: s.dur, ev: s.ev, machine: MACHINE, plate: s.plate ?? null, photo: s.photo ?? null },
      outPath: `${E}/scenes/${s.scene}.mp4`,
      log: m => process.stdout.write('\r' + m + '   '),
    });
    console.log('\nscene', s.scene, s.dur + 's');
  }
}
if (mode === '--scenes-only') process.exit(0);

// ---- hybrid timeline ----
// piece = {src, ss, t, audio?}  (ss/t in the SOURCE file's clock)
const DOC = f => existsSync(`${E}/doc/${f}`) ? `${E}/doc/${f}` : null;
const stepsSrc = `${E}/scenes/steps.mp4`;
const shotsRel = +(shotsWordU - stepsFrom - 0.2).toFixed(2); // cutaway starts just before the word
const dubRel = +(GAP_AT - stepsFrom).toFixed(2);
const pieces = [];
const push = (src, ss, t, opts = {}) => pieces.push({ src, ss, t: +t.toFixed(2), ...opts });

push(`${E}/scenes/hook.mp4`, 0, SCENES[0].dur);
// doc shot: typing (covers first 2.4s of the problem beat if available)
const typing = DOC('typing.mp4');
if (typing) { push(typing, 1.2, 2.4, { grade: true }); push(`${E}/scenes/problem.mp4`, 2.4, SCENES[1].dur - 2.4); }
else push(`${E}/scenes/problem.mp4`, 0, SCENES[1].dur);
push(`${E}/scenes/newsroom.mp4`, 0, SCENES[2].dur);
push(`${E}/scenes/pub.mp4`, 0, SCENES[3].dur);
// steps: p1 → film cutaways → p2 → ES dub (timeline gap) → p3
push(stepsSrc, 0, shotsRel);
const p2t = +(dubRel - (shotsRel + 3.2)).toFixed(2);
if (p2t >= 0.3) { push(`${E}/insert-film-long.mp4`, 0, 3.2, { grade: true }); push(stepsSrc, shotsRel + 3.2, p2t); }
else push(`${E}/insert-film-long.mp4`, 0, +(3.2 + p2t).toFixed(2), { grade: true }); // film flows straight into the dub
push(`${E}/insert-esdub.mp4`, 0, GAP, { grade: true }); // its AUDIO rides in the narration gap (added to sfx map)
push(stepsSrc, dubRel, SCENES[4].dur - dubRel);
// proof with a doc-shot cutaway at the gates traveler if available
const reviewing = DOC('reviewing.mp4');
if (reviewing) {
  const g1 = +(at('gates') - at('proof') + 2.6).toFixed(2);
  push(`${E}/scenes/proof.mp4`, 0, g1);
  push(reviewing, 1.5, 2.0, { grade: true });
  push(`${E}/scenes/proof.mp4`, g1 + 2.0, SCENES[5].dur - g1 - 2.0);
} else push(`${E}/scenes/proof.mp4`, 0, SCENES[5].dur);
const listening = DOC('listening.mp4');
if (listening) { push(listening, 1.0, 2.2, { grade: true }); push(`${E}/scenes/voice.mp4`, 2.2, SCENES[6].dur - 2.2); }
else push(`${E}/scenes/voice.mp4`, 0, SCENES[6].dur);
// cta: real page capture, then the button scene (sliced past the capture)
push(`${E}/insert-pathpage.mp4`, 0, 2.6);
push(`${E}/scenes/cta.mp4`, 2.6, SCENES[7].dur - 2.6);

const total = pieces.reduce((a, p) => a + p.t, 0);
console.log(`pieces: ${pieces.length}, total ${total.toFixed(2)}s (expect ~${END_G.toFixed(1)})`);

const GRADE = "curves=all='0/0 0.5/0.49 1/1',eq=saturation=0.9:contrast=1.04"; // doc-footage unifying grade
const enc = [];
pieces.forEach((p, i) => {
  const out = `${TMP}/p-${String(i).padStart(2, '0')}.mp4`;
  const vf = `${p.grade ? GRADE + ',' : ''}scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=60,format=yuv420p,setsar=1`;
  ff(['-ss', String(p.ss), '-t', String(p.t), '-i', p.src, '-vf', vf, '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', out]);
  enc.push(out);
});
writeFileSync(`${TMP}/concat.txt`, enc.map(p => `file '${p.replace(TMP + '/', '')}'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/concat.txt`, '-c', 'copy', `${TMP}/video.mp4`]);

ff(['-i', `${TMP}/video.mp4`, '-i', `${E}/narration-gapped.mp3`,
  '-map', '0:v', '-map', '1:a', '-af', 'apad', '-shortest',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', `${TMP}/va.mp4`]);

// ES dub audio rides the gap; bed level-matched (dynaudnorm per Bundle-B lesson)
ff(['-i', `${E}/insert-esdub.mp4`, '-vn', '-af', 'volume=6dB', '-c:a', 'libmp3lame', '-b:a', '192k', `${TMP}/esdub-audio.mp3`]);
ff(['-i', `${E}/score-bed.mp3`, '-af', `dynaudnorm=f=700:g=21:m=6:p=0.6,volume=enable='between(t,${(GAP_AT - 0.2).toFixed(2)},${(GAP_AT + GAP + 0.25).toFixed(2)})':volume=0.04`, '-c:a', 'libmp3lame', '-b:a', '192k', `${TMP}/bed-dyn.mp3`]);
const SFX = f => `output/takes/e/sfx/${f}`;
const sfxMap = [
  { path: SFX('synth-pad.mp3'),  atSec: 0.02 },
  { path: SFX('scratch1.mp3'),   atSec: 0.15 },
  { path: SFX('tick-roll.mp3'),  atSec: 0.65 },
  { path: SFX('printer.mp3'),    atSec: gat('document') - 0.3 },
  { path: SFX('whoosh.mp3'),     atSec: gat('problem') },
  { path: SFX('stamp.mp3'),      atSec: gat('reel') + 0.75 },
  { path: SFX('whoosh.mp3'),     atSec: gat('different') },
  { path: SFX('scratch2.mp3'),   atSec: gat('different') + 0.3 },
  { path: SFX('pop.mp3'),        atSec: gat('source') + 0.3 },
  { path: SFX('scratch1.mp3'),   atSec: gat('illo') },
  { path: SFX('pop-lo.mp3'),     atSec: gat('public') + 0.3 },
  { path: SFX('stamp-lo.mp3'),   atSec: gat('public') + 1.3 },
  { path: SFX('whoosh.mp3'),     atSec: gat('flagship') },
  { path: SFX('slide.mp3'),      atSec: gat('step1') + 1.0 },
  ...nouns.map(n => ({ path: SFX('pop.mp3'), atSec: +(stepsFrom + n + 0.45).toFixed(2) })), // pre-gap zone: ungapped==gapped
  { path: `${TMP}/esdub-audio.mp3`, atSec: GAP_AT + 0.05 },
  { path: SFX('printer-lo.mp3'), atSec: gat('step3') + 1.2 },
  { path: SFX('tick-roll.mp3'),  atSec: gat('proof') },
  { path: SFX('scratch2.mp3'),   atSec: gat('gates') - 0.2 },
  { path: SFX('stamp.mp3'),      atSec: gat('gates') + 0.5 },
  { path: SFX('stamp-lo.mp3'),   atSec: gat('gates') + 1.35 },
  { path: SFX('stamp-hi.mp3'),   atSec: gat('gates') + 2.1 },
  { path: SFX('pop.mp3'),        atSec: gat('flags') + 0.3 },
  { path: SFX('glitch.mp3'),     atSec: gat('voice') + 0.05 },
  { path: SFX('stamp.mp3'),      atSec: gat('voice') + 2.7 },
  { path: SFX('whoosh.mp3'),     atSec: gat('path') },
  { path: SFX('pop-hi.mp3'),     atSec: gat('path') + 3.6 },  // button lands
  { path: SFX('printer-hi.mp3'), atSec: gat('closer') + 0.4 },
];
mixStems(`${TMP}/va.mp4`, `${TMP}/bed-dyn.mp3`, sfxMap, `${TMP}/mix.mp4`, { musicVol: 0.30, sfxVol: 0.3 });

const p1 = spawnSync('ffmpeg', ['-y', '-i', `${TMP}/mix.mp4`, '-af',
  'loudnorm=I=-16.5:TP=-1.9:LRA=11:print_format=json', '-f', 'null', '/dev/null'], { encoding: 'utf8' });
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
ff(['-i', `${TMP}/mix.mp4`, '-af',
  `loudnorm=I=-16.5:TP=-1.9:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,alimiter=limit=0.84:level=false`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output/takes/broll-pipeline-explainer-v2.mp4']);
// captions: shift srt after the gap
const srt = readFileSync(`${E}/take-e.srt`, 'utf8');
const shift = (h, mnt, sec, ms) => {
  let t = (+h) * 3600 + (+mnt) * 60 + (+sec) + (+ms) / 1000;
  if (t >= GAP_AT) t += GAP;
  const H = String(Math.floor(t / 3600)).padStart(2, '0'), M = String(Math.floor(t % 3600 / 60)).padStart(2, '0');
  const S = String(Math.floor(t % 60)).padStart(2, '0'), MS = String(Math.round(t % 1 * 1000)).padStart(3, '0');
  return `${H}:${M}:${S},${MS}`;
};
writeFileSync('output/takes/broll-pipeline-explainer-v2.srt',
  srt.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, (_, h, mnt, sec, ms) => shift(h, mnt, sec, ms)));
console.log('broll-pipeline-explainer-v2.mp4 done; input', m.input_i, 'LUFS → -16.5');
