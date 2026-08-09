// Bundle A: blind-rank the VO candidates. Usage: node scripts/_bundle-a-vo-rank.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CAREER_ENV = join(homedir(), 'Documents', 'career-ops', '.env');
const KEY = process.env.GEMINI_API_KEY
  ?? (existsSync(CAREER_ENV) ? readFileSync(CAREER_ENV, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim() : undefined);

const takes = ['a-creative-dense', 'b-creative-dense-slow', 'c-natural-dense'];
const parts = [{ text: `You are a veteran voice director casting narration for an emotionally intense short film about a family restaurant's final night. You will hear ${takes.length} takes of the same monologue, labeled Take 1..${takes.length} in order. Judge ONLY the vocal performance.

For each take: one line on its character, plus scores 0-10 for dynamic range, emotional truth, pacing/breath, and artifacts (note timestamps of any synthetic tells).

Then: RANK the takes best to worst, name the WINNER, state whether the winner is BOOKABLE for a client-facing film (yes/no), and give the winner's single biggest weakness.` }];
for (const [i, t] of takes.entries()) {
  parts.push({ text: `Take ${i + 1}:` });
  parts.push({ inline_data: { mime_type: 'audio/mpeg', data: readFileSync(join(ROOT, 'input', `bundle-a-vo-${t}.mp3`)).toString('base64') } });
}
const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
  body: JSON.stringify({ contents: [{ parts }] }),
  signal: AbortSignal.timeout(300_000),
});
if (!r.ok) throw new Error(`gemini → ${r.status}: ${(await r.text()).slice(0, 300)}`);
const j = await r.json();
const out = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') ?? JSON.stringify(j).slice(0, 500);
writeFileSync(join(ROOT, 'input', 'bundle-a-vo-rank.md'), `Takes in order: ${takes.join(', ')}\n\n` + out);
console.log(out);
