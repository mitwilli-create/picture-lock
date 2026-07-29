// Career-ops dashboard demo: narration + STT beats in one pass.
// Voice settings already persisted platform-side (v3-steady, 2026-07-12), so
// tts() inherits them; no settings/edit call needed.
// Usage: node --env-file=.env scripts/_careerops-narration.mjs
import { tts, stt } from '../lib/elevenlabs.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw'; // Mitchell retake 2026-07-12 IVC
const OUT = 'output/career-ops-demo';
mkdirSync(OUT, { recursive: true });

const script = readFileSync('input/career-ops-demo-script.md', 'utf8')
  .split('\n').filter(l => !l.startsWith('#')).join('\n').trim();
console.log(`script: ${script.length} chars`);

// 1. Narration, one call (continuous prosody). Idempotent: keep an existing take.
if (!existsSync(`${OUT}/narration.mp3`)) {
  const audio = await tts({ text: script, voiceId: VOICE_ID, modelId: 'eleven_multilingual_v2' });
  writeFileSync(`${OUT}/narration.mp3`, audio);
  console.log(`wrote ${OUT}/narration.mp3`);
}

// 2. STT → words + srt + 5-beat map. Idempotent on the words file too.
const res = existsSync(`${OUT}/narration-words.json`)
  ? JSON.parse(readFileSync(`${OUT}/narration-words.json`, 'utf8'))
  : await stt({ filePath: `${OUT}/narration.mp3` });
const words = res.words.filter(w => w.type === 'word');
writeFileSync(`${OUT}/narration-words.json`, JSON.stringify(res, null, 2) + '\n');
console.log(`stt: ${words.length} words, last ends ${words.at(-1).end.toFixed(2)}s`);

const cues = [];
let cur = [];
for (const w of words) {
  cur.push(w);
  const text = cur.map(x => x.text).join(' ');
  if ((/[.:,!?]$/.test(w.text) && text.length > 24) || text.length > 38 || cur.length >= 9) { cues.push(cur); cur = []; }
}
if (cur.length) cues.push(cur);
const ts = s => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  const ms = String(Math.round(s % 1 * 1000)).padStart(3, '0');
  return `${h}:${m}:${sec},${ms}`;
};
writeFileSync(`${OUT}/careerops.srt`, cues.map((c, i) =>
  `${i + 1}\n${ts(c[0].start)} --> ${ts(c.at(-1).end + 0.15)}\n${c.map(x => x.text).join(' ')}\n`).join('\n'));
console.log(`wrote ${OUT}/careerops.srt (${cues.length} cues)`);

// Beat anchors = the five paragraph openers of the script.
const ANCHORS = [
  { id: 'open',     phrase: 'This is career ops' },   // STT splits the hyphen
  { id: 'board',    phrase: 'This is the apply now board' },
  { id: 'observe',  phrase: "Here's the part that matters" },
  { id: 'incident', phrase: 'One story to make that concrete' },
  { id: 'close',    phrase: 'I built this to run my own search' },
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
beats[0].start = 0; // beat 1 owns the leading breath
beats.forEach((b, i) => { b.end = i + 1 < beats.length ? beats[i + 1].start : total; b.dur = +(b.end - b.start).toFixed(2); });
writeFileSync(`${OUT}/beats.json`, JSON.stringify({ total: +total.toFixed(2), beats }, null, 2) + '\n');
console.log('beats:', beats.map(b => `${b.id}@${b.start.toFixed(1)}s(${b.dur}s)`).join(' '));

// Spend log
const notesPath = `${OUT}/spend-log.json`;
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push({ when: '2026-07-14', what: 'career-ops demo narration (one call) + STT beats', chars: script.length, est_cost_usd: +(script.length / 1000 * 0.10 + total / 60 * 0.006).toFixed(4) });
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
