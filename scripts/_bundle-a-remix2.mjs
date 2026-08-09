// Bundle A: remix v2. The v1 remix fixed music and transitions but the review
// still hears missing foley: the pipeline's per-beat accents are 1s room-tone
// whispers. Add substantial nat-sound beds for the four flagged windows and
// raise the sfx layer.  Usage: node scripts/_bundle-a-remix2.mjs
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

async function foley(name, text, dur) {
  const p = join(C, 'sfx', name);
  if (!existsSync(p)) {
    writeFileSync(p, await el.soundEffect({ text, durationSeconds: dur }));
    spend.push({ item: name, usd: (dur / 60) * 0.12 });
  }
  let gap = fx.highBandGapDb(p);
  if (gap < 8) { fx.lowpassAudio(p, 4200); gap = fx.highBandGapDb(p); }
  console.log(`✓ ${name} ${fx.probeDuration(p).toFixed(1)}s gap ${gap.toFixed(1)}dB`);
  return p;
}

// The four windows the blind review flagged, with acoustic space + material
const strong = [
  { at: 6.6, dur: 3.2, name: 'strong-card-table.mp3', text: 'Hands handling aged paper recipe cards on a wooden folding table: paper lifted, turned, set down with soft taps, a light slide of card stock on worn wood, close mic in a tiled kitchen with warm room reverb, tactile and present but gentle' },
  { at: 27.0, dur: 6.4, name: 'strong-counter-bowls.mp3', text: 'Close tactile kitchen foley in sequence: fingertips trace along a scratched stainless steel counter with a soft dragging scrape, then ceramic bowls handled and stacked, chipped glazed rims clinking softly, set down on steel, indoor tiled kitchen acoustics, warm and present, no harshness' },
  { at: 35.7, dur: 6.6, name: 'strong-line-roar.mp3', text: 'A full commercial kitchen line roaring into service: several gas burners igniting in sequence with soft whoomphs, heavy steel pans landing on grates, oil sizzling and crackling hard, utensils clattering, energetic and dense, real kitchen acoustics with tile reverb, weighty low-mid texture, no screech' },
  { at: 42.15, dur: 3.4, name: 'strong-guest-leaves.mp3', text: 'A last restaurant guest leaving a quiet dining room: a wooden chair pushes back and scrapes softly on a wood floor, slow footsteps walk away across the room, a wooden front door with a glass pane opens, a small brass bell over the door gives one soft warm chime, the door closes with a gentle latch, natural warm room reverb, distant perspective, quiet and elegiac' },
];
for (const s of strong) s.path = await foley(s.name, s.text, s.dur);

// fades on everything (no hard clip edges)
const FADED = join(C, 'sfx-faded');
mkdirSync(FADED, { recursive: true });
function fadeCopy(src, fadeOut = 0.35) {
  const out = join(FADED, 'v2-' + src.split('/').pop().replace('.mp3', '.wav'));
  const d = fx.probeDuration(src);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src,
    '-af', `afade=t=in:st=0:d=0.12,afade=t=out:st=${Math.max(0, d - fadeOut).toFixed(2)}:d=${fadeOut}`, out]);
  return out;
}

const brief = JSON.parse(readFileSync(readdirSync(C).filter(f => f.startsWith('brief-')).map(f => join(C, f))[0], 'utf8')).brief;
const transcript = JSON.parse(readFileSync(readdirSync(C).filter(f => f.startsWith('transcript-')).map(f => join(C, f))[0], 'utf8'));
const snapped = creative.snapBeats(brief.beats, fx.probeDuration(join(ROOT, 'input', 'bundle-a-vo-master.mp3')), transcript.words);
const sfxEntries = [];
for (const [i, s] of snapped.entries()) {
  const p = join(C, 'sfx', `beat-${i}.mp3`);
  if (existsSync(p)) sfxEntries.push({ path: fadeCopy(p, 0.18), atSec: s.start });
}
for (const s of strong) sfxEntries.push({ path: fadeCopy(s.path), atSec: s.at });
console.log(`sfx entries: ${sfxEntries.length}`);

const out = join(ROOT, 'output', 'cover-remix2.mp4');
fx.mixStems(premix, join(C, 'music-arc.mp3'), sfxEntries, out, {
  ambientPath: join(C, 'ambience.mp3'), musicVol: 0.42, sfxVol: 0.85, ambVol: 0.3,
});
writeFileSync(join(C, 'remix2-spend.json'), JSON.stringify(spend, null, 2));
console.log(`✓ ${out}: ${fx.probeDuration(out).toFixed(2)}s  extra spend $${spend.reduce((a, x) => a + x.usd, 0).toFixed(3)}`);
