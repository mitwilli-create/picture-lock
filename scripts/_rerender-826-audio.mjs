// $8.26 re-render audio (2026-07-16): one full narration take per invocation.
// Same chain as _take-e-audio.mjs (TTS v3-expressive -> de-tinny treatment ->
// STT words -> beat map -> score bed) PLUS the approved v12 comprehension pads
// re-anchored to the fresh take's word timings (via _apply-pads-826.py).
// Script source: input/walkthrough-script-e-826.md (owner-ruled wording, FINAL).
// Usage: SET=826a node --env-file=.env scripts/_rerender-826-audio.mjs
import { stt, music } from '../lib/elevenlabs.mjs';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';

const SET = process.env.SET;
if (!/^826[ab]$/.test(SET ?? '')) throw new Error('SET must be 826a or 826b');
const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw'; // Mitchell retake 2026-07-12 IVC (NOT .env XI_VOICE_ID)
const SETTINGS = { stability: 0.42, similarity_boost: 0.85, style: 0.18, use_speaker_boost: true }; // v3 expressive, matches shipped take
const OUT = 'output/takes/e2';
mkdirSync(OUT, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

const script = readFileSync('input/walkthrough-script-e-826.md', 'utf8')
  .split('\n').filter(l => !l.startsWith('#')).join('\n').trim();
console.log(`script: ${script.length} chars (take ${SET})`);

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
  method: 'POST',
  headers: { 'xi-api-key': process.env.XI_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: script, model_id: 'eleven_multilingual_v2', voice_settings: SETTINGS }),
  signal: AbortSignal.timeout(180_000),
});
if (!res.ok) throw new Error(`tts → ${res.status}: ${(await res.text()).slice(0, 300)}`);
writeFileSync(`${OUT}/narration-raw-${SET}.mp3`, Buffer.from(await res.arrayBuffer()));

ff(['-i', `${OUT}/narration-raw-${SET}.mp3`, '-af',
  'deesser=i=0.35:m=0.6:f=0.6,highshelf=f=7000:g=-4,equalizer=f=4800:t=q:w=1.4:g=-1.5,lowshelf=f=150:g=1.5,volume=-1dB,' +
  'silenceremove=stop_periods=-1:stop_threshold=-38dB:stop_duration=0.55:stop_silence=0.34',
  '-c:a', 'libmp3lame', '-b:a', '192k', `${OUT}/narration-t-${SET}.mp3`]);
const durT = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/narration-t-${SET}.mp3`], { encoding: 'utf8' }));
console.log(`narration treated: ${durT.toFixed(2)}s`);

const sttRes = await stt({ filePath: `${OUT}/narration-t-${SET}.mp3` });
const wordsT = sttRes.words.filter(w => w.type === 'word');
writeFileSync(`${OUT}/narration-words-t-${SET}.json`, JSON.stringify(sttRes, null, 2) + '\n');

// ---- comprehension pads (approved v12 values, re-anchored to this take) ----
const norm = t => t.toLowerCase().replace(/[^a-z' ]/g, '');
const flatT = wordsT.map(w => norm(w.text));
function findStartIn(wordList, flatList, phrase) {
  const target = norm(phrase).split(' ').filter(Boolean);
  for (let i = 0; i <= flatList.length - target.length; i++)
    if (target.every((t, j) => flatList[i + j] === t)) return wordList[i].start;
  return null;
}
const PAD_SPEC = [ // [anchor phrase, gap seconds] — before each phrase, per build_v12_audio.py
  ['Take the flagship', 0.40],
  ["That's how", 0.35],
  ['And the same gates', 0.50],
  ['voice scoring', 0.30],
  ['Public dated zero', 0.40],
  ['So look around', 0.50],
];
const pads = PAD_SPEC.map(([phrase, gap]) => {
  const s = findStartIn(wordsT, flatT, phrase);
  if (s === null) throw new Error('pad anchor not found: ' + phrase);
  return [+(s - 0.08).toFixed(3), gap]; // insert inside the gap just before the onset
});
console.log('pads:', pads.map(([t, g]) => `${t}+${g}`).join(' '));
execFileSync('python3', ['scripts/_apply-pads-826.py',
  `${OUT}/narration-t-${SET}.mp3`, `${OUT}/narration-words-t-${SET}.json`,
  `${OUT}/narration-${SET}.mp3`, `${OUT}/narration-words-${SET}.json`,
  JSON.stringify(pads)], { stdio: 'inherit' });
const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/narration-${SET}.mp3`], { encoding: 'utf8' }));
console.log(`narration padded: ${dur.toFixed(2)}s`);

