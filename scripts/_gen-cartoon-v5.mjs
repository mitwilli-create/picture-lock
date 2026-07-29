// Explainer v5 cartoon (Mitchell's note 4): a NEW multi-shot story sequence —
// an engraved character drives the action at a futuristic picture-lock device
// whose screen lights up with rolling footage; outputs emerge on the vocal
// nouns; the receipt prints. Panels are DESIGNED FOR THE RIGHT-HALF CROP
// (subject group right-of-center in a 16:9 frame) — v4's failure was cropping
// a composition that was never designed for it.
// Usage: node --env-file=.env scripts/_gen-cartoon-v5.mjs [--stills-only|--anim-only]
// Assets cache by existsSync: delete a file to regenerate it.
const WT = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec';
const { generateImage, imageToVideo } = await import(`${WT}/lib/fal.mjs`);
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const OUT = 'output/takes/e2/cartoon-v5';
mkdirSync(OUT, { recursive: true });
const b64 = p => `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;

const STYLE = `Flat 2D technical-diagram illustration, isometric/blueprint drafting register, in the style of a patent illustration or maintenance-manual engraving. Background: solid flat near-black (#111111), completely flat, no gradients, no vignette, no visible texture or noise. Linework: thin uniform-weight bone-cream outlines (#ECE9DE), precise and engineering-clean, consistent stroke width throughout. Exactly one restrained oxblood/rust accent color (#9A4C42) used as a small solid fill on only one or two elements, never more, never as an outline color elsewhere. Strictly no photorealism, no 3D shading, no soft drop shadows, no color gradients, no legible text, words, letters, or numerals anywhere in the frame (at most a few tiny abstract tick-mark engravings standing in for labels, never actual characters). Generous black negative space around the subject; the subject does not fill the whole frame. Mood: restrained, precise, engraved-technical, machine-and-signal.`;

// identical character + device description in every panel = cross-panel consistency
const CHARACTER = `a small engraved human figure (simple suit, rolled sleeves, short beard, drawn in the same thin linework, about one third the height of the machine)`;
const DEVICE = `a sleek futuristic "picture lock" film machine: a tall streamlined art-deco console with rounded corners, one large central cinema screen, a page-intake slot with rollers on its left flank, three small output chutes staggered down its right flank, thin antenna array on top, engraved cog and lens details on the housing`;
const COMPOSE = `Composition: the entire subject group (machine + figure) sits in the RIGHT HALF of the frame, centered within that right half with clear margin from the top, bottom and right edges; the left 45 percent of the frame is pure empty near-black negative space. Nothing important near any frame edge.`;

const PANELS = [
  { id: 'p1-feed',
    subject: `${CHARACTER} standing at the left flank of ${DEVICE}, actively feeding a large script page into the intake slot with both hands; the page is halfway swallowed by the rollers; the machine's screen is still dark; the oxblood accent is a small power lamp glowing on the console. ${COMPOSE}`,
    motion: `The figure feeds the script page steadily into the intake slot; the rollers turn and draw the page in; the machine's antenna quivers slightly and interior cogs begin to rotate; at the end the dark screen flickers faintly awake. Locked-off camera, no camera movement.` },
  { id: 'p2-generate',
    subject: `${CHARACTER} watching from the lower left of ${DEVICE} whose central cinema screen is now LIT, showing a tiny engraved film actually playing (a miniature scene with action lines); from the right-flank chutes outputs stream out in mid-air: an undulating waveform ribbon, a run of music notes, a strip of small film frames, and rectangular caption cards; the oxblood accent is the glowing screen bezel. ${COMPOSE}`,
    motion: `The screen plays rolling miniature footage continuously (tiny engraved scenes cutting between shots); outputs emerge in order from the chutes: first the waveform ribbon undulates out, then music notes scatter upward, then the film-frame strip unrolls, then caption cards flip out one by one; the figure gestures following each output. Locked-off camera, no camera movement.` },
  { id: 'p3-receipt',
    subject: `${CHARACTER} standing at the right flank of ${DEVICE}, catching with both hands a very long engraved paper receipt that prints downward out of a slot, the receipt covered in tiny abstract tick-mark line entries (no real characters); the machine's screen shows a small completed film frame with a corner ribbon; the oxblood accent is a small round seal-stamp mark on the receipt. ${COMPOSE}`,
    motion: `The receipt scrolls out line by line, lengthening; the figure gathers it, holds it up and inspects it; at the end a small stamp arm on the machine presses the oxblood seal onto the receipt with a decisive motion. Locked-off camera, no camera movement.` },
];

const KEEP = 'Preserve the exact engraved patent-illustration style: thin bone-cream linework on flat near-black, single oxblood accent, no new elements, no readable text anywhere.';
const mode = process.argv[2] ?? '';
let spend = 0;
const logSpend = (what, usd) => {
  const p = 'output/takes/spend-log.json';
  const log = JSON.parse(readFileSync(p, 'utf8'));
  log.push({ when: new Date().toISOString().slice(0, 10), what, est_cost_usd: +usd.toFixed(2) });
  writeFileSync(p, JSON.stringify(log, null, 2) + '\n');
};

if (mode !== '--anim-only') {
  for (const p of PANELS) {
    const out = `${OUT}/${p.id}.jpg`;
    if (existsSync(out)) { console.log('cached still', p.id); continue; }
    const r = await generateImage({ prompt: `${STYLE}\n\nSubject: ${p.subject}`, outPath: out, aspectRatio: '16:9', log: () => process.stdout.write('.') });
    spend += r?.estCostUsd ?? 0.15;
    console.log('\nstill', p.id);
  }
  if (spend) logSpend('v5 cartoon stills (nano-banana-2 x' + PANELS.length + ')', spend);
}
if (mode === '--stills-only') process.exit(0);

let animSpend = 0;
for (const p of PANELS) {
  const out = `${OUT}/${p.id}.mp4`;
  if (existsSync(out)) { console.log('cached anim', p.id); continue; }
  const r = await imageToVideo({ prompt: `${p.motion} ${KEEP}`, imageUrl: b64(`${OUT}/${p.id}.jpg`), seconds: 8, outPath: out, log: () => process.stdout.write('.') });
  animSpend += r?.estCostUsd ?? 0.8;
  console.log('\nanim', p.id);
}
if (animSpend) logSpend('v5 cartoon i2v (veo3.1-fast 8s x' + PANELS.length + ')', animSpend);
console.log('done');
