// Blind sound-mix review: the multimodal provider adapter (Gemini is the current
// video-capable route) reviews the cut with zero context about versions, changes,
// or that artificial intelligence made it. Usage: node blind-review.mjs <video>
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { callMultimodalText } from '../lib/provider-failover.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VIDEO = process.argv[2] ?? join(ROOT, 'output', 'cover.mp4');
const SP = join(ROOT, 'output');
const CAREER_ENV = join(homedir(), 'Documents', 'career-ops', '.env');
const careerEnv = existsSync(CAREER_ENV) ? readFileSync(CAREER_ENV, 'utf8') : '';
for (const key of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY']) {
  if (!process.env[key]) {
    const value = careerEnv.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
    if (value) process.env[key] = value;
  }
}

// small proxy, original audio untouched (the review is about the sound)
const proxy = join(SP, 'review-proxy.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VIDEO, '-vf', 'scale=-2:480', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', proxy]);
const b64 = readFileSync(proxy).toString('base64');
console.log(`proxy ${(b64.length / 1e6 * 0.75).toFixed(1)}MB → multimodal provider adapter`);

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

const result = await callMultimodalText({
  content: [
    { type: 'video', source: { media_type: 'video/mp4', data: b64 } },
    { type: 'text', text: PROMPT },
  ],
  preferredProvider: 'google-api',
  maxTokens: 4000,
});
const { text, provider, attempts } = result;
const outPath = join(SP, `blind-review-${basename(VIDEO, '.mp4')}.md`);
writeFileSync(outPath, `# Blind sound review: ${basename(VIDEO)}\n\n- provider: ${provider}\n- attempts: ${JSON.stringify(attempts)}\n- checked_at: ${new Date().toISOString().slice(0, 16)}\n\n${text}\n`);
console.log(text);
console.log(`\n✓ saved → ${outPath}`);
