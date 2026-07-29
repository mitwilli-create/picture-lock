// Take E audio: narration (v3 voice) → de-tinny treatment → 22-anchor beat map → bed.
// Usage: node --env-file=.env scripts/_take-e-audio.mjs
import { stt, music } from '../lib/elevenlabs.mjs';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw';
const SETTINGS = { stability: 0.42, similarity_boost: 0.85, style: 0.18, use_speaker_boost: true }; // v3 expressive per Mitchell: more character/charisma
const OUT = 'output/takes/e2';
mkdirSync(OUT, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

const script = readFileSync('input/walkthrough-script-e.md', 'utf8')
  .split('\n').filter(l => !l.startsWith('#')).join('\n').trim();
console.log(`script: ${script.length} chars`);

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
  method: 'POST',
  headers: { 'xi-api-key': process.env.XI_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: script, model_id: 'eleven_multilingual_v2', voice_settings: SETTINGS }),
  signal: AbortSignal.timeout(180_000),
});
if (!res.ok) throw new Error(`tts → ${res.status}: ${(await res.text()).slice(0, 300)}`);
writeFileSync(`${OUT}/narration-raw.mp3`, Buffer.from(await res.arrayBuffer()));

ff(['-i', `${OUT}/narration-raw.mp3`, '-af',
  'deesser=i=0.35:m=0.6:f=0.6,highshelf=f=7000:g=-4,equalizer=f=4800:t=q:w=1.4:g=-1.5,lowshelf=f=150:g=1.5,volume=-1dB,' +
  'silenceremove=stop_periods=-1:stop_threshold=-38dB:stop_duration=0.55:stop_silence=0.34',
  '-c:a', 'libmp3lame', '-b:a', '192k', `${OUT}/narration.mp3`]);
const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/narration.mp3`], { encoding: 'utf8' }));
console.log(`narration treated: ${dur.toFixed(2)}s`);

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
writeFileSync(`${OUT}/take-e.srt`, cues.map((c, i) =>
  `${i + 1}\n${ts(c[0].start)} --> ${ts(c.at(-1).end + 0.15)}\n${c.map(x => x.text).join(' ')}\n`).join('\n'));

const ANCHORS = [
  { id: 'hook',      phrase: 'The film on this' },
  { id: 'allin',     phrase: 'Start to finish' },
  { id: 'document',  phrase: 'And I can document' },
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

const bedMs = Math.round((dur + 3.5) * 1000);
const bedPrompt =
  'Bright driving documentary underscore with forward momentum: energetic pizzicato ' +
  'strings, light brushed percussion and hand claps, upbeat curious energy around 112 BPM, ' +
  'builds confidently through the middle, playful but professional, never noir or ' +
  'mysterious, space for a narrator on top. Ends on a decisive, satisfying closing sting.';
writeFileSync(`${OUT}/score-bed.mp3`, await music({ prompt: bedPrompt, lengthMs: bedMs }));
console.log(`bed: ${(bedMs / 1000).toFixed(1)}s`);

const notesPath = 'output/takes/spend-log.json';
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push(
  { when: '2026-07-12', what: 'take E narration (explainer rewrite)', chars: script.length, est_cost_usd: +(script.length / 1000 * 0.10).toFixed(4) },
  { when: '2026-07-12', what: 'take E STT beat map', est_cost_usd: +(total / 60 * 0.006).toFixed(4) },
  { when: '2026-07-12', what: 'take E score bed', est_cost_usd: +(bedMs / 60000 * 0.15).toFixed(4) },
);
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
console.log('done');
