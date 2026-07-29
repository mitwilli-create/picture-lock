// One-off: transcribe the ES dub via ElevenLabs Speech-to-Text (scribe) to
// build Spanish reel captions, same route as the JA showcase pass.
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = '/Users/mitchellwilliams/Documents/broll-pipeline';
config({ path: join(ROOT, '.env') });
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));

const FILE = '/Users/mitchellwilliams/Documents/storytellermitch-site/assets/broll-short.es.mp4';
console.log('→ transcribing ES dub via scribe...');
const result = await el.stt({ filePath: FILE });
writeFileSync(join(ROOT, 'output/motion-groundwork/showcase/broll-short.es.stt.json'), JSON.stringify(result, null, 2));
console.log('LANG:', result.language_code, 'TEXT:', (result.text || '').slice(0, 300));
