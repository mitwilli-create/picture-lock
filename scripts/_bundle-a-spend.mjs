// Bundle A: roll every receipt into SPEND.md with the $20 guardrail check.
// Usage: node scripts/_bundle-a-spend.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLE = '/Users/mitchellwilliams/Documents/broll-pipeline/output/bundles/bundle-a';
const R = join(BUNDLE, 'receipts');

const cover = JSON.parse(readFileSync(join(R, 'cover-manifest.json'), 'utf8'));
const dub = existsSync(join(R, 'dub-manifest.json')) ? JSON.parse(readFileSync(join(R, 'dub-manifest.json'), 'utf8')) : { costUsd: 0, jobs: [] };
const vo = JSON.parse(readFileSync(join(ROOT, 'input', 'bundle-a-vo.json'), 'utf8'));

// split the cover manifest by provider: council/review = Anthropic; visuals gen = fal;
// stt/sfx/ambience/score = ElevenLabs
const buckets = { anthropic: 0, fal: 0, elevenlabs: 0 };
const byStage = {};
for (const c of cover.calls ?? []) {
  const v = c.costUsd || 0;
  byStage[c.stage] = (byStage[c.stage] || 0) + v;
  if (c.stage === 'council' || c.stage === 'review') buckets.anthropic += v;
  else if (c.stage === 'visuals') buckets.fal += v;
  else buckets.elevenlabs += v;
}
// VO candidates: 1 original + 3 candidates, all billed
const voTotal = vo.estCostUsd * 4;
// remix passes: arc score + extra foley (receipts written by the remix scripts)
let remixTotal = 0;
for (const f of ['remix-spend.json', 'remix2-spend.json']) {
  const p = join(ROOT, '.cache', 'cover', f);
  if (existsSync(p)) for (const s of JSON.parse(readFileSync(p, 'utf8'))) remixTotal += s.usd;
}
buckets.elevenlabs += voTotal + dub.costUsd + remixTotal;

const falEl = buckets.fal + buckets.elevenlabs;
const lines = [
  '# Bundle A: actual spend (logged per call, estimates from published rates)',
  '',
  `Guardrail: fal + ElevenLabs under $20.00. **Actual: $${falEl.toFixed(2)} ${falEl < 20 ? '(PASS)' : '(OVER: flagged)'}**`,
  '',
  '| Bucket | USD |',
  '|---|---|',
  `| ElevenLabs (VO takes x4, STT, scores, SFX, ambience, remix foley, ${dub.jobs.length} dubs) | $${buckets.elevenlabs.toFixed(2)} |`,
  `| fal.ai (generated shots incl. retakes) | $${buckets.fal.toFixed(2)} |`,
  `| **fal + ElevenLabs total (guardrail)** | **$${falEl.toFixed(2)}** |`,
  `| Anthropic (creative council + review board, outside guardrail) | $${buckets.anthropic.toFixed(2)} |`,
  '',
  '## By pipeline stage (cover-manifest.json)',
  '',
  '| Stage | USD |',
  '|---|---|',
  ...Object.entries(byStage).map(([k, v]) => `| ${k} | $${v.toFixed(3)} |`),
  `| vo takes (bundle-a-vo receipts) | $${voTotal.toFixed(3)} |`,
  `| dubbing x${dub.jobs.length} (dub-manifest.json) | $${dub.costUsd.toFixed(3)} |`,
  '',
  `Generated ${new Date().toISOString()} from receipts in this folder.`,
];
writeFileSync(join(R, 'SPEND.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
