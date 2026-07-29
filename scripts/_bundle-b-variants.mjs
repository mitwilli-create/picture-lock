// Bundle B: build DE/FR/ES/IT market variants of the MERIDIEM hero spot.
// Reuses the hero's accepted visuals (.cache/broll/beat-N.mp4) and diegetic
// SFX (.cache/sfx/beat-N.mp3) untouched; swaps per market: localized VO
// (Mitchell retake clone, eleven_multilingual_v2), a market-adapted Eleven
// Music bed, and a market-adapted ambience bed. Craft Law three-layer mix via
// lib/ffmpeg.mjs mixStems. Costs logged to output/bundles/bundle-b/variants-manifest.json.
//
// Usage: node --env-file=.env scripts/_bundle-b-variants.mjs [de fr es it]
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const el = await import(join(ROOT, 'lib/elevenlabs.mjs'));
const fx = await import(join(ROOT, 'lib/ffmpeg.mjs'));

const VOICE_ID = 'JqleYXcfWmF1IvSuSlLw'; // Mitchell retake 2026-07-12 IVC (v3-steady persisted platform-side)
const BROLL = join(ROOT, '.cache/broll');
const SFX = join(ROOT, '.cache/sfx');
const WORK = join(ROOT, '.cache/bundle-b');
const OUT = join(ROOT, 'output/bundles/bundle-b');
mkdirSync(OUT, { recursive: true });

const MARKETS = {
  de: {
    script: 'input/bundle-b-de.md',
    music: 'minimal warm deep house underscore, precise and unhurried, soft analog pulse, restrained clean groove, golden evening Feierabend mood, no melody hook, instrumental bed under narration',
    ambience: 'quiet german city rooftop terrace at golden hour, restrained street murmur far below, distant tram hum, soft evening air, recorded outdoors with natural reverb',
  },
  fr: {
    script: 'input/bundle-b-fr.md',
    music: 'warm jazz-tinged underscore, brushed drums, soft upright bass, mellow electric piano, parisian evening aperitif mood, relaxed and unhurried, no melody hook, instrumental bed under narration',
    ambience: 'parisian terrace at golden hour, distant cafe chatter and cutlery clinks far away, soft city murmur, gentle evening air, recorded outdoors with natural reverb',
  },
  es: {
    script: 'input/bundle-b-es.md',
    music: 'warm spanish nylon guitar underscore, soft fingerpicked phrases, gentle distant palmas, mediterranean terrace at dusk, relaxed and warm, no melody hook, instrumental bed under narration',
    ambience: 'spanish plaza terrace at dusk, lively distant conversation murmur, swifts calling high above, warm evening air, recorded outdoors with natural reverb',
  },
  it: {
    script: 'input/bundle-b-it.md',
    music: 'warm italian cinematic underscore, soft muted trumpet far back over gentle guitar, piazza aperitivo hour at dusk, relaxed and romantic, no melody hook, instrumental bed under narration',
    ambience: 'italian piazza terrace at dusk, distant chatter and glasses, a scooter passing far away, warm evening air, recorded outdoors with natural reverb',
  },
};

