// Round-3: regenerate the voice-profile plate + anim as a BALD, FULL-BEARDED
// profile so the 1:09 head primes the "oh, that's him" photo-drop payoff.
// Usage: node --env-file=.env scripts/_gen-voice-mitchell-v6.mjs
const WT = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec';
const { generateImage, imageToVideo } = await import(`${WT}/lib/fal.mjs`);
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const OUT = 'output/takes/e2/anim';
mkdirSync(OUT, { recursive: true });
const PLATE = 'output/takes/e2/anim/voice-mitchell.jpg';
const b64 = p => `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;

const STYLE = `Flat 2D technical-diagram illustration, isometric/blueprint drafting register, in the style of a patent illustration or maintenance-manual engraving. Background: solid flat near-black (#111111), completely flat, no gradients, no vignette, no visible texture or noise. Linework: thin uniform-weight bone-cream outlines (#ECE9DE), precise and engineering-clean, consistent stroke width throughout. Exactly one restrained oxblood/rust accent color (#9A4C42) used as a small solid fill on only one or two elements. Strictly no photorealism, no 3D shading, no gradients, no legible text, words, letters or numerals anywhere. Generous black negative space; the subject does not fill the whole frame. Mood: restrained, precise, engraved-technical.`;

const SUBJECT = `Left-facing profile bust of a COMPLETELY BALD man with a full, neatly-trimmed dark beard and a strong jaw (no hair on top of the head at all, clean shaven scalp), wearing a simple collared shirt, drawn in thin engraved linework; from his open mouth an oxblood waveform ribbon flows forward and to the right, undulating like live speech, passing through a large hexagonal technical frame on the right side of the composition. The single oxblood accent is the waveform ribbon core. Composition: the bald bearded head sits left of center with the waveform reaching right; generous black negative space; nothing near the frame edges.`;

if (!existsSync(PLATE)) {
  const r = await generateImage({ prompt: `${STYLE}\n\nSubject: ${SUBJECT}`, outPath: PLATE, aspectRatio: '16:9', log: () => process.stdout.write('.') });
  console.log('\nplate', r?.estCostUsd ?? 0.15);
}
const VID = `${OUT}/voicewave.mp4`; // overwrite the asset the assembler already reads
const r2 = await imageToVideo({
  prompt: `The oxblood waveform ribbon flows continuously from the bald bearded man's mouth through the hexagonal frame, pulsing and undulating like live speech, the oxblood core shimmering; the man holds still. Preserve the exact engraved patent-illustration style: thin bone-cream linework on flat near-black, single oxblood accent, no new elements, no readable text, bald head stays bald.`,
  imageUrl: b64(PLATE), seconds: 8, outPath: VID, log: () => process.stdout.write('.') });
console.log('\nvoicewave anim', r2?.estCostUsd ?? 0.8);
const log = JSON.parse(readFileSync('output/takes/spend-log.json', 'utf8'));
log.push({ when: '2026-07-14', what: 'v6 voice-profile Mitchell (bald+beard) still + i2v', est_cost_usd: +((r2?.estCostUsd ?? 0.8) + 0.15).toFixed(2) });
writeFileSync('output/takes/spend-log.json', JSON.stringify(log, null, 2) + '\n');
console.log('done');
