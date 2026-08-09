// Bundle A: generate the "Last Service" monologue as ONE continuous take.
// eleven_v3 (performance tags) on Mitchell's active clone; falls back to
// multilingual v2 with tags stripped if v3 is not available to this key.
// Usage: node scripts/_bundle-a-vo.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
try { const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') }); } catch {}

const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw'; // Mitchell retake 2026-07-12 IVC
const scene = readFileSync(join(ROOT, 'input', 'bundle-a-scene.md'), 'utf8');
const text = scene.split('## The monologue (as sent to TTS, tags included)')[1]
  .split('## Why this scene')[0].trim();
console.log(`monologue: ${text.length} chars`);

async function tts(modelId, body) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.XI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: modelId, ...body }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`tts ${modelId} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

const out = join(ROOT, 'input', 'bundle-a-vo.mp3');
let model = 'eleven_v3';
let buf;
try {
  buf = await tts('eleven_v3', { text });
} catch (e) {
  console.log(`eleven_v3 failed (${e.message.slice(0, 120)}); falling back to multilingual v2, tags stripped`);
  model = 'eleven_multilingual_v2';
  buf = await tts(model, { text: text.replace(/\[[^\]]+\]\s*/g, '') });
}
writeFileSync(out, buf);
const cost = (text.length / 1000) * 0.10;
writeFileSync(join(ROOT, 'input', 'bundle-a-vo.json'), JSON.stringify({
  model, voiceId: VOICE_ID, chars: text.length, estCostUsd: +cost.toFixed(4),
  createdAt: new Date().toISOString(),
}, null, 2));
console.log(`✓ ${out}  model=${model}  est $${cost.toFixed(4)}`);
