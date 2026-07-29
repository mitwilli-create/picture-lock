// One-off: score bed + cut SFX for walkthrough takes A/B (take C's pipeline run
// scores itself). Sound doctrine: voice leads, diegetic second, score third.
// Usage: node --env-file=.env scripts/_walkthrough-score.mjs
import { music, soundEffect } from '../lib/elevenlabs.mjs';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

const OUT = 'output/takes';
mkdirSync(`${OUT}/sfx`, { recursive: true });

const NARRATION_S = 79.3;
const BED_MS = Math.round((NARRATION_S + 4) * 1000); // tail past the last line

const bedPrompt =
  'Restrained minimal documentary underscore for narration: quiet steady pulse like a ' +
  'newsroom wall clock, warm felt piano, low muted strings, subtle analog tape warmth. ' +
  'Understated and patient, low dynamics, no lead melody, leaves full space for a spoken ' +
  'voice. Ends with a soft unresolved settle.';

console.log(`music: ${BED_MS}ms ...`);
writeFileSync(`${OUT}/score-bed.mp3`, await music({ prompt: bedPrompt, lengthMs: BED_MS }));
console.log(`wrote ${OUT}/score-bed.mp3`);

const SFX = [
  { file: 'page-turn.mp3', text: 'single soft paper page turn, close mic, dry, no room', seconds: 1.2 },
  { file: 'key-click.mp3', text: 'one quiet mechanical typewriter key press, soft, dry', seconds: 0.6 },
  { file: 'low-whoosh.mp3', text: 'very soft low air whoosh transition, subtle, short', seconds: 1.0 },
];
for (const s of SFX) {
  writeFileSync(`${OUT}/sfx/${s.file}`, await soundEffect({ text: s.text, durationSeconds: s.seconds }));
  console.log('wrote', `${OUT}/sfx/${s.file}`);
}

const notesPath = `${OUT}/spend-log.json`;
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push(
  { when: '2026-07-12', what: 'score bed (Eleven Music v2, takes A+B)', minutes: +(BED_MS / 60000).toFixed(2), est_cost_usd: +(BED_MS / 60000 * 0.15).toFixed(4) },
  { when: '2026-07-12', what: 'cut SFX x3 (Sound Effects API)', seconds: SFX.reduce((a, s) => a + s.seconds, 0), est_cost_usd: +(SFX.reduce((a, s) => a + s.seconds, 0) / 60 * 0.12).toFixed(4) },
);
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
console.log('spend logged');
