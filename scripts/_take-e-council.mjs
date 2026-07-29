// Take E optimization council: 4 expert personas WATCH the actual cut (Gemini
// 3.1 Pro, multimodal), then debate each other's points (Opus), then an FDC
// ElevenLabs hiring-manager adjudicator compiles the exhaustive change list and
// rules whether the piece has hit its highest engagement likelihood.
// End-state bar: Vox Media / Kurzgesagt flow, cohesion, polish.
// Usage: node --env-file=.env scripts/_take-e-council.mjs <round-number> [video]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { homedir } from 'os';

const ROUND = process.argv[2] ?? '1';
const VIDEO = process.argv[3] ?? 'output/takes/take-e.mp4';
const OUT = `output/takes/e/council-round-${ROUND}`;
mkdirSync(OUT, { recursive: true });

const CAREER_ENV = `${homedir()}/Documents/career-ops/.env`;
const GEMINI = process.env.GEMINI_API_KEY
  ?? (existsSync(CAREER_ENV) ? readFileSync(CAREER_ENV, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim() : undefined);
const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
if (!GEMINI || !ANTHROPIC) throw new Error('need GEMINI_API_KEY and ANTHROPIC_API_KEY');

// video proxy for the watchers
const proxy = `${OUT}/proxy.mp4`;
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VIDEO, '-vf', 'scale=-2:480', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', proxy]);
const b64 = readFileSync(proxy).toString('base64');
console.log(`round ${ROUND}: proxy ${(b64.length / 1e6 * 0.75).toFixed(1)}MB`);

const CONTEXT = `This is a 78-second portfolio explainer ("How this site works") for thestorytellermitch.com, made by a candidate applying to ElevenLabs' Forward Deployed Creative role. Design system: engraved bone linework on near-black, single oxblood accent, mono type. The stated polish bar is Vox Media / Kurzgesagt: flow, cohesion, polish, and narration-visual coupling. Judge it against that bar, not against amateur work.`;

const PERSONAS = [
  { id: 'producer', p: `You are a veteran explainer-video PRODUCER (ex-Vox, ran daily video desks). Watch the piece. Review STRUCTURE, PACING, FLOW: hook strength, beat progression, dead air, narrative clarity, whether every second earns the next. List every specific issue with timestamps and a concrete fix for each. Be exhaustive and harsh; end with your top 5 changes ranked.` },
  { id: 'animator', p: `You are a senior MOTION DESIGNER / ANIMATOR (Kurzgesagt-level craft). Watch the piece. Review MOTION CRAFT: easing quality, draw-on feel, transitions between scenes, continuity of elements, composition balance, sync of motion to narration, visual monotony, polish gaps vs Kurzgesagt/Vox. List every specific issue with timestamps and a concrete fix. Be exhaustive and harsh; end with your top 5 changes ranked.` },
  { id: 'marketer', p: `You are a growth MARKETER specializing in video engagement and retention. Watch the piece. Review ENGAGEMENT: first-3-seconds hold, retention risks second by second, clarity of the value proposition, memorability, call-to-action strength, whether an ElevenLabs hiring manager would watch to the end and remember it. List every drop-off risk with timestamps and a concrete fix. Be exhaustive and harsh; end with your top 5 changes ranked.` },
  { id: 'composer', p: `You are a film COMPOSER and sound designer. Listen to the piece. Review MUSIC + SOUND: score arc vs narrative arc, whether music swells and resolves where the story does, foley taste and sync, mix hierarchy, sonic identity, emotional temperature. List every specific issue with timestamps and a concrete fix. Be exhaustive and harsh; end with your top 5 changes ranked.` },
];

async function gemini(prompt) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: 'video/mp4', data: b64 } }, { text: CONTEXT + '\n\n' + prompt }] }],
      generationConfig: { maxOutputTokens: 4000 },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) throw new Error(`gemini → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '(empty)';
}
async function opus(system, user, maxTokens = 6000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) throw new Error(`opus → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.content.map(c => c.text ?? '').join('');
}

// 1. persona watches (parallel)
const reviews = await Promise.all(PERSONAS.map(async ({ id, p }) => {
  const text = await gemini(p);
  writeFileSync(`${OUT}/review-${id}.md`, text);
  console.log('reviewed:', id);
  return { id, text };
}));

// 2. debate: personas challenge each other, converge
const debateInput = reviews.map(r => `## ${r.id.toUpperCase()}\n${r.text}`).join('\n\n---\n\n');
const debate = await opus(
  `You simulate a working-session debate between the four experts whose written reviews follow. Each persona must challenge at least one other persona's point (disagree with reasons), concede where the other is right, and hold non-negotiables. Then converge: produce the CONSENSUS CHANGE LIST the four of them agree on, deduplicated, each item with timestamp, the fix, and which personas backed it. Mark any unresolved disagreements explicitly.`,
  `Round ${ROUND} reviews of the 78s explainer:\n\n${debateInput}`,
);
writeFileSync(`${OUT}/debate-consensus.md`, debate);
console.log('debate done');

// 3. adjudicator: FDC ElevenLabs hiring manager
const verdict = await opus(
  `You are the HIRING MANAGER for ElevenLabs' Forward Deployed Creative role. You watch hundreds of portfolio videos. You are the final adjudicator. The polish bar is Vox Media / Kurzgesagt flow, cohesion, and polish. Rule on the consensus list: keep, cut, or modify each item; add anything the panel missed that matters to YOU as the person deciding whether to book this candidate. Output: (1) EXHAUSTIVE prioritized change list (P0 must-fix / P1 should / P2 polish), each with timestamp + concrete implementation; (2) ENGAGEMENT VERDICT: a 0-10 score for "will this leave an impression on me," and the single sentence you'd say to a colleague about it; (3) CONVERGED: YES if the piece is at its highest plausible engagement likelihood and further rounds would churn rather than improve, otherwise NO with what must change first.`,
  `Round ${ROUND}. Consensus from the four-expert debate:\n\n${debate}`,
);
writeFileSync(`${OUT}/adjudication.md`, verdict);
console.log('adjudication done →', `${OUT}/adjudication.md`);

const notesPath = 'output/takes/spend-log.json';
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push({ when: '2026-07-12', what: `take E optimization council round ${ROUND} (4 Gemini video reviews + Opus debate + Opus adjudication)`, est_cost_usd: 0.45 });
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
