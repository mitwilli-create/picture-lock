// Bundle A: blind cross-language emotion-preservation QC. The reviewer hears
// the EN master then a dubbed language, and scores whether each emotion beat's
// register survived. Usage: node scripts/_bundle-a-dub-qc.mjs <lang>
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CAREER_ENV = join(homedir(), 'Documents', 'career-ops', '.env');
const KEY = process.env.GEMINI_API_KEY
  ?? (existsSync(CAREER_ENV) ? readFileSync(CAREER_ENV, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim() : undefined);

const LANG = process.argv[2] ?? 'es';
const B = '/Users/mitchellwilliams/Documents/broll-pipeline/output/bundles/bundle-a';
const aud = (src, out) => { execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-c:a', 'libmp3lame', '-b:a', '96k', out]); return out; };
const en = aud(join(B, 'film', 'last-service.en.mp4'), join(ROOT, 'output', 'qc-en.mp3'));
const xx = aud(join(B, 'film', `last-service.${LANG}.mp4`), join(ROOT, 'output', `qc-${LANG}.mp3`));

const PROMPT = `You are a bilingual dubbing supervisor doing a blind QC pass. Recording A is the original narration in English; Recording B is a dubbed version of the same film in another language. You have no other context.

At these six timestamps, the original carries a specific emotional register:
1. 0:00-0:08 whispered, intimate
2. 0:14-0:20 a warm laugh caught mid-grief
3. 0:22-0:27 a voice break on a repeated word
4. 0:35-0:40 defiant crescendo
5. 0:41-0:43 clipped resolve
6. 0:44-0:49 falls back to a whisper

For each: does Recording B's corresponding moment carry the SAME register? Score each PRESERVED / PARTIAL / LOST with one line of evidence. Also note: does B sound like the same person as A? Is the pacing aligned within a second?

Then an OVERALL verdict: would a client accept B as an emotion-faithful dub of A? PASS / FAIL plus the single biggest gap.`;

const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
  body: JSON.stringify({ contents: [{ parts: [
    { text: PROMPT },
    { text: 'Recording A (original English):' },
    { inline_data: { mime_type: 'audio/mpeg', data: readFileSync(en).toString('base64') } },
    { text: 'Recording B (dub):' },
    { inline_data: { mime_type: 'audio/mpeg', data: readFileSync(xx).toString('base64') } },
  ] }] }),
  signal: AbortSignal.timeout(300_000),
});
if (!r.ok) throw new Error(`gemini → ${r.status}: ${(await r.text()).slice(0, 300)}`);
const j = await r.json();
const out = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') ?? JSON.stringify(j).slice(0, 500);
writeFileSync(join(B, 'receipts', `dub-qc-${LANG}.md`), `# Blind cross-language emotion QC: EN vs ${LANG.toUpperCase()}\n\n` + out);
console.log(out);
