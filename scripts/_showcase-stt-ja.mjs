// One-off: run the JA dub through ElevenLabs Speech-to-Text (scribe) for the
// showcase QA gate.
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = '/Users/mitchellwilliams/Documents/broll-pipeline';
config({ path: join(ROOT, '.env') });
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));

const FILE = join(ROOT, 'output/motion-groundwork/showcase/broll-short.ja.mp4');
console.log('→ transcribing JA dub via scribe...');
const result = await el.stt({ filePath: FILE });
writeFileSync(join(ROOT, 'output/motion-groundwork/showcase/broll-short.ja.stt.json'), JSON.stringify(result, null, 2));
console.log('TEXT:', result.text ?? JSON.stringify(result).slice(0, 500));
