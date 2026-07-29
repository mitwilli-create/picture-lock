// Bundle B v3 shot generation: NAMED shots (no beat-index coupling).
// Generates into .cache/bundle-b/v3/shots/: cordoba-wide, rooftop-light,
// pour (6s, fixed can-into-glass), resolution, endcard (nano still + i2v),
// party-toast-<mkt> and party-photos-<mkt> for 7 markets, plus the cheer and
// bell SFX. product-hero is copied from the accepted v2 take. Resumable:
// every generation has a sidecar keyed by its prompt.
// Usage: node --env-file=.env scripts/_bundle-b-shots-v3.mjs
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fal = await import(join(ROOT, 'lib/fal.mjs'));
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));
const SHOTS = join(ROOT, '.cache/bundle-b/v3/shots');
const STEMS = join(ROOT, '.cache/bundle-b/stems-v2');
mkdirSync(SHOTS, { recursive: true });
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const receipts = { started: new Date().toISOString(), calls: [], costUsd: 0 };
const failures = [];
const log = console.log;

const STYLE = 'naturalistic golden-hour palette, amber highlights, honest neutral midtones, believable observed low-sun light, never orange-crushed advertising saturation';
const NO_MARKS = 'strictly no logos, no crests, no badges, no lettering or numbers anywhere on the shirts or scarves';
const KIT = {
  es: 'plain vivid red football jerseys with yellow collar trim, red and yellow scarves',
  en: 'plain white football jerseys with red collar trim, red and white scarves',
  de: 'plain white football jerseys with a black, red and gold chest band, black-red-gold scarves',
  nl: 'plain bright orange football jerseys, orange scarves',
  fr: 'plain deep blue football jerseys, blue-white-red scarves',
  pt: 'plain deep red football jerseys with green collar trim, red and green scarves',
  it: 'plain azure blue football jerseys, azure scarves',
};

