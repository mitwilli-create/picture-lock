// Normalize spoken-money tokens to numeral display in a take's words JSON
// (2026-07-16, $8.26 re-render). ElevenLabs STT normalized "$14.20" itself on
// the shipped take but returned spelled-out words for this one; captions
// display numerals per the shipped convention and the handover spec.
// Merges: "eight dollars and twenty-six cents" -> "$8.26"
//         "eight twenty-six[.,]?"             -> "$8.26[.,]"
// Timing: merged token spans first.start -> last.end. Edits the file in place.
// Usage: SET=826a node scripts/_normalize-money-826.mjs
import { readFileSync, writeFileSync } from 'fs';

const SET = process.env.SET;
if (!/^826[ab]$/.test(SET ?? '')) throw new Error('SET must be 826a or 826b');
const path = `output/takes/e2/narration-words-${SET}.json`;
const W = JSON.parse(readFileSync(path, 'utf8'));
const toks = W.words;
const norm = t => t.toLowerCase().replace(/[^a-z-]/g, '');
const PATTERNS = [
  ['eight', 'dollars', 'and', 'twenty-six', 'cents'],
  ['eight', 'twenty-six'],
];
let merges = 0;
for (const pat of PATTERNS) {
  for (let i = 0; i < toks.length; i++) {
    const seq = [];
    let j = i;
    while (seq.length < pat.length && j < toks.length) {
      if (toks[j].type !== 'word') { j++; continue; }
      seq.push(j); j++;
    }
    if (seq.length < pat.length) continue;
    if (!pat.every((p, k) => norm(toks[seq[k]].text) === p)) continue;
    const last = toks[seq.at(-1)];
    const trailing = (last.text.match(/[.,!?]$/) ?? [''])[0];
    const merged = {
      ...toks[seq[0]],
      text: '$8.26' + trailing,
      start: toks[seq[0]].start,
      end: last.end,
    };
    // splice out the whole span (including spacing tokens inside it)
    toks.splice(seq[0], seq.at(-1) - seq[0] + 1, merged);
    merges++;
    i = seq[0];
  }
}
if (merges !== 2) throw new Error(`expected exactly 2 money merges, got ${merges} — inspect ${path}`);
writeFileSync(path, JSON.stringify(W, null, 2) + '\n');
console.log(`normalized ${merges} money mentions in ${path}`);
