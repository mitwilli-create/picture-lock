// Explainer v4 (picture lock): restructured hybrid timeline per Mitchell's
// 2026-07-13 notes. Animated site illustrations (i2v) replace all static
// plates; real site captures for the tour/projects moments; the machine
// cartoon owns the right half through steps; Spanish spoken by the clone;
// third closer beat + sting. Usage: node scripts/_build-e3.mjs [--scenes-only|--assemble-only]
import { mixStems } from '../lib/ffmpeg.mjs';
import { execFileSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const WT = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec';
const { renderMograph } = await import(`${WT}/lib/mograph.mjs`);
const E = 'output/takes/e2';
const TMP = '.cache/takes-e3';
mkdirSync(`${E}/scenes3`, { recursive: true });
mkdirSync(TMP, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

const B = JSON.parse(readFileSync(`${E}/beats.json`, 'utf8'));
const at = id => B.beats.find(b => b.id === id).start;
const words = JSON.parse(readFileSync(`${E}/narration-words.json`, 'utf8')).words.filter(w => w.type === 'word');
const wordAt = (txt, after = 0) => words.find(w => w.start >= after && w.text.toLowerCase().replace(/[^a-z]/g, '') === txt)?.start ?? null;

const lead = 0.45;
const TAIL = 3.5;
const END = B.total + TAIL; // 85.2
const stepsFrom = at('flagship');
const nouns = ['voice', 'score', 'shots', 'captions', 'dub']
  .map(n => wordAt(n, at('step2') - 0.5))
  .map(t => Math.max(0.2, +(t - stepsFrom - lead).toFixed(2)));
const nrWord = wordAt('newsroom', at('different')) ?? (at('different') + 2.0);
const MACHINE = `file://${process.env.HOME}/Documents/storytellermitch-site/assets/stills/illo-picture-lock-machine-hd.jpg`;
const PHOTO = `file://${process.env.HOME}/Documents/storytellermitch-site/assets/stills/mitchell-portrait-bw.jpg`;
const PL = `${process.cwd()}/output/takes/e/plates`;

const SCENES = [
  { scene: 'hook',    from: 0,             to: at('problem'), ev: { allin: at('allin') - lead, document: at('document') - lead } },
  { scene: 'problem', from: at('problem'), to: at('different'), ev: { word: at('word') - lead, reel: at('reel') - lead }, extra: { noPlate: true } },
  { scene: 'newsroom', from: at('source') - 0.4, to: at('public'), ev: { source: at('source') - lead, illo: at('illo') - lead } }, // claims canvas
  { scene: 'steps',   from: stepsFrom,     to: at('proof'), ev: { step1: at('step1') - lead - stepsFrom, step2: at('step2') - lead - stepsFrom, spanish: at('spanish') - 0.2 - stepsFrom, step3: at('step3') - lead - stepsFrom, nouns } },
  { scene: 'proof',   from: at('proof'),   to: at('voice'), ev: { gates: at('gates') - lead, flags: at('flags') - lead } },
  { scene: 'voice',   from: at('voice'),   to: at('path'),  ev: { mitchell: at('mitchell') - lead }, extra: { photo: PHOTO } },
  { scene: 'cta',     from: at('path'),    to: END,         ev: { closer: at('closer') - lead, findme: at('findme') - lead } },
];
for (const s of SCENES) {
  s.dur = +(s.to - s.from).toFixed(2);
  for (const k of Object.keys(s.ev)) {
    if (Array.isArray(s.ev[k]) || s.scene === 'steps') continue;
    s.ev[k] = +(s.ev[k] - s.from).toFixed(2);
  }
}
console.log(SCENES.map(s => `${s.scene}:${s.dur}`).join(' '), '| nrWord', nrWord.toFixed(1));

const mode = process.argv[2] || '';
const only = (process.env.E3_ONLY ?? '').split(',').filter(Boolean);
if (mode !== '--assemble-only') {
  for (const s of SCENES) {
    if (only.length && !only.includes(s.scene)) continue;
    await renderMograph({
      template: 'explainer', seconds: s.dur,
      data: { scene: s.scene, dur: s.dur, ev: s.ev, machine: MACHINE, plate: null, ...(s.extra ?? {}) },
      outPath: `${E}/scenes3/${s.scene}.mp4`,
      log: m => process.stdout.write('\r' + m + '   '),
    });
    console.log('\nscene', s.scene, s.dur + 's');
  }
}
if (mode === '--scenes-only') process.exit(0);

// ---- composites ----
// problem: canvas ⊕ rolodex anim (lighten blend, both full-frame)
ff(['-stream_loop', '2', '-i', `${E}/anim/rolodex.mp4`, '-i', `${E}/scenes3/problem.mp4`,
  '-filter_complex', `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=gbrp[a];[1:v]fps=30,format=gbrp[b];[a][b]blend=all_mode=lighten,format=yuv420p[v]`,
  '-map', '[v]', '-t', String(SCENES[1].dur), '-c:v', 'libx264', '-crf', '16', `${TMP}/problem-comp.mp4`]);
// steps: canvas left ⊕ machine cartoon right half + divider
ff(['-i', `${E}/scenes3/steps.mp4`, '-stream_loop', '3', '-i', `${E}/anim/machine.mp4`,
  '-filter_complex', `[1:v]scale=-2:1080,crop=940:1080,fps=30,format=yuv420p[m];[0:v]fps=30[c];[c][m]overlay=x=980:y=0,drawbox=x=978:y=90:w=2:h=900:color=0x9A4C42@0.8:t=fill,format=yuv420p[v]`,
  '-map', '[v]', '-t', String(SCENES[3].dur), '-c:v', 'libx264', '-crf', '16', `${TMP}/steps-comp.mp4`]);
// voice: voicewave anim base ⊕ canvas overlays (lighten)
ff(['-stream_loop', '2', '-i', `${E}/anim/voicewave.mp4`, '-i', `${E}/scenes3/voice.mp4`,
  '-filter_complex', `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=gbrp[a];[1:v]fps=30,format=gbrp[b];[a][b]blend=all_mode=lighten,format=yuv420p[v]`,
  '-map', '[v]', '-t', String(SCENES[5].dur), '-c:v', 'libx264', '-crf', '16', `${TMP}/voice-comp.mp4`]);
// projects capture: scroll + repo-link push-in
const projDur = +(ffprobe(`${E}/capture/projects.webm`)).toFixed(2);
function ffprobe(p) { return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' })); }
const pubDur = +(stepsFrom - at('public')).toFixed(2);
ff(['-ss', String(Math.max(0, projDur - 4.2)), '-i', `${E}/capture/projects.webm`,
  '-vf', `fps=30,zoompan=z='if(lte(on,45),1,min(1+(on-45)*0.008,1.35))':x='iw/2-(iw/zoom)/2':y='ih*0.42-(ih/zoom)/2':d=1:s=1920x1080:fps=30,format=yuv420p`,
  '-t', String(pubDur), '-an', '-c:v', 'libx264', '-crf', '16', `${TMP}/projects-zoom.mp4`]);

// ---- timeline ----
const pieces = [];
const push = (src, ss, t, opts = {}) => pieces.push({ src, ss, t: +t.toFixed(2), ...opts });
push(`${E}/scenes3/hook.mp4`, 0, SCENES[0].dur);
push(`${TMP}/problem-comp.mp4`, 0, SCENES[1].dur);
// site nav: home push → for-elevenlabs, then busy newsroom on the word
const navEnd = +(nrWord - 1.2).toFixed(2);
const nav1 = +((navEnd - at('different')) * 0.55).toFixed(2);
const nav2 = +((navEnd - at('different')) - nav1).toFixed(2);
push(`${E}/capture/home-hold.webm`, 1.0, nav1, { zoom: true });
push('output/takes/d/capture/lin-for11.webm', 2.0, nav2);
push(`${E}/anim/newsroom.mp4`, 0.8, +(at('source') - 0.4 - navEnd).toFixed(2), { grade: true });
push(`${E}/scenes3/newsroom.mp4`, 0, SCENES[2].dur);
push(`${TMP}/projects-zoom.mp4`, 0, pubDur);
push(`${TMP}/steps-comp.mp4`, 0, SCENES[3].dur);
push(`${E}/scenes3/proof.mp4`, 0, SCENES[4].dur);
push(`${TMP}/voice-comp.mp4`, 0, SCENES[5].dur);
push(`${E}/insert-pathpage.mp4`, 0, 2.6);
push(`${E}/scenes3/cta.mp4`, 2.6, SCENES[6].dur - 2.6);
console.log(`pieces: ${pieces.length}, total ${pieces.reduce((a, p) => a + p.t, 0).toFixed(2)} (expect ${END.toFixed(1)})`);

const GRADE = "curves=all='0/0 0.5/0.49 1/1',eq=saturation=0.9:contrast=1.04";
const enc = [];
pieces.forEach((p, i) => {
  const out = `${TMP}/x-${String(i).padStart(2, '0')}.mp4`;
  const zoom = p.zoom ? `zoompan=z='min(1+on*0.0022,1.22)':x='iw/2-(iw/zoom)/2':y='ih*0.35-(ih/zoom)/2':d=1:s=1920x1080:fps=60,` : '';
  const vf = `${p.grade ? GRADE + ',' : ''}${zoom}scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=60,format=yuv420p,setsar=1`;
  ff(['-ss', String(p.ss), '-t', String(p.t), '-i', p.src, '-vf', vf, '-an', '-t', String(p.t), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', out]);
  enc.push(out);
});
writeFileSync(`${TMP}/concat.txt`, enc.map(p => `file '${p.replace(TMP + '/', '')}'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/concat.txt`, '-c', 'copy', `${TMP}/video.mp4`]);

ff(['-i', `${TMP}/video.mp4`, '-i', `${E}/narration.mp3`, '-map', '0:v', '-map', '1:a',
  '-af', 'apad', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', `${TMP}/va.mp4`]);

ff(['-i', `${E}/score-bed.mp3`, '-af', 'dynaudnorm=f=700:g=21:m=6:p=0.6', '-c:a', 'libmp3lame', '-b:a', '192k', `${TMP}/bed-dyn.mp3`]);
const SFX = f => `output/takes/e/sfx/${f}`;
const sfxMap = [
  { path: SFX('synth-pad.mp3'), atSec: 0.02 },
  { path: SFX('scratch1.mp3'),  atSec: 0.15 },
  { path: SFX('tick-roll.mp3'), atSec: 0.65 },
  { path: SFX('printer.mp3'),   atSec: at('document') - 0.3 },
  { path: SFX('whoosh.mp3'),    atSec: at('problem') },
  { path: SFX('slide.mp3'),     atSec: at('problem') + 0.5 },
  { path: SFX('stamp.mp3'),     atSec: at('reel') + 0.75 },
  { path: SFX('whoosh.mp3'),    atSec: at('different') },
  { path: SFX('whoosh.mp3'),    atSec: at('different') + nav1 },
  { path: SFX('pop.mp3'),       atSec: at('source') + 0.3 },
  { path: SFX('scratch1.mp3'),  atSec: at('illo') },
  { path: SFX('whoosh.mp3'),    atSec: at('public') },
  { path: SFX('pop-lo.mp3'),    atSec: at('public') + 1.6 },   // repo link push
  { path: SFX('whoosh.mp3'),    atSec: stepsFrom },
  { path: SFX('slide.mp3'),     atSec: at('step1') + 0.7 },
  ...nouns.map(n => ({ path: SFX('pop.mp3'), atSec: +(stepsFrom + n + 0.45).toFixed(2) })),
  { path: SFX('pop-hi.mp3'),    atSec: at('spanish') },
  { path: SFX('printer-lo.mp3'), atSec: at('step3') + 0.8 },
  { path: SFX('tick-roll.mp3'), atSec: at('proof') },
  { path: SFX('scratch2.mp3'),  atSec: at('gates') - 0.2 },
  { path: SFX('stamp.mp3'),     atSec: at('gates') + 0.5 },
  { path: SFX('stamp-lo.mp3'),  atSec: at('gates') + 1.35 },
  { path: SFX('stamp-hi.mp3'),  atSec: at('gates') + 2.1 },
  { path: SFX('pop.mp3'),       atSec: at('flags') + 0.3 },
  { path: SFX('glitch.mp3'),    atSec: at('voice') + 0.05 },
  { path: SFX('stamp.mp3'),     atSec: at('voice') + 2.5 },
  { path: SFX('whoosh.mp3'),    atSec: at('path') },
  { path: SFX('pop-hi.mp3'),    atSec: at('path') + 3.4 },
  { path: SFX('printer-hi.mp3'), atSec: at('closer') + 0.4 },
  { path: SFX('stamp.mp3'),     atSec: at('findme') + 1.0 },   // final button on the tag
];
mixStems(`${TMP}/va.mp4`, `${TMP}/bed-dyn.mp3`, sfxMap, `${TMP}/mix.mp4`, { musicVol: 0.30, sfxVol: 0.3 });

const p1 = spawnSync('ffmpeg', ['-y', '-i', `${TMP}/mix.mp4`, '-af',
  'loudnorm=I=-16.5:TP=-1.9:LRA=11:print_format=json', '-f', 'null', '/dev/null'], { encoding: 'utf8' });
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
ff(['-i', `${TMP}/mix.mp4`, '-af',
  `loudnorm=I=-16.5:TP=-1.9:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,alimiter=limit=0.84:level=false`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output/takes/picture-lock-explainer.mp4']);

// captions from words (fresh)
const cues = []; let cur = [];
for (const w of words) { cur.push(w);
  const text = cur.map(x => x.text).join(' ');
  if ((/[.:,!?]$/.test(w.text) && text.length > 24) || text.length > 38 || cur.length >= 9) { cues.push(cur); cur = []; } }
if (cur.length) cues.push(cur);
const ts = s => { const H = String(Math.floor(s / 3600)).padStart(2, '0'), M = String(Math.floor(s % 3600 / 60)).padStart(2, '0'),
  S = String(Math.floor(s % 60)).padStart(2, '0'), MS = String(Math.round(s % 1 * 1000)).padStart(3, '0'); return `${H}:${M}:${S},${MS}`; };
writeFileSync('output/takes/picture-lock-explainer.srt', cues.map((c, i) =>
  `${i + 1}\n${ts(c[0].start)} --> ${ts(c.at(-1).end + 0.15)}\n${c.map(x => x.text).join(' ')}\n`).join('\n'));
console.log('picture-lock-explainer.mp4 done; input', m.input_i, '→ -16.5 LUFS');
