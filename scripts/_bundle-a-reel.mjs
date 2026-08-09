// Bundle A: snap-cut comparison reel. Same emotional moments across languages,
// language label on every clip, soft audio edges (no hard clip starts/stops,
// per Craft Law). Reads the dubbed masters from the bundle film dir.
// Usage: node scripts/_bundle-a-reel.mjs [dubDir] [outName] [labelSuffix]
//   dubDir: where last-service.<lang>.mp4 dubs live (default: bundle film/)
//   outName: output filename (default: comparison-reel.mp4)
//   labelSuffix: appended to non-EN labels, e.g. " · AUTO ENGINE"
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BUNDLE = '/Users/mitchellwilliams/Documents/broll-pipeline/output/bundles/bundle-a/film';
const DUBDIR = process.argv[2] ?? BUNDLE;
const OUTNAME = process.argv[3] ?? 'comparison-reel.mp4';
const SUFFIX = process.argv[4] ?? '';
const TMP = join(BUNDLE, '.reel-tmp');
mkdirSync(TMP, { recursive: true });

const SRC = {
  en: join(BUNDLE, 'last-service.en.mp4'),
  es: join(DUBDIR, 'last-service.es.mp4'),
  de: join(DUBDIR, 'last-service.de.mp4'),
  fr: join(DUBDIR, 'last-service.fr.mp4'),
  pt: join(DUBDIR, 'last-service.pt.mp4'),
};
const LABEL = { en: 'ENGLISH · SOURCE', es: 'ESPAÑOL' + SUFFIX, de: 'DEUTSCH' + SUFFIX, fr: 'FRANÇAIS' + SUFFIX, pt: 'PORTUGUÊS' + SUFFIX };
for (const [l, p] of Object.entries(SRC)) if (!existsSync(p)) throw new Error(`missing ${l}: ${p}`);

// Moments (from film/emotion-beats.md). Each: [start, end, langs to snap through].
const MOMENTS = [
  { name: 'the laugh', start: 15.0, end: 20.0, langs: ['en', 'es', 'de'] },
  { name: 'the break', start: 22.0, end: 27.4, langs: ['en', 'fr', 'pt'] },
  { name: 'the defiance', start: 35.0, end: 40.0, langs: ['en', 'de', 'es'] },
  { name: 'the whisper', start: 44.2, end: 49.2, langs: ['fr', 'en'] },
];

// labels are pre-rendered PNGs (this ffmpeg build has no drawtext):
// node scripts/_bundle-a-labels.mjs first (with the suffix if any)
const LABELDIR = join(process.cwd(), 'output', 'reel-labels' + (SUFFIX ? '-auto' : ''));
const segs = [];
for (const m of MOMENTS) {
  for (const lang of m.langs) {
    const out = join(TMP, `seg-${segs.length}.mp4`);
    const dur = m.end - m.start;
    execFileSync('ffmpeg', ['-y', '-v', 'error',
      '-ss', String(m.start), '-t', String(dur), '-i', SRC[lang],
      '-i', join(LABELDIR, `${lang}.png`),
      '-filter_complex', `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[v];[v][1:v]overlay=0:120[vo]`,
      '-map', '[vo]', '-map', '0:a',
      '-af', `afade=t=in:st=0:d=0.06,afade=t=out:st=${(dur - 0.08).toFixed(2)}:d=0.08`,
      '-r', '30', '-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', out]);
    segs.push(out);
    console.log(`✓ ${m.name} [${lang}] ${dur.toFixed(1)}s`);
  }
}

const listFile = join(TMP, 'concat.txt');
writeFileSync(listFile, segs.map((s) => `file '${s}'`).join('\n'));
const OUT = join(DUBDIR === BUNDLE ? BUNDLE : DUBDIR, OUTNAME);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT]);
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT]).toString().trim();
console.log(`\n✓ ${OUT}  (${parseFloat(dur).toFixed(1)}s, ${segs.length} cuts)`);
