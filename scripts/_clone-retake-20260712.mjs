// One-off: clone the 2026-07-12 voice retake as a NEW IVC (never overwrites the old clone),
// then render the same 2-sentence sample in 3 settings variants for Mitchell's ear check.
// Usage: node --env-file=.env scripts/_clone-retake-20260712.mjs
import { cloneVoice } from '../lib/elevenlabs.mjs';
import { writeFileSync, mkdirSync } from 'fs';

const SOURCE = 'input/voice-retake/derived/voice-retake-20260712-trimmed.mp3'; // 192k MP3: API caps uploads at 11MB
const OUT = 'output/voice-samples';
const NAME = 'Mitchell retake 2026-07-12 IVC';

const SAMPLE_TEXT =
  "Everything you're looking at came out of a pipeline I built in my living room. " +
  'Each stage logs what it spent, and the whole run lands under fifteen dollars.';

const VARIANTS = [
  { tag: 'v1-default',    stability: 0.50, similarity_boost: 0.75, style: 0.00 },
  { tag: 'v2-expressive', stability: 0.35, similarity_boost: 0.80, style: 0.15 },
  { tag: 'v3-steady',     stability: 0.65, similarity_boost: 0.85, style: 0.00 },
];

mkdirSync(OUT, { recursive: true });

console.log('Cloning', SOURCE, 'as', JSON.stringify(NAME), '...');
const clone = await cloneVoice({
  name: NAME,
  filePaths: [SOURCE],
  description: 'Retake recorded 2026-07-12 (S25 Ultra, raw). Trimmed derivative, background noise removal on. Replaces the flat clone for site narration pending ear check.',
  removeBackgroundNoise: true,
});
console.log('voice_id:', clone.voice_id);

const notes = {
  created: '2026-07-12',
  voice_id: clone.voice_id,
  voice_name: NAME,
  source: SOURCE,
  model_id: 'eleven_multilingual_v2',
  sample_text: SAMPLE_TEXT,
  samples: [],
  est_tts_cost_usd: 0,
};

for (const v of VARIANTS) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${clone.voice_id}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.XI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: SAMPLE_TEXT,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: v.stability,
        similarity_boost: v.similarity_boost,
        style: v.style,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`tts ${v.tag} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const file = `${OUT}/earcheck-${v.tag}.mp3`;
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const cost = SAMPLE_TEXT.length / 1000 * 0.10; // $0.10 / 1k chars
  notes.samples.push({ file, ...v, chars: SAMPLE_TEXT.length, est_cost_usd: +cost.toFixed(4) });
  notes.est_tts_cost_usd = +(notes.est_tts_cost_usd + cost).toFixed(4);
  console.log('wrote', file);
}

writeFileSync(`${OUT}/earcheck-notes.json`, JSON.stringify(notes, null, 2) + '\n');
console.log('notes →', `${OUT}/earcheck-notes.json`);
