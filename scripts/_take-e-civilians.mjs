// Take E civilian attention panel: four non-expert personas under adverse
// attention conditions watch the cut through the multimodal provider adapter
// and log, first-person, exactly when they drift, lose the thread, or get bored.
// The subscription-first text adapter then extracts
// the lessons: pacing, visuals, captivation (stimulation / metaphor / sound).
// Usage: node --env-file=.env scripts/_take-e-civilians.mjs <round> [video]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { homedir } from 'os';
import { callMultimodalText, callText } from '../lib/provider-failover.mjs';

const ROUND = process.argv[2] ?? '1';
const VIDEO = process.argv[3] ?? 'output/takes/take-e.mp4';
const OUT = `output/takes/e/civilians-round-${ROUND}`;
mkdirSync(OUT, { recursive: true });

const CAREER_ENV = `${homedir()}/Documents/career-ops/.env`;
const careerEnv = existsSync(CAREER_ENV) ? readFileSync(CAREER_ENV, 'utf8') : '';
for (const key of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY']) {
  if (!process.env[key]) {
    const value = careerEnv.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
    if (value) process.env[key] = value;
  }
}

const proxy = `${OUT}/proxy.mp4`;
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VIDEO, '-vf', 'scale=-2:480', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', proxy]);
const b64 = readFileSync(proxy).toString('base64');
console.log(`civilians round ${ROUND}: proxy ${(b64.length / 1e6 * 0.75).toFixed(1)}MB`);

const SETUP = `You will watch a 75-second video that appeared in your feed. You did not seek it out and owe it nothing. Stay COMPLETELY in character. Report honestly, first person, with timestamps: (1) the exact moments your attention drifted or you reached for your phone, and what triggered it; (2) any moment you stopped understanding what was going on; (3) any moment you got visually bored (nothing new happening) or overwhelmed; (4) anything that PULLED you back in and why; (5) whether you finished it, and if not, the timestamp where you would have actually swiped away; (6) if someone asked you tomorrow what the video was about and who made it, what would you say? Do not be polite. Do not review it like a critic; react to it like yourself.`;

const PERSONAS = [
  { id: 'adhd-okc', p: `You are a 19-year-old high school graduate from Oklahoma with severe ADHD. You are medicated, but it's 7pm and the medication has mostly worn off. You are scrolling on your phone half-watching TV.` },
  { id: 'mom-chi', p: `You are a single mother of two in Chicago, utterly exhausted after work; you're folding laundry, sirens keep passing outside the window, one kid keeps asking you questions. You watch videos in stolen 20-second fragments.` },
  { id: 'ceo-fin', p: `You are the CEO of a mid-size financial firm. You only pay real attention to things that touch money, margins, or costs. You consume business podcasts and videos constantly and 90% of it is repackaged stuff you already know, so your default reaction is "tell me something new or I'm gone."` },
  { id: 'bos-bar', p: `You are two blue-collar Boston construction workers having a beer in a loud dive bar after a brutal shift. One of you got the video texted by your cousin. You're watching it together on one phone, sound fighting the bar noise, half-riffing on it out loud to each other. Report as the two of you, in your own voices.` },
];

async function gemini(prompt) {
  const result = await callMultimodalText({
    content: [
      { type: 'video', source: { media_type: 'video/mp4', data: b64 } },
      { type: 'text', text: prompt },
    ],
    preferredProvider: 'google-api',
    maxTokens: 3000,
  });
  return result.text;
}

const reactions = await Promise.all(PERSONAS.map(async ({ id, p }) => {
  const text = await gemini(`${p}\n\n${SETUP}`);
  writeFileSync(`${OUT}/reaction-${id}.md`, text);
  console.log('reacted:', id);
  return { id, text };
}));

const lessons = (await callText({
  system: `You are an audience-research analyst. Four civilian viewers under adverse attention conditions just logged their honest reactions to a 75s explainer. Extract the LESSONS, not a summary: (1) PACING — where does real-world attention actually break, and what does that say about beat lengths and information density; (2) VISUALS — what held eyes, what read as wallpaper, what was illegible or too subtle for a phone in a loud room; (3) CAPTIVATION — which mechanisms worked on which viewer (visual stimulation, metaphor/analogy, sound design, stakes/money, humor) and which were absent; (4) the RETENTION CURVE — reconstruct the approximate second-by-second drop-off across the four viewers; (5) TOP 8 CONCRETE CHANGES ranked by how many viewers they would rescue, each with timestamp and implementation. Be blunt.`,
  content: reactions.map(x => `## ${x.id}\n${x.text}`).join('\n\n---\n\n'),
  maxTokens: 5000,
})).text;
writeFileSync(`${OUT}/lessons.md`, lessons);
console.log('lessons →', `${OUT}/lessons.md`);

const notesPath = 'output/takes/spend-log.json';
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push({ when: '2026-07-12', what: `take E civilian attention panel round ${ROUND}`, est_cost_usd: 0.35 });
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
