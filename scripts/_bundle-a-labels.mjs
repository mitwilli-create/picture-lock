// Bundle A: render language-label PNGs for the reel (ffmpeg here has no
// drawtext; overlay PNGs instead). Usage: node scripts/_bundle-a-labels.mjs [suffix]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SUFFIX = process.argv[2] ?? '';
const OUT = join(ROOT, 'output', 'reel-labels' + (SUFFIX ? '-auto' : ''));
mkdirSync(OUT, { recursive: true });

const LABELS = {
  en: 'ENGLISH · SOURCE',
  es: 'ESPAÑOL' + SUFFIX, de: 'DEUTSCH' + SUFFIX, fr: 'FRANÇAIS' + SUFFIX, pt: 'PORTUGUÊS' + SUFFIX,
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 160 }, deviceScaleFactor: 1 });
for (const [lang, text] of Object.entries(LABELS)) {
  await page.setContent(`<body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:160px;">
    <div style="font:600 54px/1.1 'Helvetica Neue',Helvetica,Arial,sans-serif;color:#fff;letter-spacing:0.14em;
      text-shadow:0 2px 14px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.9);">${text}</div></body>`);
  await page.screenshot({ path: join(OUT, `${lang}.png`), omitBackground: true });
  console.log(`✓ ${lang}: ${text}`);
}
await browser.close();
console.log(OUT);
