// One-off: dub broll-short.mp4 into Japanese via ElevenLabs Dubbing API,
// then fetch JA transcript (webvtt + srt). Writes into broll-pipeline's
// showcase output dir. Run from anywhere: node dub-ja.mjs
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = '/Users/mitchellwilliams/Documents/broll-pipeline';
config({ path: join(ROOT, '.env') });

const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));

const SRC = '/Users/mitchellwilliams/Documents/storytellermitch-site/assets/broll-short.mp4';
const OUT_DIR = join(ROOT, 'output/motion-groundwork/showcase');
mkdirSync(OUT_DIR, { recursive: true });

function key() {
  const k = process.env.XI_API_KEY;
  if (!k) throw new Error('XI_API_KEY not set');
  return k;
}

async function getTranscript(dubbingId, lang, formatType) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/dubbing/${dubbingId}/transcript/${lang}?format_type=${formatType}`,
    { headers: { 'xi-api-key': key() } }
  );
  if (!res.ok) throw new Error(`transcript ${formatType} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.text();
}

console.log('→ creating dub job (en → ja)...');
const { dubbing_id, expected_duration_sec } = await el.dubCreate({ filePath: SRC, targetLang: 'ja', sourceLang: 'en' });
console.log(`  dubbing_id=${dubbing_id} expected~${expected_duration_sec}s`);

const deadline = Date.now() + 15 * 60 * 1000;
let status = '';
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10_000));
  const j = await el.dubStatus(dubbing_id);
  status = j.status;
  console.log(`  status=${status}`);
  if (status === 'dubbed') break;
  if (status === 'failed') throw new Error('dub job failed: ' + JSON.stringify(j).slice(0, 400));
}
if (status !== 'dubbed') throw new Error('dub polling timed out after 15 min');

console.log('→ downloading dubbed file...');
const buf = await el.dubDownload(dubbing_id, 'ja');
const outVideo = join(OUT_DIR, 'broll-short.ja.mp4');
writeFileSync(outVideo, buf);
console.log(`  wrote ${outVideo} (${buf.length} bytes)`);

console.log('→ fetching JA transcript (vtt + srt)...');
try {
  const vtt = await getTranscript(dubbing_id, 'ja', 'webvtt');
  writeFileSync(join(OUT_DIR, 'broll-short.ja.vtt'), vtt);
  console.log('  wrote broll-short.ja.vtt');
} catch (e) {
  console.error('  vtt fetch failed:', e.message);
}
try {
  const srt = await getTranscript(dubbing_id, 'ja', 'srt');
  writeFileSync(join(OUT_DIR, 'broll-short.ja.srt'), srt);
  console.log('  wrote broll-short.ja.srt');
} catch (e) {
  console.error('  srt fetch failed:', e.message);
}

console.log(JSON.stringify({ dubbing_id, expected_duration_sec }, null, 2));
