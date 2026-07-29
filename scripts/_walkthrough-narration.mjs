// One-off: persist Mitchell's ear-check pick (v3-steady) as the voice's platform
// default settings, then generate the full walkthrough narration with it.
// Usage: node --env-file=.env scripts/_walkthrough-narration.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw'; // Mitchell retake 2026-07-12 IVC
const SETTINGS = { stability: 0.65, similarity_boost: 0.85, style: 0.0, use_speaker_boost: true }; // v3-steady, Mitchell's pick 2026-07-12
const OUT = 'output/takes';
const KEY = process.env.XI_API_KEY;

// Script body = the gated draft minus the provenance header comments.
const script = readFileSync('input/walkthrough-script.md', 'utf8')
  .split('\n').filter(l => !l.startsWith('#')).join('\n').trim();
console.log(`script: ${script.length} chars`);

mkdirSync(OUT, { recursive: true });

// 1. Persist the pick as the voice's default settings (pipeline tts() then inherits it).
let res = await fetch(`https://api.elevenlabs.io/v1/voices/${VOICE_ID}/settings/edit`, {
  method: 'POST',
  headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(SETTINGS),
  signal: AbortSignal.timeout(60_000),
});
if (!res.ok) throw new Error(`settings/edit → ${res.status}: ${(await res.text()).slice(0, 300)}`);
console.log('voice default settings persisted:', JSON.stringify(SETTINGS));

// 2. Full narration, one call (keeps prosody continuous across paragraphs).
res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
  method: 'POST',
  headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: script, model_id: 'eleven_multilingual_v2', voice_settings: SETTINGS }),
  signal: AbortSignal.timeout(180_000),
});
if (!res.ok) throw new Error(`tts → ${res.status}: ${(await res.text()).slice(0, 300)}`);
writeFileSync(`${OUT}/narration.mp3`, Buffer.from(await res.arrayBuffer()));
console.log(`wrote ${OUT}/narration.mp3`);

// Spend log (running notes file for the takes).
const notesPath = `${OUT}/spend-log.json`;
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push({
  when: '2026-07-12',
  what: 'walkthrough narration (full script, one call)',
  voice_id: VOICE_ID,
  settings: SETTINGS,
  chars: script.length,
  est_cost_usd: +(script.length / 1000 * 0.10).toFixed(4),
});
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
console.log('spend logged →', notesPath);
