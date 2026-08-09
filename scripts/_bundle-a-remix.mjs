// Bundle A: remix pass answering the blind review (no-ship 4.5/10).
// 1. new arc-scored music bed  2. two missing foley accents (harsh-gated)
// 3. 80ms fades baked into every sfx clip  4. hotter bed levels in the mix.
// Usage: node scripts/_bundle-a-remix.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
try { const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') }); } catch {}
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const el = await import(join(ROOT, 'lib', 'elevenlabs.mjs'));
const creative = await import(join(ROOT, 'lib', 'creative.mjs'));

const C = join(ROOT, '.cache', 'cover');
const premix = join(C, 'beat', 'cover-fixed-premix.mp4');
const spend = [];

// 1. arc-scored music bed (the review: "barely perceptible drone, fails to
// drive emotional pacing"). Scored to the piece's emotional curve.
const musicPrompt = 'Cinematic score for a 50 second film with a clear emotional arc: opens with sparse intimate felt piano over warm room tone, gathers gentle warmth with soft cello by 15 seconds, pulls back to near silence at 24 seconds for a moment of grief, then builds from 35 seconds into a determined swelling crescendo with strings and low percussion, and at 44 seconds thins back to a single fading piano note. Instrumental only, organic acoustic texture, emotional and restrained, no synthesizer pads.';
const music2 = join(C, 'music-arc.mp3');
if (!existsSync(music2)) {
  writeFileSync(music2, await el.music({ prompt: musicPrompt, lengthMs: 52000 }));
  spend.push({ item: 'score-arc', usd: (52 / 60) * 0.15 });
}
console.log('✓ arc score');

// 2. missing foley, acoustic space + physical material specified, harsh-gated
async function foley(name, text, dur) {
  const p = join(C, 'sfx', name);
  if (!existsSync(p)) {
    writeFileSync(p, await el.soundEffect({ text, durationSeconds: dur }));
    spend.push({ item: name, usd: (dur / 60) * 0.12 });
  }
  let gap = fx.highBandGapDb(p);
  if (gap < 8) { fx.lowpassAudio(p, 4200); gap = fx.highBandGapDb(p); }
  console.log(`✓ ${name} gap ${gap.toFixed(1)}dB`);
  return p;
}
const cardFoley = await foley('extra-recipe-card.mp3',
  'A single aged paper recipe card lifted and turned between fingers, soft paper flex and gentle slide on a wooden table, close mic, indoor tiled kitchen room reverb, quiet and delicate, no rustling harshness', 1.4);
const doorFoley = await foley('extra-door.mp3',
  'A wooden restaurant front door with a glass pane swings open and softly latches shut, heard from across a quiet dining room, warm natural room reverb, gentle and low, muffled soft thud and quiet brass latch click', 1.8);

// 3. fades baked into every sfx clip (the review: tracks pop in and out)
const FADED = join(C, 'sfx-faded');
mkdirSync(FADED, { recursive: true });
function fadeCopy(src) {
  const out = join(FADED, src.split('/').pop().replace('.mp3', '.wav'));
  const d = fx.probeDuration(src);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src,
    '-af', `afade=t=in:st=0:d=0.08,afade=t=out:st=${Math.max(0, d - 0.18).toFixed(2)}:d=0.18`, out]);
  return out;
}

// 4. schedule: pipeline sfx at exact snapped starts + the two new accents
const brief = JSON.parse(readFileSync(readdirSync(C).filter(f => f.startsWith('brief-')).map(f => join(C, f))[0], 'utf8')).brief;
const transcript = JSON.parse(readFileSync(readdirSync(C).filter(f => f.startsWith('transcript-')).map(f => join(C, f))[0], 'utf8'));
const snapped = creative.snapBeats(brief.beats, fx.probeDuration(join(ROOT, 'input', 'bundle-a-vo-master.mp3')), transcript.words);
const sfxEntries = [];
for (const [i, s] of snapped.entries()) {
  const p = join(C, 'sfx', `beat-${i}.mp3`);
  if (existsSync(p)) sfxEntries.push({ path: fadeCopy(p), atSec: s.start });
}
sfxEntries.push({ path: fadeCopy(cardFoley), atSec: 6.95 });  // recipe card on screen
sfxEntries.push({ path: fadeCopy(doorFoley), atSec: 43.1 });  // last guest leaves
console.log(`sfx entries: ${sfxEntries.length}`);

// 5. remix, hotter beds (review: music 4/10 buried, world hollow)
const out = join(ROOT, 'output', 'cover-remix.mp4');
fx.mixStems(premix, music2, sfxEntries, out, {
  ambientPath: join(C, 'ambience.mp3'), musicVol: 0.42, sfxVol: 0.55, ambVol: 0.28,
});
writeFileSync(join(C, 'remix-spend.json'), JSON.stringify(spend, null, 2));
console.log(`✓ ${out}: ${fx.probeDuration(out).toFixed(2)}s  extra spend $${spend.reduce((a, s) => a + s.usd, 0).toFixed(3)}`);
