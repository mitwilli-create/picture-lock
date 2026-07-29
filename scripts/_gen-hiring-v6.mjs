// Round-3 asset: the "if you're hiring for AI production work" shot — an
// engraved interview that resolves into a handshake, full-frame (replaces the
// for-elevenlabs page insert), oxblood-wiped into the CTA. Site STYLE string.
// Usage: node --env-file=.env scripts/_gen-hiring-v6.mjs [--stills-only|--anim-only]
const WT = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec';
const { generateImage, imageToVideo } = await import(`${WT}/lib/fal.mjs`);
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const OUT = 'output/takes/e2/hiring-v6';
mkdirSync(OUT, { recursive: true });
const b64 = p => `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;

const STYLE = `Flat 2D technical-diagram illustration, isometric/blueprint drafting register, in the style of a patent illustration or maintenance-manual engraving. Background: solid flat near-black (#111111), completely flat, no gradients, no vignette, no visible texture or noise. Linework: thin uniform-weight bone-cream outlines (#ECE9DE), precise and engineering-clean, consistent stroke width throughout. Exactly one restrained oxblood/rust accent color (#9A4C42) used as a small solid fill on only one or two elements, never more, never as an outline color elsewhere. Strictly no photorealism, no 3D shading, no soft drop shadows, no color gradients, no legible text, words, letters, or numerals anywhere in the frame (at most a few tiny abstract tick-mark engravings standing in for labels, never actual characters). Generous black negative space around the subject; the subject does not fill the whole frame. Mood: restrained, precise, engraved-technical, machine-and-signal.`;

// two clean figures so the handshake reads without finger-mutation risk:
// a seated interviewer at a desk and a candidate, mid-frame, clasping hands
const PANELS = [
  { id: 'handshake',
    subject: `Two engraved human figures completing a firm handshake across a small desk in a hiring interview: on the left a seated interviewer (simple suit, drawn in the same thin linework) reaching across; on the right a standing candidate reaching to meet the hand; their two hands clasp clearly at the center of the frame; a folder and a small monitor sit on the desk; the single oxblood accent is a small "hired" check-mark badge floating near the clasped hands. Composition: the two figures and desk sit centered with generous black negative space all around; nothing near the frame edges; clean and symmetrical.`,
    motion: `The candidate's hand moves in and clasps the interviewer's hand in a single firm handshake; both figures give a small confident nod; the small oxblood check-mark badge draws itself on beside the clasped hands at the end. Locked-off camera, no camera movement, no other motion.` },
];

const KEEP = 'Preserve the exact engraved patent-illustration style: thin bone-cream linework on flat near-black, single oxblood accent, no new elements, no readable text anywhere, no extra fingers or malformed hands.';
const mode = process.argv[2] ?? '';
const logSpend = (what, usd) => {
  const p = 'output/takes/spend-log.json';
  const log = JSON.parse(readFileSync(p, 'utf8'));
  log.push({ when: '2026-07-14', what, est_cost_usd: +usd.toFixed(2) });
  writeFileSync(p, JSON.stringify(log, null, 2) + '\n');
};

if (mode !== '--anim-only') {
  let spend = 0;
  for (const p of PANELS) {
    const out = `${OUT}/${p.id}.jpg`;
    if (existsSync(out)) { console.log('cached still', p.id); continue; }
    const r = await generateImage({ prompt: `${STYLE}\n\nSubject: ${p.subject}`, outPath: out, aspectRatio: '16:9', log: () => process.stdout.write('.') });
    spend += r?.estCostUsd ?? 0.15; console.log('\nstill', p.id);
  }
  if (spend) logSpend('v6 hiring still (nano-banana-2)', spend);
}
if (mode === '--stills-only') process.exit(0);

let animSpend = 0;
for (const p of PANELS) {
  const out = `${OUT}/${p.id}.mp4`;
  if (existsSync(out)) { console.log('cached anim', p.id); continue; }
  const r = await imageToVideo({ prompt: `${p.motion} ${KEEP}`, imageUrl: b64(`${OUT}/${p.id}.jpg`), seconds: 8, outPath: out, log: () => process.stdout.write('.') });
  animSpend += r?.estCostUsd ?? 0.8; console.log('\nanim', p.id);
}
if (animSpend) logSpend('v6 hiring i2v (veo3.1-fast 8s)', animSpend);
console.log('done');
