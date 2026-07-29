// Bundle B persona review: three specialist personas (video post-production,
// design, marketing) review the cut from frames + context; a master-director
// adjudicator carrying an ElevenLabs FDC hiring-manager persona synthesizes
// the verdict and suggests ElevenLabs-native leverage. Report lands in
// output/bundles/bundle-b/receipts/persona-review.md.
//
// Usage: node --env-file=.env scripts/_bundle-b-persona-review.mjs [video]
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VIDEO = process.argv[2] ?? join(ROOT, 'output/bundles/bundle-b/spot-es.mp4');
const OUT = join(ROOT, 'output/bundles/bundle-b/receipts');
const SCRATCH = join(ROOT, '.cache/bundle-b/persona-frames');
mkdirSync(SCRATCH, { recursive: true });
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CREATIVE_MODEL ?? 'claude-opus-4-8';
const IN_RATE = 15 / 1e6, OUT_RATE = 75 / 1e6;
let spend = 0;

async function call({ system, content, schema, maxTokens = 6000, _retry = true }) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, thinking: { type: 'adaptive' }, system,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`persona review → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const msg = await res.json();
  const cost = (msg.usage?.input_tokens ?? 0) * IN_RATE + (msg.usage?.output_tokens ?? 0) * OUT_RATE;
  spend += cost;
  if (msg.stop_reason === 'max_tokens') {
    if (!_retry) throw new Error('truncated twice');
    return call({ system, content, schema, maxTokens: maxTokens * 2, _retry: false });
  }
  return JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{}');
}

// 8 frames, evenly sampled
const dur = parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', VIDEO]).toString());
const frames = Array.from({ length: 8 }, (_, i) => {
  const t = ((i + 0.5) * dur) / 8;
  const p = join(SCRATCH, `f${i}.jpg`);
  run('ffmpeg', ['-y', '-v', 'error', '-ss', t.toFixed(2), '-i', VIDEO, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '6', p]);
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(p).toString('base64') }, t: t.toFixed(1) };
});

// audio measurements the personas cannot hear for themselves
const eb = spawnSync('ffmpeg', ['-i', VIDEO, '-af', 'ebur128', '-f', 'null', '/dev/null'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stderr ?? '';
const lufs = eb.match(/I:\s*(-?[\d.]+)\s*LUFS/g)?.pop() ?? 'unknown';

const CONTEXT = `THE PIECE: a 22-second vertical (9:16) spec ad for MERIDIEM, a FICTIONAL canned Spanish white wine ("born in Sevilla"). Spanish-language master; localized versions exist for EN, FR, PT, IT, DE with the same cloned narrator voice speaking each language and a market-specific music bed under identical visuals. There is also a French product-only cut shaped for Loi Evin constraints. The piece is a portfolio artifact for an ElevenLabs Forward Deployed Creative application: it anchors a regional GTM kit (Flows workflow templates, an AE playbook, a workshop kit) proving hyper-localized ad production as a repeatable workflow.

SCRIPT (ES master, one line per beat):
1. "El día no se acaba. Madura." (Sevilla rooftops, Giralda silhouette, golden hour)
2. "Meridiem. Vino blanco español, en lata." (product hero, can in azulejo bowl of ice)
3. "Frío, fresco, con la chispa justa." (pour into stemmed wine glass, Moorish arches bokeh)
4. "Hecho para brindar en la azotea," (rooftop friends toast, Giralda behind)
5. "y para las fotos que salen solas cuando la luz se vuelve generosa." (friends photographing each other)
6. "Meridiem. Disfruta la hora dorada." (end card, can + glass + tagline)

PRODUCTION FACTS: narration is an ElevenLabs Instant Voice Clone (eleven_multilingual_v2); visuals are Veo 3.1 Fast text-to-video plus nano-banana-2 stills animated for text-bearing shots; score is Eleven Music; sound effects and ambience are the ElevenLabs SFX API; mix is ffmpeg with a de-essed voice chain and linear loudness (master measured ${lufs}). Prior client notes already addressed: choppy stem edges, tinny narration treble, a two-can merge artifact, weak copy ("loud ice").

