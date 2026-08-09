// Bundle A: VOICE ENERGY AT INTAKE gate (Craft Law). Blind Gemini listen on
// the raw take BEFORE any visual spend. Usage: node scripts/_bundle-a-vo-intake.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CAREER_ENV = join(homedir(), 'Documents', 'career-ops', '.env');
const KEY = process.env.GEMINI_API_KEY
  ?? (existsSync(CAREER_ENV) ? readFileSync(CAREER_ENV, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim() : undefined);
if (!KEY) throw new Error('no GEMINI_API_KEY');

const b64 = readFileSync(join(ROOT, 'input', 'bundle-a-vo.mp3')).toString('base64');
const PROMPT = `You are a veteran voice director casting narration for an emotionally intense short film. You have no context about who made this or how. Listen to this take and judge ONLY the vocal performance, harshly, as if deciding whether to book the actor.

Score 0-10 each, one line of justification:
1. DYNAMIC RANGE: does the read move between registers (soft, warm, broken, defiant, whispered), or does it sit at one level?
2. EMOTIONAL TRUTH: do the emotional beats (grief, a laugh, resolve) land as felt, or performed/flat?
3. PACING & BREATH: are pauses and breaths expressive and natural?
4. ARTIFACTS: any synthetic tells, glitches, pronunciation errors (list timestamps)?

Then: OVERALL 0-10 and a BOOK / DO-NOT-BOOK verdict with the single biggest weakness.`;

const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
  body: JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'audio/mpeg', data: b64 } }] }],
  }),
  signal: AbortSignal.timeout(300_000),
});
if (!r.ok) throw new Error(`gemini → ${r.status}: ${(await r.text()).slice(0, 300)}`);
const j = await r.json();
const textOut = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') ?? JSON.stringify(j).slice(0, 500);
writeFileSync(join(ROOT, 'input', 'bundle-a-vo-intake-review.md'), textOut);
console.log(textOut);
