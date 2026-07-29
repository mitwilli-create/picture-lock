// Bundle B: Cordoba + World Cup jerseys pass (client notes 2026-07-13).
// Regenerates: beat 0 establishing (Cordoba Roman bridge + Mezquita), beat 5
// end card (Cordoba silhouette), and the two party beats (idx 3 toast-cheer,
// idx 4 photos) PER MARKET with that market's plain crest-free jerseys.
// Also: goal-cheer SFX and the new ES match-night VO line.
// Rights care: plain solid-color kit, "no logos, no crests, no lettering",
// generic match night, never named competitions.
//
// Usage: node --env-file=.env scripts/_bundle-b-jerseys.mjs [--only es,en,...]
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fal = await import(join(ROOT, 'lib/fal.mjs'));
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));
const BROLL = join(ROOT, '.cache/broll');
const CLIPS = join(ROOT, '.cache/bundle-b/v2/clips');
const STEMS = join(ROOT, '.cache/bundle-b/stems-v2');
mkdirSync(CLIPS, { recursive: true });
const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw';
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const receipts = { started: new Date().toISOString(), calls: [], costUsd: 0 };
const log = console.log;

const KIT = {
  es: 'plain vivid red football jerseys with yellow collar trim, red and yellow scarves',
  en: 'plain white football jerseys with red collar trim, red and white scarves',
  de: 'plain white football jerseys with a black, red and gold chest band, black-red-gold scarves',
  nl: 'plain bright orange football jerseys, orange scarves',
  fr: 'plain deep blue football jerseys, blue-white-red scarves',
  pt: 'plain deep red football jerseys with green collar trim, red and green scarves',
  it: 'plain azure blue football jerseys, azure scarves',
};
const NO_MARKS = 'strictly no logos, no crests, no badges, no lettering or numbers anywhere on the shirts or scarves';
const STYLE = 'naturalistic golden-hour palette, amber highlights, honest neutral midtones, believable observed low-sun light, never orange-crushed advertising saturation';

const beat3 = (kit) => `Vertical 9:16, handheld golden-hour energy on a Cordoba rooftop terrace: a group of friends wearing ${kit} (${NO_MARKS}) erupting together in a cheering toast with stemmed glasses of pale gold white wine as a goal lands off-screen, genuine laughter and one-armed hugs, warm rim light on faces, the Mezquita bell tower and the golden stone skyline of Cordoba softly silhouetted behind them, ${STYLE}`;
const beat4 = (kit) => `Vertical 9:16, candid action-reaction intercut on the same Cordoba rooftop at golden hour: one friend taking phone photos of two others wearing ${kit} (${NO_MARKS}) as they pose then crack up laughing, a scarf waved overhead, stemmed wine glasses catching the last sun on the azulejo-tiled parapet, the Cordoba skyline glowing warm behind, documentary energy, ${STYLE}`;

async function genLive(prompt, outPath, label, _retry = true) {
  const tmp = outPath + '.new.mp4';
  let r;
  try {
    r = await fal.generateClip({ prompt, seconds: 4, outPath: tmp, log });
  } catch (e) {
    // fal queue congestion: one resubmit before giving up
    if (!_retry || !/timed out/.test(String(e.message))) throw e;
    log(`  ! ${label} queue timeout, resubmitting once`);
    return genLive(prompt, outPath, label, false);
  }
  renameSync(tmp, outPath);
  receipts.calls.push({ stage: 'jersey-visuals', label, requestId: r.requestId, costUsd: r.estCostUsd });
  receipts.costUsd += r.estCostUsd;
  log(`  ✓ ${label} $${r.estCostUsd}`);
}
// keep prior takes as evidence; only called AFTER a replacement succeeds
const keepTake = (mp4) => { const p = mp4.replace(/\.mp4$/, ''); let n = 1; while (existsSync(`${p}.take${n}.mp4`)) n++; if (existsSync(mp4)) renameSync(mp4, `${p}.take${n}.mp4`); };

const onlyArg = process.argv.indexOf('--only');
const markets = onlyArg >= 0 ? process.argv[onlyArg + 1].split(',') : Object.keys(KIT);

