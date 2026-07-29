// One-off: render the voice-variety demo copy through 3 contrasting prebuilt
// ElevenLabs voices for the showcase.
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = '/Users/mitchellwilliams/Documents/broll-pipeline';
config({ path: join(ROOT, '.env') });
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));

const OUT_DIR = join(ROOT, 'output/motion-groundwork/showcase');
mkdirSync(OUT_DIR, { recursive: true });

const COPY = "Understand the pipeline. Prototype the replacement. Package it so it travels. Teach it. The short is proof of craft; the manifest and the template are proof I can hand it to a customer and have it still work after I leave.";

const VOICES = [
  { slug: 'daniel-broadcaster', name: 'Daniel - Steady Broadcaster', id: 'onwK4e9ZLuTAKqWW03F9' },
  { slug: 'jessica-bright', name: 'Jessica - Playful, Bright, Warm', id: 'cgSgspJ2msm6clMCkdW9' },
  { slug: 'charlie-aussie', name: 'Charlie - Deep, Confident, Energetic', id: 'IKne3meq5aSn9XLyUdCD' },
];

for (const v of VOICES) {
  console.log(`→ TTS: ${v.name} (${v.id})`);
  const buf = await el.tts({ text: COPY, voiceId: v.id });
  const rawPath = join(OUT_DIR, `variety-${v.slug}.raw.mp3`);
  writeFileSync(rawPath, buf);
  const finalPath = join(OUT_DIR, `variety-${v.slug}.mp3`);
  // ensure <=128k mp3 output regardless of API default bitrate
  execSync(`ffmpeg -y -i "${rawPath}" -codec:a libmp3lame -b:a 128k "${finalPath}"`, { stdio: 'inherit' });
  console.log(`  wrote ${finalPath} (${buf.length} raw bytes)`);
}

console.log(JSON.stringify({ chars: COPY.length, voices: VOICES }, null, 2));
