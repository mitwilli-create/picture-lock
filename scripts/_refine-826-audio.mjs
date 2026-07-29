// Round-1 punch-list audio refine for the $8.26 takes (2026-07-16, owner review).
// Re-derives narration-826x from the TREATED take (no new TTS/STT):
//  1. duck the false-start sibilant before "So look around" (both takes carry it;
//     verified 13-15kHz ZCR hiss isolated in the verdict->So gap)
//  2. re-apply pads with SEVEN entries: the six approved v12 anchors PLUS
//     +0.5s after "I'm Mitchell." (owner: half a beat, photo card needs to fill)
//  3. shift words JSON, normalize money/numeral display tokens
//  4. rebuild beats. Score beds are reused (video grows 0.5s into the fade tail).
// Usage: SET=826a node scripts/_refine-826-audio.mjs
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const SET = process.env.SET;
if (!/^826[ab]$/.test(SET ?? '')) throw new Error('SET must be 826a or 826b');
const OUT = 'output/takes/e2';
// duck regions in TREATED-take coords, measured this session (gap-scan + ZCR)
const DUCKS = { '826a': [[80.92, 81.10]], '826b': [[75.12, 75.25]] };

// ---- 1+2: duck + pads via python PCM surgery ----
const norm = t => t.toLowerCase().replace(/[^a-z' ]/g, '');
const wordsT = JSON.parse(readFileSync(`${OUT}/narration-words-t-${SET}.json`, 'utf8')).words.filter(w => w.type === 'word');
const flatT = wordsT.map(w => norm(w.text));
function findStartIn(wordList, flatList, phrase) {
  const target = norm(phrase).split(' ').filter(Boolean);
  for (let i = 0; i <= flatList.length - target.length; i++)
    if (target.every((t, j) => flatList[i + j] === t)) return wordList[i].start;
  return null;
}
const PAD_SPEC = [
  ['Take the flagship', 0.40],
  ["That's how", 0.35],
  ['And the same gates', 0.50],
  ['voice scoring', 0.30],
  ['Public dated zero', 0.40],
  ['So look around', 0.50],
  ["If you're hiring", 0.50], // round 1: hold on the photo after "I'm Mitchell."
];
const pads = PAD_SPEC.map(([phrase, gap]) => {
  const s = findStartIn(wordsT, flatT, phrase);
  if (s === null) throw new Error('pad anchor not found: ' + phrase);
  return [+(s - 0.08).toFixed(3), gap];
});
console.log('pads:', pads.map(([t, g]) => `${t}+${g}`).join(' '));
execFileSync('python3', ['scripts/_duck-and-pads-826.py',
  `${OUT}/narration-t-${SET}.mp3`, `${OUT}/narration-words-t-${SET}.json`,
  `${OUT}/narration-${SET}.mp3`, `${OUT}/narration-words-${SET}.json`,
  JSON.stringify(pads), JSON.stringify(DUCKS[SET])], { stdio: 'inherit' });

// ---- 3: normalize money + numeral display on the shifted words ----
const path = `${OUT}/narration-words-${SET}.json`;
const W = JSON.parse(readFileSync(path, 'utf8'));
const toks = W.words;
const strip = t => t.toLowerCase().replace(/[^a-z0-9-]/g, '');
function mergeSeq(pat, repl) {
  const idx = toks.map((w, i) => [w, i]).filter(([w]) => w.type === 'word').map(([, i]) => i);
  for (let k = 0; k <= idx.length - pat.length; k++) {
    const span = idx.slice(k, k + pat.length);
    if (!pat.every((p, j) => strip(toks[span[j]].text) === p)) continue;
    const last = toks[span.at(-1)];
    const trail = (last.text.match(/[.,!?]$/) ?? [''])[0];
    const m = { ...toks[span[0]], text: repl + trail, end: last.end };
    toks.splice(span[0], span.at(-1) - span[0] + 1, m);
    return true;
  }
  return false;
}
let money = 0;
if (mergeSeq(['eight', 'dollars', 'and', 'twenty-six', 'cents'], '$8.26')) money++;
if (mergeSeq(['eight', 'twenty-six'], '$8.26')) money++;
if (money !== 2) throw new Error(`expected 2 money merges, got ${money}`);
if (!mergeSeq(['fifty-three', 'second'], '53-second') && !mergeSeq(['fifty-three-second'], '53-second'))
  console.log('note: 53-second already numeral or absent');
if (!mergeSeq(['twelve-minute'], '12-minute')) console.log('note: 12-minute already numeral or absent');
writeFileSync(path, JSON.stringify(W, null, 2) + '\n');

// ---- 4: beats from the final words ----
const shifted = W.words.filter(w => w.type === 'word');
const flatS = shifted.map(w => norm(w.text));
const ANCHORS = [
  { id: 'hook',      phrase: 'The film on this' },
  { id: 'allin',     phrase: 'logged line for' },
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
console.log(`done: take ${SET} refined, total ${total.toFixed(2)}s`);
