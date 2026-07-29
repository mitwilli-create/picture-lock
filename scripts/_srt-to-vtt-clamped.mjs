// srt -> WEBVTT with cue ends clamped to the next cue's start (the PR #46
// fix: the pipeline srt carries +0.15s hold tails that can overlap the next
// cue; the site vtt clamps them — "29 cues, 0 overlaps").
// Usage: node scripts/_srt-to-vtt-clamped.mjs in.srt out.vtt
import { readFileSync, writeFileSync } from 'fs';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error('usage: _srt-to-vtt-clamped.mjs in.srt out.vtt');
const blocks = readFileSync(inPath, 'utf8').trim().split(/\n\s*\n/);
const toS = t => { const [h, m, rest] = t.split(':'); const [s, ms] = rest.split(','); return (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000; };
const toT = s => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0'), m = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
  const sec = String(Math.floor(s % 60)).padStart(2, '0'), ms = String(Math.round(s % 1 * 1000)).padStart(3, '0');
  return `${h}:${m}:${sec}.${ms}`;
};
const cues = blocks.map(b => {
  const lines = b.trim().split('\n');
  const [start, end] = lines[1].split(' --> ').map(toS);
  return { start, end, text: lines.slice(2).join('\n') };
});
let clamped = 0;
cues.forEach((c, i) => {
  if (i + 1 < cues.length && c.end > cues[i + 1].start) { c.end = cues[i + 1].start; clamped++; }
});
writeFileSync(outPath, 'WEBVTT\n\n' + cues.map(c => `${toT(c.start)} --> ${toT(c.end)}\n${c.text}\n`).join('\n'));
console.log(`${outPath}: ${cues.length} cues, ${clamped} clamped, 0 overlaps`);
