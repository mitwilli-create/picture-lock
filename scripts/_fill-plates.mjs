// scripts/_fill-plates.mjs: one-off generator for the storytellermitch.com
// screen-right fill illustrations. Mirrors the pad-to-16:9 + crop-back Veo
// flow documented in output/motion-groundwork/LEDGER.md: nano-banana-2 still
// (16:9) -> resize to exact 1376x768 -> pad to true 16:9 (1376x774) for Veo
// image-to-video input -> crop the generated clip back to 1376x768 -> encode
// poster-first WebM+MP4 under 1MB. Palette-checks the still vs. the video's
// poster frame; regenerates the still once on failure, then moves on.
//
// Usage: node scripts/_fill-plates.mjs [plateKey ...]   (no args = all plates)

import 'dotenv/config';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as fal from '../lib/fal.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = join(ROOT, 'output/motion-groundwork/fill-plates');
const DIRS = { stills: join(BASE, 'stills'), padded: join(BASE, 'padded'), raw: join(BASE, 'raw'), final: join(BASE, 'final') };
for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });

const HARD_CAP = 12.0;
const W = 1376, H = 768, PADH = Math.round(W * 9 / 16); // 774
const BG = '0x111111';

const STYLE = `Flat 2D technical-diagram illustration, isometric/blueprint drafting register, in the style of a patent illustration or maintenance-manual engraving. Background: solid flat near-black (#111111), completely flat, no gradients, no vignette, no visible texture or noise. Linework: thin uniform-weight bone-cream outlines (#ECE9DE), precise and engineering-clean, consistent stroke width throughout. Exactly one restrained oxblood/rust accent color (#9A4C42) used as a small solid fill on only one or two elements — never more, never as an outline color elsewhere. Strictly no photorealism, no 3D shading, no soft drop shadows, no color gradients, no legible text, words, letters, or numerals anywhere in the frame (at most a few tiny abstract tick-mark engravings standing in for labels — never actual characters). Generous black negative space around the subject; the subject does not fill the whole frame. Mood: restrained, precise, engraved-technical, machine-and-signal.`;

