// Explainer v2: four vérité doc-style live shots of someone using the pipeline.
// Vice/Vox grammar: handheld sway, shallow DOF, natural light, muted grade,
// real workspace, NO readable text (craft law). ~$2.40 at 6s tiers.
// Usage: node --env-file=.env scripts/_gen-doc-shots.mjs
const { generateClip } = await import('/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec/lib/fal.mjs');
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const OUT = 'output/takes/e2/doc';
mkdirSync(OUT, { recursive: true });
const STYLE = 'Handheld documentary vérité footage, shot on a cinema camera with a 35mm lens, shallow depth of field, subtle handheld sway, natural window light, muted desaturated color grade, real cluttered home workspace, authentic not staged, no readable text anywhere in frame.';
const SHOTS = [
  { id: 'typing',    p: 'Over-the-shoulder of a man in his thirties typing a plain text document on a laptop at a living room desk, morning light, coffee cup, focused' },
  { id: 'listening', p: 'Side profile of the same man leaning back with headphones on, listening intently, eyes closed then nodding slightly, audio waveform softly out of focus on the screen behind' },
  { id: 'reviewing', p: 'The man leaning toward a monitor reviewing video clips, pointing at the screen with a pen, screen content abstract and out of focus, dusk lamp light' },
  { id: 'satisfied', p: 'The man pushing back from the desk with a small satisfied exhale, stretching, the workspace visible around him, warm evening light' },
];
let spend = 0;
for (const s of SHOTS) {
  const out = `${OUT}/${s.id}.mp4`;
  if (existsSync(out)) { console.log('cached', s.id); continue; }
  const r = await generateClip({ prompt: `${STYLE} ${s.p}`, seconds: 6, outPath: out, log: m => process.stdout.write('.') });
  spend += r.estCostUsd ?? 0.6;
  console.log('\nshot', s.id, `$${(r.estCostUsd ?? 0.6).toFixed(2)}`);
}
const notesPath = 'output/takes/spend-log.json';
const log = JSON.parse(readFileSync(notesPath, 'utf8'));
log.push({ when: '2026-07-13', what: 'explainer v2 doc-style live shots x4 (Veo)', est_cost_usd: +spend.toFixed(2) });
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
console.log('done, $' + spend.toFixed(2));
