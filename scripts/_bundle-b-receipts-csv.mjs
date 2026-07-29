// Bundle B: flatten every receipts/*.json manifest into one inspectable CSV.
// Dealbreaker optimization #3: published request IDs convert the cost claim
// from assertion to proof. Writes the CSV beside the manifests and, when the
// site repo is present, beside the published kit pages.
//
// Usage: node scripts/_bundle-b-receipts-csv.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REC = join(ROOT, 'output/bundles/bundle-b/receipts');
const SITE_DOCS = join(ROOT, '..', 'storytellermitch-site', 'docs');

const rows = [];
const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const pushCall = (manifest, ts, market, c) => {
  const item = c.name ?? (c.beat != null ? `beat-${c.beat}` : c.lang ?? '');
  const detail = [
    c.chars != null ? `${c.chars} chars` : null,
    c.seconds != null ? `${c.seconds}s` : null,
    c.requestedSeconds != null ? `${c.requestedSeconds}s requested` : null,
    c.mode, c.medium, c.model,
    c.shots != null ? `${c.shots} shots` : null,
    c.note,
  ].filter(Boolean).join('; ');
  rows.push([manifest, ts ?? '', c.stage ?? 'call', market ?? '', item, detail,
    c.requestId ?? '', c.costSource ?? 'logged', (c.costUsd ?? c.estCostUsd ?? 0).toFixed(4)]);
};

for (const f of readdirSync(REC).filter((f) => f.endsWith('.json')).sort()) {
  const m = JSON.parse(readFileSync(join(REC, f), 'utf8'));
  const name = basename(f, '.json');
  const ts = m.started ?? m.call?.createdAt ?? '';
  if (Array.isArray(m.calls)) for (const c of m.calls) pushCall(name, ts, c.lang ?? '', c);
  if (m.markets) {
    for (const [mkt, entry] of Object.entries(m.markets)) {
      if (Array.isArray(entry.calls)) for (const c of entry.calls) pushCall(name, ts, mkt, c);
      else rows.push([name, ts, 'market-build', mkt, entry.out ?? '', entry.note ?? '', '', 'logged', (entry.marketCostUsd ?? 0).toFixed(4)]);
    }
  }
  if (m.call) pushCall(name, ts, '', { ...m.call, stage: 'retake' });
}

const total = rows.reduce((a, r) => a + parseFloat(r[8]), 0);
rows.push(['TOTAL', '', '', '', '', 'sum of surviving logged manifests only; the whole-bundle figure (about 17.40 USD across all three produced versions) is read from the provider dashboards because some per-run receipt files were overwritten by cache-served reruns (bug logged in the README)', '', '', total.toFixed(4)]);

const header = ['manifest', 'started_utc', 'stage', 'market', 'item', 'detail', 'request_id', 'cost_source', 'cost_usd'];
const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
const out = join(REC, 'bundle-b-receipts.csv');
writeFileSync(out, csv);
console.log(`✓ ${rows.length - 1} calls + total → ${out.replace(ROOT + '/', '')} (total $${total.toFixed(2)})`);
if (existsSync(SITE_DOCS)) {
  copyFileSync(out, join(SITE_DOCS, 'bundle-b-receipts.csv'));
  console.log(`✓ copied → site docs/bundle-b-receipts.csv`);
}