const PLATES = {
  comms: {
    page: 'comms.html',
    still: `${STYLE}\n\nSubject: an executive communications desk reimagined as a signal machine. On the left, a slanted teleprompter panel with faint horizontal ruled lines feeds a single ascending line upward and to the right into the base of a broadcast tower rendered in isometric linework, its mast topped with three small radiating signal arcs. Below and to the right, a short stack of flat rectangular memo-page shapes feeds into a network of brass pneumatic tubes — cylindrical tube segments with elbow joints — curving across the lower-right of the frame toward a terminus fitting. Render one tube elbow joint filled in the oxblood accent; everything else in bone-cream line.`,
    motion: `Subtle cinemagraph, camera locked off, composition and framing completely unchanged from the still. Animate exactly one element: a soft pulse of light travels once along the ascending signal line from the teleprompter panel up into the broadcast tower's mast, fading in and gently fading out. Nothing else moves — the tubes, memo pages, and tower structure stay completely still. No strobing, no flashing, no camera motion.`,
  },
  fit: {
    page: 'fit.html',
    still: `${STYLE}\n\nSubject: a role-fit gauge board — a flat vertical panel holding five small circular dial gauges in a row across the left and center, each with a thin needle at a different angle and a plain unmarked rim. To the right of the dial row, one rectangular keyed slot is cut into the panel, and a single machined key-shaped part sits fitted exactly into it, flush and precise. Render the fitted key part filled in the oxblood accent; the dials, needles, and slot outline in bone-cream line.`,
    motion: `Subtle cinemagraph, camera locked off, composition and framing completely unchanged from the still. Animate exactly one element: the needle on the dial gauge nearest the keyed slot sweeps gently back and forth a few degrees, as if settling into place. Nothing else moves — the other dials, the slot, and the fitted key stay completely still. No strobing, no flashing.`,
  },
  contact: {
    page: 'contact.html',
    still: `${STYLE}\n\nSubject: a minimal, sparse composition. On the left, a small telegraph key — a hinged lever on a low rectangular base — rendered in bone-cream linework. A single thin wire arcs across the black background to the right, terminating at a small envelope-shaped inbox lamp housing on the right side of the frame. Render the lamp's small circular bulb/glow filled in the oxblood accent; everything else in bone-cream line. Very wide open negative space around both elements.`,
    motion: `Subtle cinemagraph, camera locked off, composition and framing completely unchanged from the still. Animate exactly one element: the inbox lamp's oxblood glow softly brightens and dims once, like a signal light being received. Nothing else moves — the telegraph key, its lever, and the wire stay completely still. No strobing, one gentle pulse only.`,
  },
  writing: {
    page: 'writing.html',
    still: `${STYLE}\n\nSubject: a linotype/typewriter hybrid machine on the left, isometric bone-cream linework — a compact keyboard bank beneath a cylindrical roller/carriage. From the machine's output side, a horizontal ribbon made of small abstract flowing mark-like glyphs (never real letters) streams rightward across the frame and gathers into the top edge of a single flat rectangular page shape on the right. Render the page's folded corner filled in the oxblood accent; everything else in bone-cream line.`,
    motion: `Subtle cinemagraph, camera locked off, composition and framing completely unchanged from the still. Animate exactly one element: the ribbon of small abstract glyph-marks drifts slowly and continuously rightward from the machine toward the page, looping seamlessly. Nothing else moves — the machine body and the page stay completely still. No strobing.`,
  },
  impact: {
    page: 'impact.html',
    still: `${STYLE}\n\nSubject: a measurement bench, isometric bone-cream linework. On the left, an oscilloscope screen (a rounded rectangle) displays one jagged trace line. To the right of the scope, two small counter-dial gauges sit above a running mechanism — a simple gear-and-shaft assembly at the base of the frame. Render the peak of the oscilloscope trace filled/highlighted in the oxblood accent; everything else in bone-cream line.`,
    motion: `Subtle cinemagraph, camera locked off, composition and framing completely unchanged from the still. Animate exactly one element: the oscilloscope trace sweeps slowly and continuously left to right across the screen, looping seamlessly. Nothing else moves — the dials and mechanism stay completely still. No strobing.`,
  },
  stories: {
    page: 'stories.html',
    still: `${STYLE}\n\nSubject: a film-reel projector body on the left, isometric bone-cream linework, with one visible reel. From its lens, a triangular beam of light widens rightward across the black background; within the beam, three small wireframe/isometric scene shapes float in outline — a simple house silhouette, a standing figure silhouette, and a small tree — each rendered only in thin bone-cream line. Render one of the three shapes' outline in the oxblood accent instead of bone-cream; everything else in bone-cream line.`,
    motion: `Subtle cinemagraph, camera locked off, composition and framing completely unchanged from the still. Animate exactly one element: the projector's beam of light gently flickers in brightness, like film running through a gate. Nothing else moves — the wireframe scene shapes and the projector body stay completely still. No harsh flashing or strobing, only a soft subtle flicker.`,
  },
};

const LEDGER_PATH = join(BASE, 'LEDGER-FILL.md');
let ledgerRows = [];
let totalSpend = 0;

function record(plate, stage, detail, cost) {
  totalSpend += cost;
  ledgerRows.push({ plate, stage, detail, cost, runningTotal: +totalSpend.toFixed(4) });
  console.log(`  [$${cost.toFixed(4)}] ${plate}/${stage}: ${detail} (running total $${totalSpend.toFixed(2)})`);
  if (totalSpend > HARD_CAP) throw new Error(`HARD CAP EXCEEDED: $${totalSpend.toFixed(2)} > $${HARD_CAP}`);
}

