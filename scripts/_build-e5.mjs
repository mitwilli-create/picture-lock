// Explainer v5: Mitchell's 2026-07-13 late notes on v4.
//  N1: repaced narration (breaths after "differently."/"newsroom."), ONE slow
//      zoom on the home page (second nav shot DELETED), wipeleft swipe into the
//      newsroom shot, newsroom held longer.
//  N2: claims scene redesigned in the engine (ledger hero + full-frame flip).
//  N3: projects recapture — steady scroll, push-in only on the held repos link.
//  N4: three-shot character cartoon (cartoon-v5/p1..p3) replaces the single
//      machine loop on the right half of steps.
// Inputs: narration-v12.mp3 / beats-v12.json / narration-words-v12.json /
// score-bed-v12.mp3. v4 stays untouched as picture-lock-explainer-v4.mp4.
// Usage: node scripts/_build-e5.mjs [--scenes-only|--assemble-only]
import { mixStems } from '../lib/ffmpeg.mjs';
import { execFileSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const WT = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec';
const { renderMograph } = await import(`${WT}/lib/mograph.mjs`);
const E = 'output/takes/e2';
const TMP = '.cache/takes-e5';
mkdirSync(`${E}/scenes3`, { recursive: true });
mkdirSync(TMP, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
function ffprobe(p) { return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' })); }

const B = JSON.parse(readFileSync(`${E}/beats-v12.json`, 'utf8'));
const at = id => B.beats.find(b => b.id === id).start;
const words = JSON.parse(readFileSync(`${E}/narration-words-v12.json`, 'utf8')).words.filter(w => w.type === 'word' && /[a-z0-9]/i.test(w.text));
const wordAt = (txt, after = 0) => words.find(w => w.start >= after && w.text.toLowerCase().replace(/[^a-z]/g, '') === txt)?.start ?? null;

const lead = 0.45;
const TAIL = 3.5;
const END = B.total + TAIL; // 92.11
const stepsFrom = at('flagship');
const nouns = ['narration', 'score', 'sound', 'shots', 'captions', 'dub']
  .map(n => wordAt(n, at('step2') - 0.5))
  .map(t => Math.max(0.2, +(t - stepsFrom - lead).toFixed(2)));
const nrWord = wordAt('newsroom', at('different')) ?? (at('different') + 2.6);
const MACHINE = `file://${process.env.HOME}/Documents/storytellermitch-site/assets/stills/illo-picture-lock-machine-hd.jpg`;
const PHOTO = `file://${process.env.HOME}/Documents/storytellermitch-site/assets/stills/mitchell-portrait-bw.jpg`;

const SCENES = [
  { scene: 'hook',    from: 0,             to: at('problem'), ev: { allin: at('allin') - lead, document: at('document') - lead } },
  { scene: 'problem', from: at('problem'), to: at('different'), ev: { word: at('word') - lead, reel: at('reel') - lead }, extra: { noPlate: true } },
  { scene: 'newsroom', from: at('source') - 0.4, to: at('public'), ev: { source: at('source') - lead, illo: at('illo') - lead } }, // claims canvas (v5 redesign)
  { scene: 'steps',   from: stepsFrom,     to: at('proof'), ev: { step1: at('step1') - lead - stepsFrom, step2: at('step2') - lead - stepsFrom, spanish: at('spanish') - 0.2 - stepsFrom, step3: at('step3') - lead - stepsFrom, nouns } },
  { scene: 'proof',   from: at('proof'),   to: at('voice'), ev: { gates: at('gates') - lead, flags: at('flags') - lead, g1: wordAt('voice', at('gates')), g2: wordAt('code', at('gates')), g3: wordAt('resolution', at('gates')) } },
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
const only = (process.env.E5_ONLY ?? '').split(',').filter(Boolean);
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
const GRADE = "curves=all='0/0 0.5/0.49 1/1',eq=saturation=0.9:contrast=1.04";
// problem: canvas ⊕ rolodex anim (lighten blend, both full-frame) — unchanged from v4
const rolodexTrim = 1.2, rolodexStretch = (SCENES[1].dur / (ffprobe(`${E}/anim/rolodex.mp4`) - rolodexTrim)).toFixed(4);
ff(['-ss', String(rolodexTrim), '-i', `${E}/anim/rolodex.mp4`, '-i', `${E}/scenes3/problem.mp4`,
  '-filter_complex', `[0:v]setpts=PTS*${rolodexStretch},fps=30,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=gbrp[a];[1:v]fps=30,format=gbrp[b];[a][b]blend=all_mode=lighten,format=yuv420p[v]`,
  '-map', '[v]', '-t', String(SCENES[1].dur), '-c:v', 'libx264', '-crf', '16', `${TMP}/problem-comp.mp4`]);

// N1: nav pair — ONE continuous slow zoom into home, wipeleft swipe into the
// newsroom shot (xfade re-encodes the pair as a single unit)
const navT = +((nrWord - 1.2) - at('different')).toFixed(2);          // zoom shot
const nrT = +((at('source') - 0.4) - (nrWord - 1.2)).toFixed(2);      // newsroom hold (longer via the vocal pad)
const XF = 0.25;
ff(['-ss', '2.0', '-i', `${E}/capture/home-hold-v6.webm`,
  '-vf', `fps=60,zoompan=z='min(1+on*0.0018,1.26)':x='iw/2-(iw/zoom)/2':y='ih*0.32-(ih/zoom)/2':d=1:s=1920x1080:fps=60,format=yuv420p`,
  '-t', String(navT + XF), '-an', '-c:v', 'libx264', '-crf', '16', `${TMP}/nav-zoom.mp4`]);
ff(['-ss', '0.8', '-i', `${E}/anim/newsroom.mp4`,
  '-vf', `${GRADE},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=60,format=yuv420p`,
  '-t', String(nrT), '-an', '-c:v', 'libx264', '-crf', '16', `${TMP}/nr-hold.mp4`]);
ff(['-i', `${TMP}/nav-zoom.mp4`, '-i', `${TMP}/nr-hold.mp4`,
  '-filter_complex', `[0:v][1:v]xfade=transition=wipeleft:duration=${XF}:offset=${navT},format=yuv420p[v]`,
  '-map', '[v]', '-t', String(navT + nrT), '-c:v', 'libx264', '-crf', '16', `${TMP}/nav-pair.mp4`]);

// N4: steps composite — 3-shot cartoon sequence on the right half.
// Panels are designed right-of-center; each gets its own crop window.
const s2rel = SCENES[3].ev.step2, s3rel = SCENES[3].ev.step3, stepsDur = SCENES[3].dur;
const esRel = +(SCENES[3].ev.spanish - 0.05).toFixed(2), ES_D = +(SCENES[3].ev.step3 - esRel + 0.3).toFixed(2);
await renderMograph({ template: 'explainer', seconds: ES_D,
  data: { scene: 'esbanner', dur: ES_D, ev: {}, machine: null, plate: null },
  outPath: `${E}/scenes3/esbanner.mp4`, log: m => process.stdout.write('\r' + m + '   ') });
console.log('\nscene esbanner', ES_D + 's');
const CART = `${E}/cartoon-v5`;
const d1 = ffprobe(`${CART}/p1-feed.mp4`), d2 = ffprobe(`${CART}/p2-generate.mp4`), d3 = ffprobe(`${CART}/p3-receipt.mp4`);
const seg1 = +s2rel.toFixed(2), seg2 = +(s3rel - s2rel).toFixed(2), seg3 = +(stepsDur - s3rel).toFixed(2);
const f1 = Math.min(1, d1 / seg1), pts2 = (seg2 / d2).toFixed(4), f3 = Math.min(1, d3 / seg3);
if (d1 < seg1 || d3 < seg3) console.log(`WARN cartoon shorter than segment: p1 ${d1}/${seg1} p3 ${d3}/${seg3}`);
ff(['-i', `${E}/scenes3/steps.mp4`, '-i', `${CART}/p1-feed.mp4`, '-i', `${CART}/p2-generate.mp4`, '-i', `${CART}/p3-receipt.mp4`,
  '-f', 'lavfi', '-t', '0.19', '-i', 'color=c=0x9A4C42:s=1920x1080:r=30',
  '-i', `${E}/scenes3/esbanner.mp4`,
  '-filter_complex',
  `[1:v]scale=-2:1080,crop=940:1080:850:0,fps=30,trim=duration=${seg1},setpts=PTS-STARTPTS[c1];` +
  `[2:v]scale=-2:1080,crop=940:1080:770:0,fps=30,setpts=PTS*${pts2},fps=30,trim=duration=${seg2},setpts=PTS-STARTPTS[c2];` +
  `[3:v]scale=-2:1080,crop=940:1080:940:0,fps=30,trim=duration=${seg3},setpts=PTS-STARTPTS[c3];` +
  `[c1][c2][c3]concat=n=3:v=1:a=0[cart];` +
  `[0:v]fps=30[cv];[cv][cart]overlay=x=980:y=0,drawbox=x=978:y=90:w=2:h=900:color=0x9A4C42@0.8:t=fill,format=yuv420p[v0];[v0][4:v]overlay=x='1920*min(t/0.18,1)':y=0:eof_action=pass[v1];` +
  `[5:v]tpad=start_duration=${esRel}:start_mode=add:color=black,fps=30,colorkey=0x000000:0.25:0.08[es];` +
  `[v1][es]overlay=eof_action=pass[v]`,
  '-map', '[v]', '-t', String(stepsDur), '-c:v', 'libx264', '-crf', '16', `${TMP}/steps-comp.mp4`]);

// voice: voicewave anim base ⊕ canvas overlays (lighten); then the I'm Mitchell
// photo card drops in ABOVE the blend (alphamerge so the b/w photo can't ghost)
const mRel = +(at('mitchell') - at('voice')).toFixed(2);
const mDur = +(at('path') - at('mitchell')).toFixed(2);
for (const mask of [false, true]) {
  await renderMograph({ template: 'explainer', seconds: mDur,
    data: { scene: 'mcard', dur: mDur, ev: {}, machine: null, plate: null, photo: PHOTO, mask },
    outPath: `${E}/scenes3/mcard${mask ? '-mask' : ''}.mp4`, log: m => process.stdout.write('\r' + m + '   ') });
}
console.log('\nscene mcard(+mask)', mDur + 's');
// SYNTHETIC: solid-black cell + white bold, composited ABOVE the lighten blend
// (a lighten-blended dark plate can't knock out the bright waveform) — Mitchell r5
const synRel = 1.2, SYN_D = +(mRel - synRel + 0.5).toFixed(2);
await renderMograph({ template: 'explainer', seconds: SYN_D,
  data: { scene: 'synbanner', dur: SYN_D, ev: {}, machine: null, plate: null },
  outPath: `${E}/scenes3/synbanner.mp4`, log: m => process.stdout.write('\r' + m + '   ') });
console.log('\nscene synbanner', SYN_D + 's');
ff(['-stream_loop', '2', '-i', `${E}/anim/voicewave.mp4`, '-i', `${E}/scenes3/voice.mp4`,
  '-f', 'lavfi', '-t', '0.19', '-i', 'color=c=0x9A4C42:s=1920x1080:r=30',
  '-i', `${E}/scenes3/mcard.mp4`, '-i', `${E}/scenes3/mcard-mask.mp4`, '-i', `${E}/scenes3/synbanner.mp4`,
  '-filter_complex', `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=gbrp[a];[1:v]fps=30,format=gbrp[b];[a][b]blend=all_mode=lighten,format=yuv420p[v0];[v0][2:v]overlay=x='1920*min(t/0.18,1)':y=0:eof_action=pass[v1];` +
  `[5:v]tpad=start_duration=${synRel}:start_mode=add:color=0x00b140,fps=30,colorkey=0x00b140:0.32:0.10[syn];[v1][syn]overlay=eof_action=pass[v2];` +
  `[3:v]tpad=start_duration=${mRel}:start_mode=add:color=black,fps=30[mc];` +
  `[4:v]tpad=start_duration=${mRel}:start_mode=add:color=black,fps=30,format=gray[mm];` +
  `[mc][mm]alphamerge[mca];[v2][mca]overlay=eof_action=pass[v]`,
  '-map', '[v]', '-t', String(SCENES[5].dur), '-c:v', 'libx264', '-crf', '16', `${TMP}/voice-comp.mp4`]);

// N3: projects (Mitchell :28) — eased NATIVE scroll across the featured cards,
// used 1:1 so it stays slow and smooth (no time-compression, no blend ghosting)
const pubDur = +(stepsFrom - at('public')).toFixed(2);
ff(['-ss', '1.55', '-t', String(pubDur), '-i', `${E}/capture/projects-v6c.webm`,
  '-vf', 'fps=60,scale=1920:1080,format=yuv420p', '-an', '-c:v', 'libx264', '-crf', '16', `${TMP}/projects-v5.mp4`]);

// ---- timeline ----
const pieces = [];
const push = (src, ss, t, opts = {}) => pieces.push({ src, ss, t: +t.toFixed(2), ...opts });
push(`${E}/scenes3/hook.mp4`, 0, SCENES[0].dur);
push(`${TMP}/problem-comp.mp4`, 0, SCENES[1].dur);
push(`${TMP}/nav-pair.mp4`, 0, +(navT + nrT).toFixed(2));   // N1: zoom + swipe + held newsroom
push(`${E}/scenes3/newsroom.mp4`, 0, SCENES[2].dur);        // N2: redesigned claims scene
push(`${TMP}/projects-v5.mp4`, 0, pubDur);                  // N3
push(`${TMP}/steps-comp.mp4`, 0, SCENES[3].dur);            // N4
push(`${E}/scenes3/proof.mp4`, 0, SCENES[4].dur);
push(`${TMP}/voice-comp.mp4`, 0, SCENES[5].dur, { fadeout: 0.2 });
push('output/takes/e2/hiring-v6/handshake.mp4', 2.0, 2.6, { fadein: 0.25 });
push(`${E}/scenes3/cta.mp4`, 2.6, SCENES[6].dur - 2.6);
console.log(`pieces: ${pieces.length}, total ${pieces.reduce((a, p) => a + p.t, 0).toFixed(2)} (expect ${END.toFixed(1)})`);

const enc = [];
pieces.forEach((p, i) => {
  const out = `${TMP}/x-${String(i).padStart(2, '0')}.mp4`;
  const fIn = p.fadein ? `,fade=t=in:st=0:d=${p.fadein}:color=black` : '';
  const fOut = p.fadeout ? `,fade=t=out:st=${(p.t - p.fadeout).toFixed(2)}:d=${p.fadeout}:color=black` : '';
  const vf = `${p.grade ? GRADE + ',' : ''}scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=60,format=yuv420p,setsar=1${fIn}${fOut}`;
  ff(['-ss', String(p.ss), '-t', String(p.t), '-i', p.src, '-vf', vf, '-an', '-t', String(p.t), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', out]);
  enc.push(out);
});
// gotcha 2: probe every encoded piece against the plan before trusting the cut
let planSum = 0, realSum = 0;
pieces.forEach((p, i) => { const d = ffprobe(enc[i]); planSum += p.t; realSum += d;
  const drift = Math.abs(d - p.t);
  console.log(`  x-${String(i).padStart(2, '0')} plan ${p.t.toFixed(2)} real ${d.toFixed(2)}${drift > 0.07 ? '  ⚠ DRIFT' : ''}`); });
console.log(`plan ${planSum.toFixed(2)} vs encoded ${realSum.toFixed(2)}`);

writeFileSync(`${TMP}/concat.txt`, enc.map(p => `file '${p.replace(TMP + '/', '')}'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/concat.txt`, '-c', 'copy', `${TMP}/video.mp4`]);

ff(['-i', `${TMP}/video.mp4`, '-i', `${E}/narration-v12.mp3`, '-map', '0:v', '-map', '1:a',
  '-af', 'apad', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', `${TMP}/va.mp4`]);

ff(['-i', `${E}/score-bed-v12.mp3`, '-af', 'dynaudnorm=f=700:g=21:m=6:p=0.6', '-c:a', 'libmp3lame', '-b:a', '192k', `${TMP}/bed-dyn.mp3`]);
const SFX = f => `output/takes/e/sfx/${f}`;
ff(['-i', SFX('walla-newsroom.mp3'), '-af', 'volume=-9dB,afade=t=in:st=0:d=0.4,afade=t=out:st=2.6:d=1.3', '-t', '3.9',
  '-c:a', 'libmp3lame', '-b:a', '192k', `${TMP}/walla-nr.mp3`]);
const sfxMap = [
  { path: `${TMP}/walla-nr.mp3`,  atSec: at('different') + navT - 0.15 },
  { path: SFX('synth-pad.mp3'), atSec: 0.02 },
  { path: SFX('scratch1.mp3'),  atSec: 0.15 },
  { path: SFX('tick-roll.mp3'), atSec: 0.65 },
  { path: SFX('printer.mp3'),   atSec: at('document') - 0.3 },
  { path: SFX('whoosh.mp3'),    atSec: at('problem') },
  { path: SFX('stamp.mp3'),     atSec: at('reel') + 0.75 },
  { path: SFX('whoosh.mp3'),    atSec: at('different') },
  { path: SFX('whoosh.mp3'),    atSec: at('different') + navT },     // the swipe into the newsroom
  { path: SFX('pop.mp3'),       atSec: at('source') + 0.3 },
  { path: SFX('whoosh.mp3'),    atSec: at('public') },
    { path: SFX('whoosh.mp3'),    atSec: stepsFrom },
  ...nouns.map(n => ({ path: SFX('pop.mp3'), atSec: +(stepsFrom + n + 0.45).toFixed(2) })),
  { path: SFX('pop-hi.mp3'),    atSec: at('spanish') },
  { path: SFX('tick-roll.mp3'), atSec: at('proof') },
  { path: SFX('stamp.mp3'),     atSec: at('gates') + 0.5 },
  { path: SFX('stamp-lo.mp3'),  atSec: at('gates') + 1.35 },
  { path: SFX('stamp-hi.mp3'),  atSec: at('gates') + 2.1 },
  { path: SFX('pop.mp3'),       atSec: at('flags') + 0.3 },
  { path: SFX('stamp.mp3'),     atSec: at('voice') + 2.5 },
  { path: SFX('stamp-lo.mp3'),  atSec: at('mitchell') + 0.42 },  // photo card lands
  { path: SFX('whoosh.mp3'),    atSec: at('path') },
  { path: SFX('pop-hi.mp3'),    atSec: at('path') + 3.4 },
  { path: SFX('printer-hi.mp3'), atSec: at('closer') + 0.4 },
  { path: SFX('stamp.mp3'),     atSec: at('findme') + 1.0 },
];
mixStems(`${TMP}/va.mp4`, `${TMP}/bed-dyn.mp3`, sfxMap, `${TMP}/mix.mp4`, { musicVol: 0.21, sfxVol: 0.3 });

const p1 = spawnSync('ffmpeg', ['-y', '-i', `${TMP}/mix.mp4`, '-af',
  'loudnorm=I=-16.5:TP=-1.9:LRA=11:print_format=json', '-f', 'null', '/dev/null'], { encoding: 'utf8' });
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
ff(['-i', `${TMP}/mix.mp4`, '-af',
  `loudnorm=I=-16.5:TP=-1.9:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,alimiter=limit=0.84:level=false`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output/takes/picture-lock-explainer.mp4']);

// captions from v5 words (fresh)
const cues = []; let cur = [];
for (const w of words) { cur.push(w);
  const text = cur.map(x => x.text).join(' ');
  if ((/[.:,!?]$/.test(w.text) && text.length > 24) || text.length > 38 || cur.length >= 9) { cues.push(cur); cur = []; } }
if (cur.length) cues.push(cur);
const ts = s => { const H = String(Math.floor(s / 3600)).padStart(2, '0'), M = String(Math.floor(s % 3600 / 60)).padStart(2, '0'),
  S = String(Math.floor(s % 60)).padStart(2, '0'), MS = String(Math.round(s % 1 * 1000)).padStart(3, '0'); return `${H}:${M}:${S},${MS}`; };
writeFileSync('output/takes/picture-lock-explainer.srt', cues.map((c, i) =>
  `${i + 1}\n${ts(c[0].start)} --> ${ts(c.at(-1).end + 0.15)}\n${c.map(x => x.text).join(' ')}\n`).join('\n'));
console.log('picture-lock-explainer.mp4 (v5-draft) done; input', m.input_i, '→ -16.5 LUFS');