const LIVE = {
  'cordoba-wide': { seconds: 4, prompt: `Vertical 9:16 aerial at golden hour: the Roman bridge of Cordoba over the Guadalquivir river leading toward the Mezquita bell tower in warm silhouette, swifts circling in an amber sky, the river glittering with low sun, white and ochre facades glowing, slow confident aerial push-in along the bridge, ${STYLE}` },
  'rooftop-light': { seconds: 4, prompt: `Vertical 9:16, low golden sun sliding across white and ochre Cordoba rooftops: striped awnings, blue and white azulejo tiles catching warm light, laundry moving gently on a line, swifts passing, slow lateral camera drift, ${STYLE}` },
  'pour': { seconds: 6, prompt: `Vertical 9:16 slow-motion beverage shot: a hand tilts a slim matte cream-and-gold ALUMINUM CAN and pours a clean arc of pale gold white wine DOWN from the can's drinking opening INTO a stemmed wine glass below, fine bubbles rising inside the glass bowl as it fills, condensation beading on the matte can and the glass, backlit by low sun through a row of Moorish horseshoe arches in soft bokeh, there is NO BOTTLE anywhere in the frame, the only vessel pouring is the aluminum can, ${STYLE}` },
  'resolution': { seconds: 4, prompt: `Vertical 9:16 quiet closing shot: two stemmed wine glasses filled with PALE STRAW-GOLD white wine, clearly light-colored and translucent with the low sun glowing THROUGH the pale liquid, beside a slim matte cream-and-gold can angled softly away so its label is implied not readable, resting together on a rooftop ledge as the last sun sinks behind the bell tower skyline of Cordoba, light going honey-colored, very slow push-in, calm and settled, ${STYLE}` },
};
for (const mkt of Object.keys(KIT)) {
  LIVE[`party-toast-${mkt}`] = { seconds: 4, prompt: `Vertical 9:16, handheld golden-hour energy on a Cordoba rooftop terrace: a group of friends wearing ${KIT[mkt]} (${NO_MARKS}) all facing a big match on a screen just off-frame to the right, leaning in, watching intently, then ERUPTING together as a goal lands: leaping up, arms thrown high, cheering, stemmed glasses of pale gold white wine raised in a toast, genuine laughter and one-armed hugs, warm rim light on faces turned toward the unseen screen, the bell tower and golden stone skyline of Cordoba softly silhouetted behind them, ${STYLE}` };
  LIVE[`party-photos-${mkt}`] = { seconds: 4, prompt: `Vertical 9:16, candid action-reaction intercut on the same Cordoba rooftop at golden hour: one friend taking phone photos of two others wearing ${KIT[mkt]} (${NO_MARKS}) as they pose then crack up laughing, a PLAIN SOLID-COLOR scarf with absolutely no letters, no words, no numbers and no symbols of any kind waved overhead, stemmed wine glasses catching the last sun on the azulejo-tiled parapet, the Cordoba skyline glowing warm behind, documentary energy, ${STYLE}` };
}
// fal's content checker flagged the "candid ... taking phone photos of others"
// framing on some markets (422 content_policy_violation, stochastic). Shots
// not yet on disk get explicitly camera-aware, consensual wording; completed
// shots keep the original prompt so their cache keys stand and never re-bill.
for (const mkt of Object.keys(KIT)) {
  const name = `party-photos-${mkt}`;
  const deflagged = { seconds: 4, prompt: `Vertical 9:16, a joyful group photo moment on the same Cordoba rooftop at golden hour: one friend holds a phone up high while two friends wearing ${KIT[mkt]} (${NO_MARKS}) pose arm in arm, laughing and waving happily at the camera, a PLAIN SOLID-COLOR scarf with absolutely no letters, no words, no numbers and no symbols of any kind waved overhead, stemmed wine glasses catching the last sun on the azulejo-tiled parapet, the Cordoba skyline glowing warm behind, warm handheld energy, ${STYLE}` };
  // keep whichever prompt the existing sidecar was generated with; anything
  // still to generate uses the deflagged wording
  let side = null;
  try { side = JSON.parse(readFileSync(join(SHOTS, `${name}.mp4.json`), 'utf8')); } catch {}
  if (side?.key !== hash(`${LIVE[name].prompt}:${LIVE[name].seconds}`)) LIVE[name] = deflagged;
}
// FR/IT compliance tier (client-approved 2026-07-13): alcohol-and-sport
// association is prohibited under Loi Evin and restricted in Italy, so these
// two markets get a sport-free lifestyle tier: neutral warm summer wardrobe,
// no match, no kit, no scarves. Copy drops the match line in these markets.
const NEUTRAL_WARDROBE = 'relaxed warm-toned summer clothing, linen shirts and light summer dresses in terracotta, cream and olive, absolutely no sportswear, no jerseys, no scarves, no team colors';
for (const mkt of ['fr', 'it']) {
  LIVE[`party-toast-${mkt}`] = { seconds: 4, prompt: `Vertical 9:16, handheld golden-hour energy on a Cordoba rooftop terrace: a group of friends in ${NEUTRAL_WARDROBE}, rising together in easy laughter for a toast with stemmed glasses of pale gold white wine, warm rim light on faces, one-armed hugs, the bell tower and golden stone skyline of Cordoba softly silhouetted behind them, ${STYLE}` };
  LIVE[`party-photos-${mkt}`] = { seconds: 4, prompt: `Vertical 9:16, a joyful group photo moment on the same Cordoba rooftop at golden hour: one friend holds a phone up high while two friends in ${NEUTRAL_WARDROBE} pose arm in arm, laughing and waving happily at the camera, stemmed wine glasses catching the last sun on the azulejo-tiled parapet, the Cordoba skyline glowing warm behind, warm handheld energy, ${STYLE}` };
}
// wine-color pin, FR photos retake (2026-07-13, publication-lane QC): the
// neutral-tier photos prompt left the wine color unpinned and the FR take
// rendered dark red wine in a white-wine spot (the review board's known
// major class). Pin FR to pale gold; IT's existing take is clean, so its
// prompt and cache key stay untouched. Defective take kept as
// party-photos-fr.redwine-take.mp4.
LIVE['party-photos-fr'].prompt = LIVE['party-photos-fr'].prompt.replace(
  'stemmed wine glasses catching the last sun',
  'stemmed glasses of clearly PALE STRAW-GOLD white wine, light-colored and translucent with the low sun glowing through the pale liquid, catching the last sun');