function ff(args) {
  return execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

function fileSizeKB(p) {
  return Math.round(statSync(p).size / 1024);
}

function paletteCheck(srcJpg, candJpg) {
  const out = execFileSync('python3', [join(__dirname, '_palette_check.py'), srcJpg, candJpg], { encoding: 'utf8' });
  return JSON.parse(out.trim());
}

function toDataUri(path) {
  const buf = readFileSync(path);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

// Resize/crop an arbitrary near-16:9 still to the exact site plate size (1376x768).
function resizeToPlate(inPath, outPath) {
  ff(['-i', inPath, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`, '-q:v', '2', outPath]);
}

// Pad the exact-size still to a true 16:9 canvas (adds tiny top/bottom bars
// in the same near-black background color) so Veo's aspect_ratio:16:9 input
// requires zero auto-crop.
function padTo169(inPath, outPath) {
  ff(['-i', inPath, '-vf', `pad=${W}:${PADH}:0:${Math.round((PADH - H) / 2)}:color=${BG}`, '-q:v', '2', outPath]);
}

// Crop the generated 16:9 clip back down to the plate's exact 1376x768 frame.
function cropBack(inPath, outPath) {
  const padOffset = Math.round((PADH - H) / 2);
  ff(['-i', inPath, '-vf', `scale=${W}:${PADH},crop=${W}:${H}:0:${padOffset}`, '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath]);
}

function extractPoster(videoPath, outPath, atSec = 0.1) {
  ff(['-ss', String(atSec), '-i', videoPath, '-frames:v', '1', '-q:v', '3', outPath]);
}

// Encode a scaled-down MP4 under the size budget, backing off CRF/scale if needed.
function encodeUnder1MB(sourceMp4, outMp4, outWebm) {
  const attempts = [
    { w: 960, crfH264: 26, crfVp9: 32 },
    { w: 960, crfH264: 30, crfVp9: 36 },
    { w: 720, crfH264: 30, crfVp9: 38 },
    { w: 640, crfH264: 32, crfVp9: 40 },
  ];
  let mp4Size = Infinity, webmSize = Infinity, used = null;
  for (const a of attempts) {
    ff(['-i', sourceMp4, '-vf', `scale=${a.w}:-2`, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(a.crfH264), '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', outMp4]);
    mp4Size = statSync(outMp4).size;
    ff(['-i', sourceMp4, '-vf', `scale=${a.w}:-2`, '-c:v', 'libvpx-vp9', '-crf', String(a.crfVp9), '-b:v', '0', '-an', outWebm]);
    webmSize = statSync(outWebm).size;
    used = a;
    if (mp4Size < 1024 * 1024 && webmSize < 1024 * 1024) break;
  }
  return { mp4Size, webmSize, used };
}

async function generateStill(key, spec, attempt) {
  const rawPath = join(DIRS.stills, `fill-${key}-raw-a${attempt}.jpg`);
  console.log(`[${key}] still attempt ${attempt}: nano-banana-2 (16:9)...`);
  const img = await fal.generateImage({ prompt: spec.still, outPath: rawPath, aspectRatio: '16:9', log: () => {} });
  record(key, 'still', `nano-banana-2 attempt ${attempt}, req ${img.requestId}`, img.estCostUsd);
  const platePath = join(DIRS.final, `fill-${key}.jpg`);
  resizeToPlate(rawPath, platePath);
  return platePath;
}

async function generateMotion(key, spec, stillPath, attempt) {
  const paddedPath = join(DIRS.padded, `fill-${key}-pad-a${attempt}.jpg`);
  padTo169(stillPath, paddedPath);
  const dataUri = toDataUri(paddedPath);
  console.log(`[${key}] video attempt ${attempt}: veo3.1 fast i2v (4s, 16:9)...`);
  const rawVid = join(DIRS.raw, `fill-${key}-raw-a${attempt}.mp4`);
  const vid = await fal.imageToVideo({ prompt: spec.motion, imageUrl: dataUri, seconds: 4, outPath: rawVid, aspectRatio: '16:9', log: () => {} });
  record(key, 'video', `veo3.1-fast i2v attempt ${attempt}, req ${vid.requestId}, ${vid.requestedSeconds}s`, vid.estCostUsd);
  const croppedVid = join(DIRS.raw, `fill-${key}-cropped-a${attempt}.mp4`);
  cropBack(rawVid, croppedVid);
  return croppedVid;
}

async function processPlate(key) {
  const spec = PLATES[key];
  if (!spec) throw new Error(`no plate spec for ${key}`);
  console.log(`\n=== ${key} (${spec.page}) ===`);

  let attempt = 1;
  let stillPath = await generateStill(key, spec, attempt);
  let croppedVid = await generateMotion(key, spec, stillPath, attempt);

  const posterPath = join(DIRS.raw, `fill-${key}-poster-a${attempt}.jpg`);
  extractPoster(croppedVid, posterPath);
  let palette = paletteCheck(stillPath, posterPath);
  console.log(`[${key}] palette check attempt ${attempt}:`, palette);

  if (!palette.pass) {
    console.log(`[${key}] palette check FAILED (${palette.flags.join(', ')}) — regenerating still once...`);
    attempt = 2;
    stillPath = await generateStill(key, spec, attempt);
    croppedVid = await generateMotion(key, spec, stillPath, attempt);
    const posterPath2 = join(DIRS.raw, `fill-${key}-poster-a${attempt}.jpg`);
    extractPoster(croppedVid, posterPath2);
    const palette2 = paletteCheck(stillPath, posterPath2);
    console.log(`[${key}] palette check attempt ${attempt}:`, palette2);
    palette = { ...palette2, note: palette2.pass ? 'passed on regen' : 'still failing after 1 regen — shipping anyway per brief', attempts: 2 };
  } else {
    palette = { ...palette, attempts: 1 };
  }

  const finalMp4 = join(DIRS.final, `fill-${key}.mp4`);
  const finalWebm = join(DIRS.final, `fill-${key}.webm`);
  const enc = encodeUnder1MB(croppedVid, finalMp4, finalWebm);
  console.log(`[${key}] encoded: mp4=${Math.round(enc.mp4Size / 1024)}KB webm=${Math.round(enc.webmSize / 1024)}KB (scale=${enc.used.w}w)`);

  return {
    key, page: spec.page,
    still: stillPath, stillKB: fileSizeKB(stillPath),
    mp4: finalMp4, mp4KB: Math.round(enc.mp4Size / 1024),
    webm: finalWebm, webmKB: Math.round(enc.webmSize / 1024),
    palette,
    encodeScale: enc.used.w,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const keys = args.length ? args : Object.keys(PLATES);
  const results = [];
  for (const key of keys) {
    try {
      const r = await processPlate(key);
      results.push(r);
    } catch (e) {
      console.error(`[${key}] FAILED: ${e.message}`);
      results.push({ key, page: PLATES[key]?.page, error: e.message });
    }
  }

  // Write LEDGER-FILL.md
  let md = `# Fill Plates — API Call Ledger\n\nGenerated ${new Date().toISOString()}. Hard cap: $${HARD_CAP.toFixed(2)}.\n\n`;
  md += `## Calls\n\n| Plate | Stage | Detail | Cost | Running total |\n|---|---|---|---|---|\n`;
  for (const row of ledgerRows) {
    md += `| ${row.plate} | ${row.stage} | ${row.detail} | $${row.cost.toFixed(4)} | $${row.runningTotal.toFixed(4)} |\n`;
  }
  md += `\n## Results\n\n| Page | Still (KB) | MP4 (KB) | WebM (KB) | Palette (warm/sat/val) | Flags | Attempts |\n|---|---|---|---|---|---|---|\n`;
  for (const r of results) {
    if (r.error) { md += `| ${r.page || r.key} | ERROR: ${r.error} |||||\n`; continue; }
    const p = r.palette;
    md += `| ${r.page} | ${r.stillKB} | ${r.mp4KB} | ${r.webmKB} | ${p.warmDelta}/${p.satDelta}/${p.valDelta} | ${p.flags.join(', ')} | ${p.attempts} |\n`;
  }
  md += `\n## Total\n\n- **Total spend: $${totalSpend.toFixed(2)}** (hard cap $${HARD_CAP.toFixed(2)}, ${(totalSpend / HARD_CAP * 100).toFixed(1)}% used)\n`;
  md += `\n## Method\n\n- Same pad-to-16:9 + crop-back Veo flow as output/motion-groundwork/LEDGER.md: still resized to exact 1376x768, padded to true 16:9 (1376x${PADH}) with matching near-black bars for the image-to-video input (aspect_ratio: 16:9 explicit, no auto-crop), then the generated clip is cropped back to 1376x768 before encode.\n`;
  md += `- Palette check: same method as output/motion-groundwork/REVIEW.md — PIL, 200px thumbnail, source still vs. candidate poster frame (extracted from the cropped clip). R-B warm-cast delta, HSV saturation delta, HSV value delta. Flags: warm cast if |Δ|>8, oversaturated/undersaturated if |Δsat|>15, brightness drift if |Δval|>20.\n`;
  md += `- One candidate per plate (not two, per this brief). On palette failure, the still is regenerated once and the whole still->pad->i2v->crop->encode chain reruns; a second failure is logged and shipped anyway per the brief.\n`;
  md += `- \`generateModel: fal-ai/nano-banana-2\` (stills, $0.08/image, aspect_ratio 16:9) + \`fal-ai/veo3.1/fast/image-to-video\` (motion, $0.10/s, 4s clips = $0.40, resolution 1080p, generate_audio: false).\n`;

  writeFileSync(LEDGER_PATH, md);
  console.log(`\nLEDGER written to ${LEDGER_PATH}`);
  console.log(`Total spend: $${totalSpend.toFixed(2)}`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
