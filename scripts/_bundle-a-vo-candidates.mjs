// Bundle A: generate VO candidates with explicit v3 settings + denser tags,
// after the intake gate rejected the platform-default read as too commercial.
// Usage: node scripts/_bundle-a-vo-candidates.mjs
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
try { const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') }); } catch {}
const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw';

// Denser, grittier performance script: heavier tags, broken punctuation for
// weight, lowercase intimacy. Same words the scene doc records.
const TEXT_DENSE = `[whispers] Thirty one years ago... my mother opened this restaurant. Two pans. A folding table. And a recipe she refused... to write down. [sighs] I grew up in this kitchen. I learned to walk... on this floor. [laughs] I burned my first sauce right there... [crying] and she made me eat it anyway. Last month... the landlord called. And tonight... [voice breaking] tonight we serve the last plate. Every scratch on this counter... is a night we fed someone. Every chip. In every bowl. [angry] So no. We are NOT going quietly. We are going LOUD. One more service. Every burner lit. [softly] And when the last guest leaves... we turn off the lights the way she taught me. [whispers] One at a time.`;

const CANDIDATES = [
  { name: 'a-creative-dense', settings: { stability: 0.0, similarity_boost: 0.85 }, text: TEXT_DENSE },
  { name: 'b-creative-dense-slow', settings: { stability: 0.0, similarity_boost: 0.85, speed: 0.9 }, text: TEXT_DENSE },
  { name: 'c-natural-dense', settings: { stability: 0.5, similarity_boost: 0.85 }, text: TEXT_DENSE },
];

for (const c of CANDIDATES) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.XI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: 'eleven_v3', text: c.text, voice_settings: c.settings }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) { console.log(`candidate ${c.name} failed: ${res.status} ${(await res.text()).slice(0, 200)}`); continue; }
  const out = join(ROOT, 'input', `bundle-a-vo-${c.name}.mp3`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${c.name} → ${out}  est $${(c.text.length / 1000 * 0.10).toFixed(4)}`);
}