// alignment-audit fixes (2026-07-13, receipts/alignment-audit.md): per-shot
// prompt overrides AFTER all template/swap logic so only these six cache keys
// change. Defective takes archived beside each shot before regen.
// D1: resolution can was a hallucinated different SKU (persona-review blocker);
// can now turned fully away, label unprintable, wine color pinned.
const WINE_PIN = 'stemmed glasses of clearly PALE STRAW-GOLD white wine, light-colored and translucent with the low sun glowing through the pale liquid';
LIVE['resolution'].prompt = `Vertical 9:16 quiet closing shot: two stemmed wine glasses filled with PALE STRAW-GOLD white wine, clearly light-colored and translucent with the low sun glowing THROUGH the pale liquid, beside a slim matte cream-and-gold aluminum can seen only from its plain unprinted back, the can turned fully away from camera so absolutely no label, no text, no lettering, no logos and no emblems of any kind are visible on it, resting together on a rooftop ledge as the last sun sinks behind the bell tower skyline of Cordoba, light going honey-colored, very slow push-in, calm and settled, no new objects enter the frame, ${STYLE}`;
// Round 2 (same day): negative scarf prompts failed twice, Veo keeps painting
// crests/crosses/lettering onto fan scarves. Per the signage-exclusion
// principle, physically remove the prop instead of prohibiting its decoration:
// no scarves in the photos beats at all (FR/IT neutral photos are clean and
// scarf-free already), and DE toast goes blank-apparel with no scarves.
for (const mkt of ['es', 'de', 'pt', 'nl']) {
  // D2-D4, D6: red wine and marked scarves recurred in these four markets
  LIVE[`party-photos-${mkt}`] = { seconds: 4, prompt: `Vertical 9:16, a joyful group photo moment on the same Cordoba rooftop at golden hour: one friend holds a phone up high while two friends wearing ${KIT[mkt].split(',')[0]} (${NO_MARKS}) pose arm in arm, laughing and waving happily at the camera, no scarves and no banners anywhere in the frame, ${WINE_PIN} catching the last sun on the azulejo-tiled parapet, the Cordoba skyline glowing warm behind, warm handheld energy, ${STYLE}` };
}
// Round 3: the round-2 DE and NL photos takes grew adidas trade dress (logo +
// crest on DE, shoulder stripes on NL). The blank-apparel wording below fixed
// the DE toast on its first try; apply it to both photos kits.
const BLANK_APPAREL = 'fresh blank apparel with absolutely no logos, no brand marks, no sportswear branding, no crests, no badges, no stripes on the shoulders and no lettering of any kind';
// (KIT.de contains a comma inside the band phrase, so the round-2 loop's
// split(',')[0] truncated the DE kit to 'plain white football jerseys with a
// black' — override the DE prompt wholesale instead of string-replacing)
LIVE['party-photos-de'] = { seconds: 4, prompt: `Vertical 9:16, a joyful group photo moment on the same Cordoba rooftop at golden hour: one friend holds a phone up high while two friends wearing plain white unprinted cotton football shirts with one simple horizontal black, red and gold band across the chest, ${BLANK_APPAREL} (${NO_MARKS}), pose arm in arm, laughing and waving happily at the camera, no scarves and no banners anywhere in the frame, ${WINE_PIN} catching the last sun on the azulejo-tiled parapet, the Cordoba skyline glowing warm behind, warm handheld energy, ${STYLE}` };
LIVE['party-photos-nl'].prompt = LIVE['party-photos-nl'].prompt.replace(
  'plain bright orange football jerseys',
  `plain bright orange unprinted cotton football shirts, ${BLANK_APPAREL}`);
// D5: DE toast had a crested scarf, a bottle-shaped prop and a disembodied
// arm; round-1 retake grew adidas branding and a club crest instead
LIVE['party-toast-de'] = { seconds: 4, prompt: `Vertical 9:16, handheld golden-hour energy on a Cordoba rooftop terrace: a group of friends wearing plain white unprinted cotton football shirts with one simple horizontal black, red and gold band across the chest, fresh blank apparel with absolutely no logos, no brand marks, no sportswear branding, no crests, no badges, no stripes on the shoulders and no lettering of any kind, no scarves anywhere in the frame, all facing a big match on a screen just off-frame to the right, leaning in, watching intently, then ERUPTING together as a goal lands: leaping up, arms thrown high, cheering, ${WINE_PIN} raised in a toast, absolutely no bottles anywhere in the frame, the only drink vessels are slim aluminum cans and stemmed wine glasses, every visible hand and arm belongs to a person clearly visible in the frame, genuine laughter and one-armed hugs, warm rim light on faces turned toward the unseen screen, the bell tower and golden stone skyline of Cordoba softly silhouetted behind them, ${STYLE}` };

async function genLive(name, spec, _retry = true) {
  const out = join(SHOTS, `${name}.mp4`);
  const side = out + '.json';
  const key = hash(`${spec.prompt}:${spec.seconds}`);
  let cached = null;
  try { cached = JSON.parse(readFileSync(side, 'utf8')); } catch {}
  if (cached?.key === key && existsSync(out)) { log(`  [${name}] cached`); return; }
  const tmp = out + '.new.mp4';
  let r;
  try {
    r = await fal.generateClip({ prompt: spec.prompt, seconds: spec.seconds, outPath: tmp, log });
  } catch (e) {
    const msg = String(e.message);
    // the content checker is stochastic: identical prompts pass on resubmit
    if (_retry && /timed out|content_policy/.test(msg)) {
      log(`  ! ${name} ${/content_policy/.test(msg) ? 'content-flag (stochastic)' : 'queue timeout'}, resubmitting once`);
      return genLive(name, spec, false);
    }
    // one bad shot must not sink the batch; record and continue
    log(`  ✗ ${name} FAILED: ${msg.slice(0, 140)}`);
    receipts.calls.push({ stage: 'shot', name, error: msg.slice(0, 140) });
    failures.push(name);
    return;
  }
  renameSync(tmp, out);
  writeFileSync(side, JSON.stringify({ key, name }));
  receipts.calls.push({ stage: 'shot', name, requestId: r.requestId, costUsd: r.estCostUsd });
  receipts.costUsd += r.estCostUsd;
  log(`  ✓ ${name} $${r.estCostUsd}`);
}