function parseBeats(path) {
  const raw = readFileSync(join(ROOT, path), 'utf8');
  const beats = [];
  for (const block of raw.split(/^##\s+/m).slice(1)) {
    const vo = (block.match(/^VO:\s*(.+)/im) || [])[1]?.trim() || '';
    const seconds = parseFloat((block.match(/^SECONDS:\s*([\d.]+)/im) || [])[1] || '4');
    if (vo) beats.push({ vo, seconds, caption: '' });
  }
  return beats;
}

// Harshness gate (Craft Law rule 10), lite: lowpass in place if the high band
// sits too close to the full-band level.
function softly(path, label, log) {
  const gap = fx.highBandGapDb(path);
  if (gap < 8) { fx.lowpassAudio(path, 4200); log(`  [audio-qa] ${label}: gap ${gap.toFixed(1)}dB, lowpassed`); }
  else log(`  [audio-qa] ${label}: gap ${gap.toFixed(1)}dB, clean`);
}

const only = process.argv.slice(2).filter((a) => MARKETS[a]);
const langs = only.length ? only : Object.keys(MARKETS);
const manifest = { started: new Date().toISOString(), voiceId: VOICE_ID, markets: {}, costUsd: 0 };
const log = console.log;

for (const lang of langs) {
  const m = MARKETS[lang];
  const beats = parseBeats(m.script);
  const dir = join(WORK, lang);
  const voDir = join(dir, 'vo'), beatDir = join(dir, 'beat');
  mkdirSync(voDir, { recursive: true });
  mkdirSync(beatDir, { recursive: true });
  const calls = [];
  let cost = 0;
  log(`\n▶ ${lang.toUpperCase()} variant (${beats.length} beats)`);

  // [1] localized VO, beat by beat (content-hash cached so reruns are free)
  for (const [i, b] of beats.entries()) {
    b.voPath = join(voDir, `beat-${i}.mp3`);
    const side = join(voDir, `beat-${i}.json`);
    let cached = null;
    try { cached = JSON.parse(readFileSync(side, 'utf8')); } catch {}
    if (cached?.text === b.vo && existsSync(b.voPath)) { log(`  [vo ${i}] cached`); continue; }
    writeFileSync(b.voPath, await el.tts({ text: b.vo, voiceId: VOICE_ID }));
    const c = (b.vo.length / 1000) * 0.10;
    cost += c;
    calls.push({ stage: 'voiceover', beat: i, chars: b.vo.length, costUsd: c });
    writeFileSync(side, JSON.stringify({ text: b.vo, costUsd: c }));
    log(`  [vo ${i}] ${b.vo.length} chars $${c.toFixed(4)}`);
  }

  // measured beat durations drive everything downstream (same rule as the pipeline)
  const durs = beats.map((b) => Math.max(b.seconds, fx.probeDuration(b.voPath) || 0));
  const totalS = Math.ceil(durs.reduce((a, d) => a + d, 0)) + 2;

  // [2] market music bed (cached by prompt+length)
  const musicPath = join(dir, 'music.mp3');
  const mSide = join(dir, 'music.json');
  let mCached = null;
  try { mCached = JSON.parse(readFileSync(mSide, 'utf8')); } catch {}
  if (!(mCached?.prompt === m.music && mCached?.seconds === totalS && existsSync(musicPath))) {
    writeFileSync(musicPath, await el.music({ prompt: m.music, lengthMs: totalS * 1000 }));
    const c = (totalS / 60) * 0.15;
    cost += c;
    calls.push({ stage: 'score', seconds: totalS, costUsd: c });
    writeFileSync(mSide, JSON.stringify({ prompt: m.music, seconds: totalS }));
    log(`  [music] ${totalS}s $${c.toFixed(4)}`);
  } else log('  [music] cached');

  // [3] market ambience bed (cached by prompt)
  const ambPath = join(dir, 'ambience.mp3');
  const aSide = join(dir, 'ambience.json');
  const ambDur = Math.min(28, totalS);
  let aCached = null;
  try { aCached = JSON.parse(readFileSync(aSide, 'utf8')); } catch {}
  if (!(aCached?.prompt === m.ambience && existsSync(ambPath))) {
    writeFileSync(ambPath, await el.soundEffect({ text: m.ambience, durationSeconds: ambDur }));
    softly(ambPath, `${lang} ambience`, log);
    const c = (ambDur / 60) * 0.12;
    cost += c;
    calls.push({ stage: 'ambience', seconds: ambDur, costUsd: c });
    writeFileSync(aSide, JSON.stringify({ prompt: m.ambience }));
    log(`  [ambience] ${ambDur}s $${c.toFixed(4)}`);
  } else log('  [ambience] cached');

  // [4] shared hero visuals + shared diegetic SFX, cut to THIS market's VO timing
  const clips = [], sfxEntries = [];
  let offset = 0;
  for (const [i, b] of beats.entries()) {
    const clipPath = join(BROLL, `beat-${i}.mp4`);
    if (!existsSync(clipPath)) throw new Error(`missing hero visual ${clipPath}: run the hero spot first`);
    const { out, dur } = fx.renderBeat({ index: i, seconds: b.seconds, voPath: b.voPath, clipPath, visualMode: 'gen', cacheDir: beatDir });
    clips.push(out);
    durs[i] = dur;
    const sfxFile = join(SFX, `beat-${i}.mp3`);
    if (existsSync(sfxFile)) sfxEntries.push({ path: sfxFile, atSec: offset });
    offset += dur;
  }

  // [5] assemble + three-layer mix
  const srt = join(beatDir, 'captions.srt');
  fx.buildSrt(beats, durs, srt);
  const flat = join(dir, 'flat.mp4');
  fx.assembleBeats(clips, srt, flat, beatDir);
  const final = join(OUT, `spot-${lang}.mp4`);
  fx.mixStems(flat, musicPath, sfxEntries, final, { ambientPath: ambPath });
  copyFileSync(srt, join(OUT, `spot-${lang}.srt`));
  const finalDur = fx.probeDuration(final);
  log(`  ✓ ${final.replace(ROOT + '/', '')} (${finalDur.toFixed(1)}s) market spend $${cost.toFixed(3)}`);

  manifest.markets[lang] = { out: `spot-${lang}.mp4`, duration_s: +finalDur.toFixed(2), calls, marketCostUsd: +cost.toFixed(4) };
  manifest.costUsd += cost;
}

manifest.costUsd = +manifest.costUsd.toFixed(4);
manifest.finished = new Date().toISOString();
writeFileSync(join(OUT, 'variants-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n✓ variants complete, total fresh spend $${manifest.costUsd}`);
