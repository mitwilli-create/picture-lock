// Bundle B: blind multilingual voice-consistency review. The dealbreaker's
// standing caveat: voice-holding-across-languages is the load-bearing claim
// and no text-only council can hear it. Gemini watches the actual cut with
// zero context (not told the voice is cloned or the piece is AI-made) and
// judges it as a multilingual dubbing director would.
// Usage: node scripts/_bundle-b-voice-review.mjs <video> [label]
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VIDEO = process.argv[2];
if (!VIDEO || !existsSync(VIDEO)) throw new Error('usage: node scripts/_bundle-b-voice-review.mjs <video>');
const CAREER_ENV = join(homedir(), 'Documents', 'career-ops', '.env');
const KEY = process.env.GEMINI_API_KEY
  ?? (existsSync(CAREER_ENV) ? readFileSync(CAREER_ENV, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim() : undefined);
if (!KEY) throw new Error('set GEMINI_API_KEY (env, or GEMINI_API_KEY=... in ~/Documents/career-ops/.env)');

// small proxy, original audio untouched (the review is about the voice)
const proxy = join(ROOT, 'output', 'voice-review-proxy.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VIDEO, '-vf', 'scale=-2:480', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', proxy]);
const b64 = readFileSync(proxy).toString('base64');
console.log(`proxy ${(b64.length / 1e6 * 0.75).toFixed(1)}MB → gemini-3.1-pro-preview`);

const PROMPT = `You are a veteran multilingual dubbing and casting director. You speak Spanish, English, French, Portuguese, Italian, German, and Dutch professionally. You are reviewing a vertical brand video in which a narrator voices one or more languages. You have no other context and no stake in the piece. Review ONLY the voice work, harshly and honestly, as if a paying client must decide whether to ship it internationally.

Answer each, with one-line justification and timestamps where relevant:
1. SAME VOICE: across every language segment, does this sound like the SAME person? Score 0-10 and note any segment where the voice identity drifts (timbre, age, energy).
2. PER-LANGUAGE DELIVERY: for EACH language you hear, score 0-10 how close the delivery is to a native professional VO read (accent, vowel quality, rhythm, stress). List each language with its score.
3. EMOTIONAL CONSISTENCY: does the read keep the same brand register (warmth, pacing, intent) across languages, or do some segments go flat or robotic?
4. ARTIFACTS: any synthetic tells, glitches, unnatural breaths, chopped words, or pronunciation errors a native speaker would flinch at (timestamps)?
5. CAPTION MATCH: do the burned captions match what is actually spoken?

Then: OVERALL 0-10, a ship / no-ship verdict for international release, and the top 3 fixes in priority order with timestamps.`;

const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
  signal: AbortSignal.timeout(300_000),
  body: JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: 'video/mp4', data: b64 } }, { text: PROMPT }] }],
  }),
});
if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 400)}`);
const j = await r.json();
const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? JSON.stringify(j).slice(0, 500);
const outPath = join(ROOT, 'output', `voice-review-${basename(VIDEO, '.mp4')}.md`);
writeFileSync(outPath, `# Blind voice-consistency review: ${basename(VIDEO)} (gemini-3.1-pro-preview, ${new Date().toISOString().slice(0, 16)})\n\n${text}\n`);
console.log(text);
console.log(`\n✓ saved → ${outPath}`);