// projection
const todo = Object.entries(LIVE).filter(([n, s]) => {
  try { return JSON.parse(readFileSync(join(SHOTS, `${n}.mp4.json`), 'utf8')).key !== hash(`${s.prompt}:${s.seconds}`); } catch { return true; }
});
log(`shots to generate: ${todo.length} live (~$${todo.reduce((a, [, s]) => a + fal.estimateCost('fal-ai/veo3.1/fast', s.seconds), 0).toFixed(2)}) + endcard ($0.48 if missing)`);

// product-hero: the accepted v2 animated take, reused
const ph = join(SHOTS, 'product-hero.mp4');
if (!existsSync(ph)) { copyFileSync(join(ROOT, '.cache/broll/beat-1.mp4'), ph); log('  [product-hero] copied from accepted v2 take'); }

// live shots, two at a time (queue courtesy)
const names = Object.keys(LIVE);
for (let i = 0; i < names.length; i += 2) {
  await Promise.all(names.slice(i, i + 2).map((n) => genLive(n, LIVE[n])));
}

// endcard: nano banana still (legible type) animated
const ec = join(SHOTS, 'endcard.mp4');
const ecSide = ec + '.json';
if (!existsSync(ec) || !existsSync(ecSide)) {
  const still = join(SHOTS, 'endcard-still.png');
  const img = await fal.generateImage({ prompt: `Vertical 9:16 designed photographic end card: a slim matte cream-and-gold can with crisp legible label 'MERIDIEM' and sub-line 'VINO BLANCO DE ESPANA' beside a filled stemmed glass of pale gold white wine on a rooftop ledge in warm amber golden-hour light, clean elegant type set beneath them reading 'MERIDIEM' and the tagline 'Disfruta la hora dorada', the Mezquita bell tower of Cordoba as a soft distant silhouette, fine dust motes in a shaft of light, ${STYLE}`, outPath: still, log });
  const tmp = join(SHOTS, 'endcard.new.mp4');
  const vid = await fal.imageToVideo({ prompt: 'dust motes drift through the light shaft, condensation beads slip slowly down the glass, the warm light breathes gently, slow subtle push-in, all type stays crisp and perfectly legible, no new objects enter the frame', imageUrl: img.url, seconds: 4, outPath: tmp, log });
  renameSync(tmp, ec);
  writeFileSync(ecSide, JSON.stringify({ name: 'endcard' }));
  receipts.calls.push({ stage: 'shot', name: 'endcard', requestId: vid.requestId, costUsd: +(img.estCostUsd + vid.estCostUsd).toFixed(2) });
  receipts.costUsd += img.estCostUsd + vid.estCostUsd;
  log(`  ✓ endcard $${(img.estCostUsd + vid.estCostUsd).toFixed(2)}`);
} else log('  [endcard] cached');

// SFX: goal cheer + distant bell (ElevenLabs)
for (const [file, text, dur] of [
  ['sfx-cheer.mp3', 'a small rooftop crowd of friends erupting in a goal cheer that melts into laughter, one clear clink of thin wine glasses in the middle of it, open-air evening acoustic with natural decay, warm, rounded, no whistles, no harsh highs', 2.8],
  ['sfx-bell.mp3', 'a single distant church bell toll across a quiet spanish city at dusk, very far away, soft, warm, long natural decay, no other sounds', 3.0],
]) {
  const p = join(STEMS, file);
  if (existsSync(p)) { log(`  [${file}] cached`); continue; }
  writeFileSync(p, await el.soundEffect({ text, durationSeconds: dur }));
  if (fx.highBandGapDb(p) < 8) fx.lowpassAudio(p, 4200);
  receipts.calls.push({ stage: 'sfx', file, costUsd: +(dur / 60 * 0.12).toFixed(4) });
  receipts.costUsd += dur / 60 * 0.12;
  log(`  ✓ ${file}`);
}

receipts.finished = new Date().toISOString();
receipts.costUsd = +receipts.costUsd.toFixed(4);
writeFileSync(join(ROOT, 'output/bundles/bundle-b/receipts/shots-v3-manifest.json'), JSON.stringify(receipts, null, 2));
log(`\n✓ shots v3 complete, fresh spend $${receipts.costUsd}`);
if (failures.length) { console.error(`shots still missing after retries: ${failures.join(', ')} — rerun this script`); process.exit(1); }
