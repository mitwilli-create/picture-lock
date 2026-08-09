// Bundle A: dub the finished film EN → ES/DE/FR/PT via the ElevenLabs dubbing
// API (the pipeline's dubbing integration), four jobs in parallel. Writes the
// dubbed masters + a dub-manifest receipt (full job metadata kept as evidence
// of which dubbing engine the API ran).
// Usage: node scripts/_bundle-a-dub.mjs [path-to-master]
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
try { const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') }); }
catch {}
const el = await import(join(ROOT, 'lib', 'elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));

const MASTER = process.argv[2] ?? join(ROOT, 'output', 'cover.mp4');
const BUNDLE = '/Users/mitchellwilliams/Documents/broll-pipeline/output/bundles/bundle-a/film';
mkdirSync(BUNDLE, { recursive: true });
const LANGS = ['es', 'de', 'fr', 'pt'];
const mins = fx.probeDuration(MASTER) / 60;
console.log(`master: ${MASTER} (${(mins * 60).toFixed(1)}s)`);

const manifest = { master: MASTER, started: new Date().toISOString(), jobs: [], costUsd: 0 };

const results = await Promise.allSettled(LANGS.map(async (lang) => {
  const { dubbing_id, expected_duration_sec } = await el.dubCreate({ filePath: MASTER, targetLang: lang });
  console.log(`  [${lang}] job ${dubbing_id} created (~${expected_duration_sec}s)`);
  const deadline = Date.now() + 20 * 60 * 1000;
  let j;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    j = await el.dubStatus(dubbing_id);
    if (j.status === 'dubbed') break;
    if (j.status === 'failed') throw new Error(`[${lang}] dub failed: ` + JSON.stringify(j).slice(0, 300));
  }
  if (j.status !== 'dubbed') throw new Error(`[${lang}] polling timed out`);
  const buf = await el.dubDownload(dubbing_id, lang);
  const out = join(BUNDLE, `last-service.${lang}.mp4`);
  writeFileSync(out, buf);
  const cost = mins * 0.50;
  manifest.jobs.push({ lang, dubbing_id, out, costUsd: +cost.toFixed(4), statusPayload: j });
  manifest.costUsd += cost;
  console.log(`  ✓ [${lang}] → ${out}  ($${cost.toFixed(2)})`);
  return lang;
}));

for (const [i, r] of results.entries())
  if (r.status === 'rejected') console.log(`  ✗ [${LANGS[i]}] ${r.reason?.message}`);
manifest.costUsd = +manifest.costUsd.toFixed(4);
manifest.finished = new Date().toISOString();
writeFileSync(join(BUNDLE, '..', 'receipts', 'dub-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n✓ dub-manifest written  est. spend $${manifest.costUsd.toFixed(2)}`);
