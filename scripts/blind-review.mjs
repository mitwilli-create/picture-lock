// Blind sound-mix review: Gemini 3.1 Pro (it can HEAR) reviews the cut with
// zero context about versions, changes, or that AI made it. The review board's
// missing sense, prototyped. Usage: node blind-review.mjs <video>
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, basename } from 'path';

const VIDEO = process.argv[2] ?? '/Users/mitchellwilliams/Documents/broll-pipeline/output/cover-v2a3.mp4';
const SP = '/Users/mitchellwilliams/Documents/broll-pipeline/output';
const env = readFileSync('/Users/mitchellwilliams/Documents/career-ops/.env', 'utf8');
const KEY = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error('GEMINI_API_KEY not found in career-ops/.env');

// small proxy, original audio untouched (the review is about the sound)
const proxy = join(SP, 'review-proxy.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VIDEO, '-vf', 'scale=-2:480', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', proxy]);
const b64 = readFileSync(proxy).toString('base64');
console.log(`proxy ${(b64.length / 1e6 * 0.75).toFixed(1)}MB → gemini-3.1-pro-preview`);

const PROMPT = `You are a veteran re-recording mixer and sound designer reviewing a 28-second vertical short film with narration. You have no other context and no stake in the piece. Review ONLY the soundtrack, harshly and honestly, as if for a paying client deciding whether to ship it.

Score each 0-10 with one-line justification:
1. MIX HIERARCHY: does the narration sit clearly on top, with music and natural sound supporting rather than competing?
2. MUSIC: is there an audible, well-placed score? does it serve the edit's energy?
3. NATURAL SOUND: does each shot sound like the real place and actions on screen?
4. SYNC: do impacts and actions land exactly with the picture? list any timestamped misses.
5. TRANSITIONS: do sounds mesh across cuts, or do tracks pop in and out?
6. ARTIFACTS: any pops, screeches, synthetic tells, or sounds that don't belong (list timestamps)?
7. LOUDNESS/POLISH: broadcast-ready levels and dynamics?

Then: OVERALL 0-10, ship/no-ship verdict, and the top 3 fixes in priority order with timestamps.`;

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
const outPath = join(SP, `blind-review-${basename(VIDEO, '.mp4')}.md`);
writeFileSync(outPath, `# Blind sound review: ${basename(VIDEO)} (gemini-3.1-pro-preview, ${new Date().toISOString().slice(0, 16)})\n\n${text}\n`);
console.log(text);
console.log(`\n✓ saved → ${outPath}`);
