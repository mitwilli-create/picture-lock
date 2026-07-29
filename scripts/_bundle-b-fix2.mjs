// Bundle B fix pass 2 (client notes 2026-07-13):
// (a) beat 1 i2v spawned a second can that merges into the seated one; retake
//     the animation from the SAME approved still with a seated-can motion
//     prompt that forbids new objects entering frame.
// (b) "Poured slow, over loud ice" reads wrong; EN beat 3 becomes
//     "Poured slow, over crackling ice." (fresh clone VO + sidecar rekey).
// Usage: node --env-file=.env scripts/_bundle-b-fix2.mjs
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fal = await import(join(ROOT, 'lib/fal.mjs'));
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));
const BROLL = join(ROOT, '.cache/broll');
const VO = join(ROOT, '.cache/vo');
const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw';
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const receipts = { started: new Date().toISOString(), calls: [], costUsd: 0 };

// (a) beat-1 motion retake from the approved still, as a data URI (no re-spend
// on the image, no dependency on an expired fal URL)
const stillPath = join(BROLL, 'beat-1-still.png');
const dataUri = 'data:image/png;base64,' + readFileSync(stillPath).toString('base64');
const MOTION = 'The single slim can stays SEATED in the crushed ice exactly as framed for the entire shot: condensation micro-droplets bead and slip slowly down the matte label, a few ice shards subtly settle and glint, the low-sun flare drifts gently across the crisp MERIDIEM label which stays fully legible, slow confident push-in. No new objects enter the frame, no second can, no hands, nothing descends from above, the composition only tightens.';
const tmp = join(BROLL, 'beat-1.new.mp4');
const vid = await fal.imageToVideo({ prompt: MOTION, imageUrl: dataUri, seconds: 4, outPath: tmp, log: console.log });
let n = 1;
while (existsSync(join(BROLL, `beat-1.take${n}.mp4`))) n++;
renameSync(join(BROLL, 'beat-1.mp4'), join(BROLL, `beat-1.take${n}.mp4`));
renameSync(tmp, join(BROLL, 'beat-1.mp4'));
receipts.calls.push({ stage: 'beat1-motion-retake', note: 'second-can merge artifact; seated-can motion, no-new-objects pin', requestId: vid.requestId, costUsd: vid.estCostUsd });
receipts.costUsd += vid.estCostUsd;
console.log(`✓ beat-1 animation retaken $${vid.estCostUsd}`);

// (b) EN beat-3 copy change + fresh VO, pipeline-compatible sidecar rekey
const NEW_LINE = 'Poured slow, over crackling ice.';
const voPath = join(VO, 'beat-3.mp3');
writeFileSync(voPath, await el.tts({ text: NEW_LINE, voiceId: VOICE_ID }));
const voCost = (NEW_LINE.length / 1000) * 0.10;
writeFileSync(join(VO, 'beat-3.json'), JSON.stringify({ textHash: hash(`${VOICE_ID}:${NEW_LINE}`), costUsd: voCost, createdAt: new Date().toISOString() }));
receipts.calls.push({ stage: 'voiceover', beat: 3, text: NEW_LINE, costUsd: voCost });
receipts.costUsd += voCost;
console.log(`✓ EN beat-3 VO regenerated (${NEW_LINE.length} chars)`);

// re-render the affected EN beats (new clip for 1, new VO for 3)
for (const [i, seconds] of [[1, 4], [3, 3.5]]) {
  const r = fx.renderBeat({ index: i, seconds, voPath: join(VO, `beat-${i}.mp3`), clipPath: join(BROLL, `beat-${i}.mp4`), visualMode: 'gen', cacheDir: join(ROOT, '.cache/beat') });
  console.log(`✓ EN beat-${i} re-rendered ${r.dur.toFixed(2)}s`);
}

receipts.finished = new Date().toISOString();
receipts.costUsd = +receipts.costUsd.toFixed(4);
writeFileSync(join(ROOT, 'output/bundles/bundle-b/receipts/fix2-manifest.json'), JSON.stringify(receipts, null, 2));
console.log(`✓ fix pass 2 spend $${receipts.costUsd}`);
