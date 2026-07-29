// Bundle B: retake beat 1's still+animate with an explicit NON-ALCOHOLIC label
// spec. The accepted take hallucinated "5.3% ALC/VOL" onto the can, which
// silently turns the demo into an alcohol ad (a Loi Evin problem for the FR
// market kit). Keeps the council's composition; only the label copy is pinned.
// Usage: node --env-file=.env scripts/_bundle-b-fix-beat1.mjs
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fal = await import(join(ROOT, 'lib/fal.mjs'));
const BROLL = join(ROOT, '.cache/broll');

const brief = JSON.parse(readFileSync(join(ROOT, '.cache/script-brief.json'), 'utf8'));
const shot = brief.shots.find((s) => s.beat === 1);
const LABEL_PIN = " The can is a NON-ALCOHOLIC botanical soft drink: the label carries ONLY the wordmark 'MERIDIEM', the sub-line 'SPARKLING BOTANICALS', and a small '250 ml' mark. Absolutely no alcohol percentage, no 'ALC/VOL', no 'ABV', no proof statement, no warning text anywhere on the can.";

const still = join(BROLL, 'beat-1-still.png');
const img = await fal.generateImage({ prompt: shot.stillPrompt + LABEL_PIN, outPath: still, log: console.log });
console.log(`still $${img.estCostUsd}`);
const tmp = join(BROLL, 'beat-1.new.mp4');
const vid = await fal.imageToVideo({ prompt: shot.motionPrompt, imageUrl: img.url, seconds: 4, outPath: tmp, log: console.log });
// keep the flawed take as evidence, then swap in the fix
let n = 1;
while (existsSync(join(BROLL, `beat-1.take${n}.mp4`))) n++;
renameSync(join(BROLL, 'beat-1.mp4'), join(BROLL, `beat-1.take${n}.mp4`));
renameSync(tmp, join(BROLL, 'beat-1.mp4'));
const side = join(BROLL, 'beat-1.json');
const sc = JSON.parse(readFileSync(side, 'utf8'));
sc.labelFix = { note: 'non-alcoholic label pin (5.3% ALC/VOL hallucination retake)', estCostUsd: +(img.estCostUsd + vid.estCostUsd).toFixed(2), requestId: vid.requestId, createdAt: new Date().toISOString() };
writeFileSync(side, JSON.stringify(sc, null, 2));
console.log(`✓ beat-1 retaken, total $${(img.estCostUsd + vid.estCostUsd).toFixed(2)}`);