// [1] shared Cordoba beats (skip if already done on a rerun)
const b0 = join(BROLL, 'beat-0.mp4');
const b0Mark = join(BROLL, 'beat-0.cordoba.json');
if (!existsSync(b0Mark)) {
  const stash = join(BROLL, 'beat-0.cordoba.new.mp4');
  await genLive('Vertical 9:16 aerial at golden hour: the Roman bridge of Cordoba over the Guadalquivir river leading toward the Mezquita bell tower in warm silhouette, swifts circling in an amber sky, the river glittering with low sun, white and ochre facades glowing, slow confident aerial push-in along the bridge, ' + STYLE, stash, 'beat-0 cordoba');
  keepTake(b0);
  renameSync(stash, b0);
  writeFileSync(b0Mark, JSON.stringify({ note: 'cordoba establishing replaces sevilla take', createdAt: new Date().toISOString() }));
}
const b5 = join(BROLL, 'beat-5.mp4');
const b5Mark = join(BROLL, 'beat-5.cordoba.json');
if (!existsSync(b5Mark)) {
  const still = join(BROLL, 'beat-5-still-cordoba.png');
  const img = await fal.generateImage({ prompt: `Vertical 9:16 designed photographic end card: a slim matte cream-and-gold can with crisp legible label 'MERIDIEM' and sub-line 'VINO BLANCO DE ESPANA' beside a filled stemmed glass of pale gold white wine on a rooftop ledge in warm amber golden-hour light, clean elegant type set beneath them reading 'MERIDIEM' and the tagline 'Disfruta la hora dorada', the Mezquita bell tower of Cordoba as a soft distant silhouette, fine dust motes in a shaft of light, ${STYLE}`, outPath: still, log });
  receipts.calls.push({ stage: 'jersey-visuals', label: 'beat-5 still cordoba', costUsd: img.estCostUsd });
  receipts.costUsd += img.estCostUsd;
  const tmp = join(BROLL, 'beat-5.new.mp4');
  const vid = await fal.imageToVideo({ prompt: 'dust motes drift through the light shaft, condensation beads slip slowly down the glass, the warm light breathes gently, slow subtle push-in, all type stays crisp and perfectly legible, no new objects enter the frame', imageUrl: img.url, seconds: 4, outPath: tmp, log });
  keepTake(b5);
  renameSync(tmp, b5);
  receipts.calls.push({ stage: 'jersey-visuals', label: 'beat-5 animate cordoba', requestId: vid.requestId, costUsd: vid.estCostUsd });
  receipts.costUsd += vid.estCostUsd;
  writeFileSync(b5Mark, JSON.stringify({ note: 'cordoba end card replaces sevilla take', createdAt: new Date().toISOString() }));
  log(`  ✓ beat-5 cordoba end card $${(img.estCostUsd + vid.estCostUsd).toFixed(2)}`);
}

// [2] per-market party beats (parallel per market, cached by kit-prompt hash)
for (const mkt of markets) {
  const kit = KIT[mkt];
  const jobs = [];
  for (const [i, promptFn] of [[3, beat3], [4, beat4]]) {
    const out = join(CLIPS, `beat-${i}-${mkt}.mp4`);
    const side = out + '.json';
    const key = hash(promptFn(kit));
    let cached = null;
    try { cached = JSON.parse(readFileSync(side, 'utf8')); } catch {}
    if (cached?.key === key && existsSync(out)) { log(`  [${mkt} beat-${i}] cached`); continue; }
    jobs.push(genLive(promptFn(kit), out, `${mkt} beat-${i}`).then(() => writeFileSync(side, JSON.stringify({ key, market: mkt }))));
  }
  await Promise.all(jobs);
}

// [3] goal-cheer SFX for the match-night beat
const cheer = join(STEMS, 'sfx-cheer.mp3');
if (!existsSync(cheer)) {
  writeFileSync(cheer, await el.soundEffect({ text: 'a small rooftop crowd of friends erupting in a goal cheer that melts into laughter, one clear clink of thin wine glasses in the middle of it, open-air evening acoustic with natural decay, warm, rounded, no whistles, no harsh highs', durationSeconds: 2.8 }));
  if (fx.highBandGapDb(cheer) < 8) fx.lowpassAudio(cheer, 4200);
  receipts.calls.push({ stage: 'sfx', label: 'goal-cheer', costUsd: 0.0056 });
  receipts.costUsd += 0.0056;
  log('  ✓ goal-cheer sfx');
}

// [4] new ES match-night VO line (pipeline cache rekeyed)
const NEW_ES = 'Hecho para las noches de partido en la azotea,';
const voPath = join(ROOT, '.cache/vo/beat-3.mp3');
const voSide = join(ROOT, '.cache/vo/beat-3.json');
let vo = null;
try { vo = JSON.parse(readFileSync(voSide, 'utf8')); } catch {}
if (vo?.textHash !== hash(`${VOICE_ID}:${NEW_ES}`)) {
  writeFileSync(voPath, await el.tts({ text: NEW_ES, voiceId: VOICE_ID }));
  const c = (NEW_ES.length / 1000) * 0.10;
  writeFileSync(voSide, JSON.stringify({ textHash: hash(`${VOICE_ID}:${NEW_ES}`), costUsd: c, createdAt: new Date().toISOString() }));
  receipts.calls.push({ stage: 'voiceover', label: 'es beat-3 match night', costUsd: c });
  receipts.costUsd += c;
  log('  ✓ ES beat-3 VO (match night)');
}

receipts.finished = new Date().toISOString();
receipts.costUsd = +receipts.costUsd.toFixed(4);
writeFileSync(join(ROOT, 'output/bundles/bundle-b/receipts/jerseys-manifest.json'), JSON.stringify(receipts, null, 2));
log(`\n✓ jerseys pass complete, fresh spend $${receipts.costUsd}`);
