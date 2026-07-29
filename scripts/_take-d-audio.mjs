// Take D audio: narration (v3 voice) → de-tinny treatment → STT beat map → bed.
// Treatment per Mitchell's note (too tinny/sharp/trebly, a little loud):
// de-esser + high-shelf cut + gentle presence dip + small body shelf, -1 dB trim.
// Usage: node --env-file=.env scripts/_take-d-audio.mjs
import { stt } from '../lib/elevenlabs.mjs';
import { music } from '../lib/elevenlabs.mjs';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw';
const SETTINGS = { stability: 0.65, similarity_boost: 0.85, style: 0.0, use_speaker_boost: true };
const OUT = 'output/takes/d';
mkdirSync(OUT, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

const script = readFileSync('input/walkthrough-script-d.md', 'utf8')
  .split('\n').filter(l => !l.startsWith('#')).join('\n').trim();
console.log(`script: ${script.length} chars`);

// 1. narration
const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
  method: 'POST',
  headers: { 'xi-api-key': process.env.XI_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: script, model_id: 'eleven_multilingual_v2', voice_settings: SETTINGS }),
  signal: AbortSignal.timeout(180_000),
});
if (!res.ok) throw new Error(`tts → ${res.status}: ${(await res.text()).slice(0, 300)}`);
writeFileSync(`${OUT}/narration-raw.mp3`, Buffer.from(await res.arrayBuffer()));

// 2. treatment: tame sibilance + treble, add a little body, trim 1 dB
ff(['-i', `${OUT}/narration-raw.mp3`, '-af',
  'deesser=i=0.3:m=0.5:f=0.5,highshelf=f=7000:g=-4,equalizer=f=4800:t=q:w=1.4:g=-1.5,lowshelf=f=150:g=1.5,volume=-1dB',
  '-c:a', 'libmp3lame', '-b:a', '192k', `${OUT}/narration.mp3`]);
const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/narration.mp3`], { encoding: 'utf8' }));
console.log(`narration treated: ${dur.toFixed(2)}s`);

// 3. STT beat map + srt
const sttRes = await stt({ filePath: `${OUT}/narration.mp3` });
const words = sttRes.words.filter(w => w.type === 'word');
writeFileSync(`${OUT}/narration-words.json`, JSON.stringify(sttRes, null, 2) + '\n');

const cues = [];
let cur = [];
for (const w of words) {
  cur.push(w);
  const text = cur.map(x => x.text).join(' ');
  if ((/[.:,!?]$/.test(w.text) && text.length > 24) || text.length > 38 || cur.length >= 9) { cues.push(cur); cur = []; }
}
if (cur.length) cues.push(cur);
const ts = s => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0'), m = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
  const sec = String(Math.floor(s % 60)).padStart(2, '0'), ms = String(Math.round(s % 1 * 1000)).padStart(3, '0');
  return `${h}:${m}:${sec},${ms}`;
};
writeFileSync(`${OUT}/take-d.srt`, cues.map((c, i) =>
  `${i + 1}\n${ts(c[0].start)} --> ${ts(c.at(-1).end + 0.15)}\n${c.map(x => x.text).join(' ')}\n`).join('\n'));

const ANCHORS = [
  { id: 'hello',     phrase: "Hey I'm Mitchell" },
  { id: 'systems',   phrase: "Everything you're looking at" },
  { id: 'flagship',  phrase: 'Start with the flagship' },
  { id: 'handsback', phrase: 'and it hands you back' },
  { id: 'stack',     phrase: 'Narration score sound design' },
  { id: 'cost',      phrase: 'The demo cut runs' },
  { id: 'manifest',  phrase: 'And every generation call' },
  { id: 'receipt',   phrase: 'So when a production lead' },
  { id: 'standard',  phrase: 'The rest of the site' },
  { id: 'provenance', phrase: 'Every generated illustration' },
  { id: 'source',    phrase: 'Every claim links' },
  { id: 'gates',     phrase: 'And the gates that check' },
  { id: 'synthetic', phrase: 'Even this voice' },
  { id: 'path',      phrase: "And if you're reviewing me" },
  { id: 'closer',    phrase: 'So look around' },
];
const norm = t => t.toLowerCase().replace(/[^a-z' ]/g, '');
const flat = words.map(w => norm(w.text));
function findStart(phrase) {
  const target = norm(phrase).split(' ').filter(Boolean);
  for (let i = 0; i <= flat.length - target.length; i++)
    if (target.every((t, j) => flat[i + j] === t)) return words[i].start;
  return null;
}
const total = words.at(-1).end;
const beats = ANCHORS.map(a => ({ ...a, start: findStart(a.phrase) }));
const missing = beats.filter(b => b.start === null);
if (missing.length) throw new Error('anchors not found: ' + missing.map(b => b.id).join(', '));
beats.forEach((b, i) => { b.end = i + 1 < beats.length ? beats[i + 1].start : total; b.dur = +(b.end - b.start).toFixed(2); });
writeFileSync(`${OUT}/beats.json`, JSON.stringify({ total: +total.toFixed(2), beats }, null, 2) + '\n');
console.log('beats:', beats.map(b => `${b.id}@${b.start.toFixed(1)}(${b.dur})`).join(' '));

// 4. bed at narration + 3.5s
const bedMs = Math.round((dur + 3.5) * 1000);
const bedPrompt =
  'Restrained minimal documentary underscore for narration: quiet steady pulse like a ' +
  'newsroom wall clock, warm felt piano, low muted strings, subtle analog tape warmth, a ' +
  'gentle forward momentum. Understated, low dynamics, no lead melody, space for a spoken ' +
  'voice. Ends with a soft settle.';
writeFileSync(`${OUT}/score-bed.mp3`, await music({ prompt: bedPrompt, lengthMs: bedMs }));
console.log(`bed: ${(bedMs / 1000).toFixed(1)}s`);

const notesPath = 'output/takes/spend-log.json';
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push(
  { when: '2026-07-12', what: 'take D narration (conversational rewrite)', chars: script.length, est_cost_usd: +(script.length / 1000 * 0.10).toFixed(4) },
  { when: '2026-07-12', what: 'take D STT beat map', est_cost_usd: +(total / 60 * 0.006).toFixed(4) },
  { when: '2026-07-12', what: 'take D score bed', est_cost_usd: +(bedMs / 60000 * 0.15).toFixed(4) },
);
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
console.log('done');
