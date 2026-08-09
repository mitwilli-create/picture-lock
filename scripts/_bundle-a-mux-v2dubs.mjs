// Bundle A: mux Dubbing v2 audio (downloaded from the UI job) onto the
// pristine EN master video, one output per language. The v2 UI dub ran on an
// audio/proxy upload; video quality of the deliverable comes from the master.
// Usage: node scripts/_bundle-a-mux-v2dubs.mjs <dir-with-v2-dub-files>
// Accepts any file layout: matches files containing the language code.
import { readdirSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const B = '/Users/mitchellwilliams/Documents/broll-pipeline/output/bundles/bundle-a/film';
const SRC = process.argv[2] ?? join(B, 'v2-downloads');
const MASTER = join(B, 'last-service.en.mp4');
const LANGS = { es: ['es', 'spanish', 'espa'], de: ['de', 'german', 'deutsch'], fr: ['fr', 'french', 'fran'], pt: ['pt', 'portug'] };

const files = readdirSync(SRC).filter((f) => /\.(mp4|mp3|m4a|wav|aac)$/i.test(f));
for (const [lang, keys] of Object.entries(LANGS)) {
  const f = files.find((x) => keys.some((k) => x.toLowerCase().includes(k)));
  if (!f) { console.log(`✗ ${lang}: no file matched in ${SRC}`); continue; }
  const src = join(SRC, f);
  const out = join(B, `last-service.${lang}.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', MASTER, '-i', src,
    '-map', '0:v', '-map', '1:a', '-map', '0:s?',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-c:s', 'mov_text',
    '-t', String(fx.probeDuration(MASTER)), '-movflags', '+faststart', out]);
  console.log(`✓ ${lang}: ${f} → ${out} (${fx.probeDuration(out).toFixed(2)}s)`);
}
