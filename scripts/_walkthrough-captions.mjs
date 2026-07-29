// One-off: STT the walkthrough narration for word timestamps, emit the EN .srt
// (shared by all three takes) + beats.json (the cut map each treatment follows).
// Usage: node --env-file=.env scripts/_walkthrough-captions.mjs
import { stt } from '../lib/elevenlabs.mjs';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const OUT = 'output/takes';

const res = await stt({ filePath: `${OUT}/narration.mp3` });
const words = res.words.filter(w => w.type === 'word');
writeFileSync(`${OUT}/narration-words.json`, JSON.stringify(res, null, 2) + '\n');
console.log(`stt: ${words.length} words, last ends ${words.at(-1).end.toFixed(2)}s`);

// --- SRT: chunk words into caption cues (~7 words / <=42 chars per cue, break on punctuation)
const cues = [];
let cur = [];
for (const w of words) {
  cur.push(w);
  const text = cur.map(x => x.text).join(' ');
  const endsClause = /[.:,!?]$/.test(w.text);
  if ((endsClause && text.length > 24) || text.length > 38 || cur.length >= 9) {
    cues.push(cur); cur = [];
  }
}
if (cur.length) cues.push(cur);

const ts = s => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  const ms = String(Math.round(s % 1 * 1000)).padStart(3, '0');
  return `${h}:${m}:${sec},${ms}`;
};
const srt = cues.map((c, i) =>
  `${i + 1}\n${ts(c[0].start)} --> ${ts(c.at(-1).end + 0.15)}\n${c.map(x => x.text).join(' ')}\n`
).join('\n');
writeFileSync(`${OUT}/walkthrough.srt`, srt);
console.log(`wrote ${OUT}/walkthrough.srt (${cues.length} cues)`);

// --- Beat map: anchor phrases → start times (each treatment cuts on these)
const ANCHORS = [
  { id: 'hero',      phrase: "I'm Mitchell Williams" },
  { id: 'case',      phrase: 'Everything on it argues' },
  { id: 'flagship',  phrase: 'Start with the flagship' },
  { id: 'receipt',   phrase: 'The demo cut runs' },
  { id: 'standard',  phrase: 'The rest of the site' },
  { id: 'gates',     phrase: 'The gates that check' },
  { id: 'synthetic', phrase: 'And this narration is synthetic' },
  { id: 'path',      phrase: "If you're reviewing me" },
  { id: 'closer',    phrase: 'So look around' },
];
const norm = t => t.toLowerCase().replace(/[^a-z' ]/g, '');
const flat = words.map(w => norm(w.text));
function findStart(phrase) {
  const target = norm(phrase).split(' ').filter(Boolean);
  for (let i = 0; i <= flat.length - target.length; i++) {
    if (target.every((t, j) => flat[i + j] === t)) return words[i].start;
  }
  return null;
}
const total = words.at(-1).end;
const beats = ANCHORS.map(a => ({ ...a, start: findStart(a.phrase) }));
const missing = beats.filter(b => b.start === null);
if (missing.length) throw new Error('anchors not found: ' + missing.map(b => b.id).join(', '));
beats.forEach((b, i) => { b.end = i + 1 < beats.length ? beats[i + 1].start : total; b.dur = +(b.end - b.start).toFixed(2); });
writeFileSync(`${OUT}/beats.json`, JSON.stringify({ total: +total.toFixed(2), beats }, null, 2) + '\n');
console.log('beats:', beats.map(b => `${b.id}@${b.start.toFixed(1)}s(${b.dur}s)`).join(' '));

// Spend log
const notesPath = `${OUT}/spend-log.json`;
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push({ when: '2026-07-12', what: 'STT word timestamps (captions + beat map)', minutes: +(total / 60).toFixed(2), est_cost_usd: +(total / 60 * 0.006).toFixed(4) });
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
