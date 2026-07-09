#!/usr/bin/env node
// scripts/publish-to-site.mjs: hand the finished cut to the case-study page.
//   node scripts/publish-to-site.mjs [--site /path/to/site]
// Copies output/short.mp4 + captions to the site's assets, emits a WebVTT
// track (browsers ignore SRT in <track>), and extracts a fresh poster frame.

import { copyFileSync, readFileSync, writeFileSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const SITE = arg('--site', join(ROOT, '..', 'storytellermitch-site'));
const ASSETS = join(SITE, 'assets');

const srtToVtt = (srt) =>
  'WEBVTT\n\n' + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

const mp4 = join(ROOT, 'output', 'short.mp4');
const srt = join(ROOT, 'output', 'short.srt');
if (!existsSync(mp4) || !existsSync(srt)) {
  console.error('missing output/short.mp4 or output/short.srt: run the pipeline first');
  process.exit(1);
}

copyFileSync(mp4, join(ASSETS, 'broll-short.mp4'));
copyFileSync(srt, join(ASSETS, 'broll-short.srt'));
writeFileSync(join(ASSETS, 'broll-short.vtt'), srtToVtt(readFileSync(srt, 'utf8')));

const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
fx.extractPoster(mp4, join(ASSETS, 'broll-poster.jpg'), 1.0);

const es = join(ROOT, 'output', 'short.es.mp4');
if (existsSync(es)) copyFileSync(es, join(ASSETS, 'broll-short.es.mp4'));

for (const f of ['broll-short.mp4', 'broll-short.srt', 'broll-short.vtt', 'broll-poster.jpg']) {
  const kb = statSync(join(ASSETS, f)).size / 1024;
  console.log(`  ${f.padEnd(22)} ${kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb.toFixed(0) + ' KB'}`);
}
const mb = statSync(mp4).size / 1024 / 1024;
if (mb > 15) console.warn(`⚠ short.mp4 is ${mb.toFixed(1)} MB — heavy for a page embed; consider a crf pass`);
console.log(`✓ published to ${ASSETS}`);
console.log('  reminder: the page <track> must point at broll-short.vtt (SRT tracks render nothing)');
