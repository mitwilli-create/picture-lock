// Explainer v4 animation assets: the site's own illustrations FULLY animated
// via Veo image-to-video (Mitchell: "fully animated cartoon", "no static
// illustrations"), plus the busy-newsroom vérité shot. ~$3.20.
// Usage: node --env-file=.env scripts/_gen-anim-assets.mjs
const { imageToVideo, generateClip } = await import('/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec/lib/fal.mjs');
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const OUT = 'output/takes/e2/anim';
mkdirSync(OUT, { recursive: true });
const b64 = p => `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;
const SITE = `${process.env.HOME}/Documents/storytellermitch-site/assets`;
const KEEP = 'Preserve the exact engraved patent-illustration style: thin bone-cream linework on flat near-black, single oxblood accent, no new elements, no camera movement, no readable text.';

const I2V = [
  { id: 'rolodex',  img: 'output/takes/e/plates/portfolio-stack-c1.jpg',
    p: `The fanned stack of glossy cards slowly topples further, individual cards flipping and sliding over each other like a rolodex; the receipt on the spike sways gently. ${KEEP}` },
  { id: 'machine',  img: `${SITE}/stills/illo-picture-lock-machine-hd.jpg`,
    p: `The script page feeds steadily into the machine, the interior cogs and gears all turn continuously, the small phone screen flickers as it plays a film, and the receipt scrolls out printing line by line. ${KEEP}` },
  { id: 'voicewave', img: 'output/takes/e/plates/voice-profile-c1.jpg',
    p: `The waveform ribbon flows continuously from the mouth through the hexagonal frame, pulsing and undulating like live speech, the oxblood core shimmering. ${KEEP}` },
];
let spend = 0;
for (const a of I2V) {
  const out = `${OUT}/${a.id}.mp4`;
  if (existsSync(out)) { console.log('cached', a.id); continue; }
  const r = await imageToVideo({ prompt: a.p, imageUrl: b64(a.img), seconds: 8, outPath: out, log: () => process.stdout.write('.') });
  spend += r.estCostUsd ?? 0.8;
  console.log('\ni2v', a.id, `$${(r.estCostUsd ?? 0.8).toFixed(2)}`);
}
const nOut = `${OUT}/newsroom.mp4`;
if (!existsSync(nOut)) {
  const r = await generateClip({
    prompt: 'Busy digital newsroom, handheld documentary vérité: rows of producers working at monitors, a large video wall with multiple live news feeds, an assignment desk with editors talking, a reporter filming a standup under a small light in the background, natural office lighting, cinematic shallow depth of field, no readable text anywhere.',
    seconds: 6, outPath: nOut, log: () => process.stdout.write('.') });
  spend += r.estCostUsd ?? 0.6;
  console.log('\nnewsroom', `$${(r.estCostUsd ?? 0.6).toFixed(2)}`);
}
const log = JSON.parse(readFileSync('output/takes/spend-log.json', 'utf8'));
log.push({ when: '2026-07-13', what: 'explainer v4 anim assets (3 i2v site illustrations + newsroom shot)', est_cost_usd: +spend.toFixed(2) });
writeFileSync('output/takes/spend-log.json', JSON.stringify(log, null, 2) + '\n');
console.log('done $' + spend.toFixed(2));
