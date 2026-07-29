// v9: bald+bearded head (v7) but the v6-STYLE engraved waveform Mitchell loves —
// a dramatic bright central SPIKE with a glowing lens-flare core, fine technical
// annotation marks, through a hexagonal frame. Overwrites voicewave.mp4.
const WT = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec';
const { generateImage, imageToVideo } = await import(`${WT}/lib/fal.mjs`);
import { readFileSync, writeFileSync, existsSync } from 'fs';
const PLATE = 'output/takes/e2/anim/voice-mitchell.jpg';
const b64 = p => `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;
const STYLE = `Flat 2D technical-diagram illustration, patent/maintenance-manual engraving register. Background solid flat near-black (#111111), no gradients or texture. Linework thin uniform bone-cream (#ECE9DE) outlines, precise and engineering-clean. Exactly one oxblood/rust accent (#9A4C42). No photorealism, no 3D shading, no readable text/letters/numerals (only tiny abstract tick-mark engravings). Generous black negative space.`;
const SUBJECT = `Left-facing profile of a COMPLETELY BALD man with a full neatly-trimmed dark beard and strong jaw (clean shaven scalp, no hair on top), simple collar, thin engraved linework. From his open mouth an intricate ENGRAVED OXBLOOD VOICE WAVEFORM erupts to the right: NOT a smooth blob but a dramatic detailed waveform with a single TALL SHARP CENTRAL SPIKE and a bright glowing lens-flare core at that spike, jagged detailed oscillation lines fanning out before and after it, the whole waveform threaded through a large hexagonal technical frame on the right. Around the waveform, fine engraved technical annotations: thin dimension lines, small circle nodes, tiny schematic tick-marks, like a patent diagram of a voiceprint. The single oxblood accent is the waveform + its glowing core. Composition: bald bearded head left-of-center, the detailed waveform and hexagon filling the right; generous black negative space; nothing at the frame edges.`;
if (!existsSync(PLATE)) { const r = await generateImage({ prompt: `${STYLE}\n\nSubject: ${SUBJECT}`, outPath: PLATE, aspectRatio: '16:9', log: () => process.stdout.write('.') }); console.log('\nplate', r?.estCostUsd ?? 0.15); }
const out='output/takes/e2/anim/voicewave.mp4';
const r3 = await imageToVideo({ prompt: `The intricate engraved oxblood waveform oscillates and pulses continuously from the bald bearded man's mouth through the hexagonal frame, the tall central spike shimmering and its glowing core flaring like live speech; the man holds still, bald head stays bald. Preserve the engraved patent style, single oxblood accent, no readable text.`, imageUrl: b64(PLATE), seconds: 8, outPath: out, log: () => process.stdout.write('.') });
console.log('\nvoicewave', r3?.estCostUsd ?? 0.8);
const log = JSON.parse(readFileSync('output/takes/spend-log.json','utf8'));
log.push({when:'2026-07-14',what:'v9 voice plate (bald head + v6-style engraved spike waveform) + i2v',est_cost_usd:+((r3?.estCostUsd??0.8)+0.15).toFixed(2)});
writeFileSync('output/takes/spend-log.json',JSON.stringify(log,null,2)+'\n');
console.log('done');