You are reviewing the eight evenly-sampled frames below (timestamps ${frames.map((f) => f.t + 's').join(', ')}) plus these facts. Audio cannot be heard from frames; judge audio only from the stated measurements and production facts, and say so where that limits you.`;

const PERSONAS = {
  'post-production': 'You are a senior video post-production supervisor and online editor for broadcast commercials (15 years: grade, conform, mix supervision, QC delivery). You judge edit rhythm, shot continuity, grade consistency, composite artifacts, caption/end-card execution, and deliverability. You flag anything a network QC pass would bounce. You are direct, specific, and you cite frame timestamps.',
  'design': 'You are a brand design director who has built identity systems for beverage brands. You judge the label system, typography, end-card lockup, color world, and whether the brand would survive a real shelf and a real media plan. You care that the can, the tagline, and the film feel like one designed object. You cite frame timestamps.',
  'marketing': 'You are an EU consumer-marketing strategist specializing in beverage launches across Iberia and Western Europe. You judge positioning clarity, cultural credibility of the Sevilla setting, whether the localization story would actually move product in PT/FR/IT/DE, category compliance realities (alcohol advertising rules per market), and thumb-stopping power in a 9:16 feed. You cite frame timestamps.',
};

const PERSONA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    strengths: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { at: { type: 'string' }, issue: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, fix: { type: 'string' } }, required: ['issue', 'severity', 'fix'] } },
    score10: { type: 'number' },
  },
  required: ['strengths', 'issues', 'score10'],
};

console.log(`personas reviewing ${basename(VIDEO)} (${dur.toFixed(1)}s, ${lufs})...`);
const content = [{ type: 'text', text: CONTEXT }, ...frames.map(({ type, source }) => ({ type, source }))];
const results = await Promise.all(Object.entries(PERSONAS).map(async ([k, sys]) => [k, await call({ system: sys, content, schema: PERSONA_SCHEMA })]));

const ADJ_SYSTEM = `You are the master director adjudicating a three-persona review board, and attached to you is a second hat: the hiring manager for ElevenLabs' Forward Deployed Creative role (ElevenCreative team; the role builds reusable creative workflows, templates, reference content, and workshops that agencies, brands, and account executives adopt). Do not invent or use any real person's name; speak as the role. As adjudicator: weigh the three reports, kill weak notes, keep what materially improves the piece. As the FDC hiring manager: assess how this piece plus its localization kit reads as a portfolio artifact for the role, and specify concretely how ElevenLabs products would level it up (Eleven v3 voice settings or Professional Voice Cloning for delivery, Eleven Music prompt or stem strategy, SFX API usage, Dubbing API, Flows template design, Studio captions/timeline). Suggestions must be executable by one person in days, not a team in months.`;

const ADJ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['ship', 'ship-with-fixes', 'no-ship'] },
    rationale: { type: 'string' },
    prioritized_fixes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { rank: { type: 'number' }, fix: { type: 'string' }, source_persona: { type: 'string' }, effort: { type: 'string', enum: ['minutes', 'hours', 'days'] } }, required: ['rank', 'fix', 'effort'] } },
    elevenlabs_leverage: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { product: { type: 'string' }, move: { type: 'string' }, why_it_matters_for_fdc: { type: 'string' } }, required: ['product', 'move'] } },
    hiring_manager_take: { type: 'string' },
  },
  required: ['verdict', 'rationale', 'prioritized_fixes', 'elevenlabs_leverage', 'hiring_manager_take'],
};

const adjContent = [
  { type: 'text', text: CONTEXT + '\n\nTHE THREE PERSONA REPORTS:\n' + results.map(([k, r]) => `--- ${k.toUpperCase()} (score ${r.score10}/10) ---\n${JSON.stringify(r, null, 1)}`).join('\n') },
  ...frames.map(({ type, source }) => ({ type, source })),
];
const adj = await call({ system: ADJ_SYSTEM, content: adjContent, schema: ADJ_SCHEMA, maxTokens: 8000 });

let md = `# Persona review: ${basename(VIDEO)} (${new Date().toISOString().slice(0, 16)})\n\nReviewers: video post-production supervisor, brand design director, EU marketing strategist. Adjudicated by the master director carrying the ElevenLabs FDC hiring-manager persona (no real person represented). Model: ${MODEL}. Audio judged from measurements (${lufs}), not listening.\n\n`;
for (const [k, r] of results) {
  md += `## ${k} — ${r.score10}/10\n\n**Strengths:** ${r.strengths.join(' · ')}\n\n`;
  for (const i of r.issues) md += `- [${i.severity}]${i.at ? ` (${i.at})` : ''} ${i.issue}\n  Fix: ${i.fix}\n`;
  md += '\n';
}
md += `## Adjudication — ${adj.verdict.toUpperCase()}\n\n${adj.rationale}\n\n### Prioritized fixes\n`;
for (const f of adj.prioritized_fixes) md += `${f.rank}. (${f.effort}${f.source_persona ? `, from ${f.source_persona}` : ''}) ${f.fix}\n`;
md += `\n### ElevenLabs leverage (FDC hiring-manager hat)\n`;
for (const l of adj.elevenlabs_leverage) md += `- **${l.product}**: ${l.move}${l.why_it_matters_for_fdc ? `\n  FDC angle: ${l.why_it_matters_for_fdc}` : ''}\n`;
md += `\n### Hiring-manager take\n\n${adj.hiring_manager_take}\n\n---\nReview spend: $${spend.toFixed(2)} (Anthropic)\n`;

const outPath = join(OUT, 'persona-review.md');
writeFileSync(outPath, md);
console.log(md.split('\n').slice(0, 6).join('\n'));
console.log(`\n✓ saved → ${outPath}  ($${spend.toFixed(2)})`);