// ---- beat map from the SHIFTED words ----
const shifted = JSON.parse(readFileSync(`${OUT}/narration-words-${SET}.json`, 'utf8')).words.filter(w => w.type === 'word');
const flatS = shifted.map(w => norm(w.text));
const ANCHORS = [
  { id: 'hook',      phrase: 'The film on this' },
  { id: 'allin',     phrase: 'logged line for' }, // was 'Start to finish' — dropped by the 2026-07-16 re-script; ev unused by the template
  { id: 'document',  phrase: 'and I can document' },
  { id: 'problem',   phrase: "Here's the problem" },
  { id: 'word',      phrase: 'you have to take' },
  { id: 'reel',      phrase: 'A nice reel' },
  { id: 'different', phrase: 'This site works differently' },
  { id: 'source',    phrase: 'Every claim links' },
  { id: 'illo',      phrase: 'Every illustration says' },
  { id: 'public',    phrase: 'And the systems that made' },
  { id: 'flagship',  phrase: 'Take the flagship' },
  { id: 'step1',     phrase: 'Step one' },
  { id: 'step2',     phrase: 'Step two' },
  { id: 'dub',       phrase: 'even a Spanish dub' },
  { id: 'spanish',   phrase: 'Incluso un doblaje' },
  { id: 'step3',     phrase: 'Step three' },
  { id: 'proof',     phrase: "That's how" },
  { id: 'gates',     phrase: 'And the same gates' },
  { id: 'flags',     phrase: 'Public dated zero' },
  { id: 'voice',     phrase: 'Even this voice' },
  { id: 'mitchell',  phrase: "I'm Mitchell" },
  { id: 'path',      phrase: "If you're hiring" },
  { id: 'closer',    phrase: 'So look around' },
  { id: 'findme',    phrase: "And when you're ready" },
];
const total = shifted.at(-1).end;
const beats = ANCHORS.map(a => ({ ...a, start: findStartIn(shifted, flatS, a.phrase) }));
const missing = beats.filter(b => b.start === null);
if (missing.length) throw new Error('anchors not found: ' + missing.map(b => b.id).join(', '));
beats.forEach((b, i) => { b.end = i + 1 < beats.length ? beats[i + 1].start : total; b.dur = +(b.end - b.start).toFixed(2); });
writeFileSync(`${OUT}/beats-${SET}.json`, JSON.stringify({ total: +total.toFixed(2), beats }, null, 2) + '\n');
console.log('beats:', beats.map(b => `${b.id}@${b.start.toFixed(1)}(${b.dur})`).join(' '));

// ---- score bed at padded narration + 3.5s (pipeline-native recipe) ----
const bedMs = Math.round((dur + 3.5) * 1000);
const bedPrompt =
  'Bright driving documentary underscore with forward momentum: energetic pizzicato ' +
  'strings, light brushed percussion and hand claps, upbeat curious energy around 112 BPM, ' +
  'builds confidently through the middle, playful but professional, never noir or ' +
  'mysterious, space for a narrator on top. Ends on a decisive, satisfying closing sting.';
writeFileSync(`${OUT}/score-bed-${SET}.mp3`, await music({ prompt: bedPrompt, lengthMs: bedMs }));
console.log(`bed: ${(bedMs / 1000).toFixed(1)}s`);

const notesPath = 'output/takes/spend-log.json';
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push(
  { when: '2026-07-16', what: `$8.26 re-render narration (take ${SET})`, chars: script.length, est_cost_usd: +(script.length / 1000 * 0.10).toFixed(4) },
  { when: '2026-07-16', what: `$8.26 re-render STT (take ${SET})`, est_cost_usd: +(total / 60 * 0.006).toFixed(4) },
  { when: '2026-07-16', what: `$8.26 re-render score bed (take ${SET})`, est_cost_usd: +(bedMs / 60000 * 0.15).toFixed(4) },
);
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
console.log(`done: take ${SET}`);
