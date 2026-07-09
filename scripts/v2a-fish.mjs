// Per-shot sound design prototype (MMAudio V2 on fal, $0.001/s): every rendered
// beat of the fish cover gets its own video-to-audio pass — the model watches
// the actual frames and generates the natural sound that footage would have
// produced. Tracks are harshness-gated, then meshed: faded in/out (no butt
// joins, no pops), laid on their exact cut offsets, mixed with music + a low
// ambience glue bed under the untouched voice. Output: output/cover-v2a.mp4
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const ROOT = '/Users/mitchellwilliams/Documents/broll-pipeline';
const COVER = join(ROOT, '.cache', 'cover');
const BEAT = join(COVER, 'beat');
const NAT = join(COVER, 'nat');
mkdirSync(NAT, { recursive: true });
const { config } = await import(join(ROOT, 'node_modules', 'dotenv', 'lib', 'main.js')).then(m => m.default ?? m);
config({ path: join(ROOT, '.env') });
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });

// Foley direction per beat, written against the brief's shotPrompts. MMAudio
// sees the frames; the prompt steers what it listens for. Music is excluded —
// the score is its own layer.
const FOLEY = [
  'heavy wet whole fish slapped down onto crushed ice, ice crunch, fish market hall',
  'quiet dawn market street, distant seagulls, wet cobblestones, a far-off roll-up gate',
  'man hauling a heavy ice crate, boots on wet floor, apron rustle, ice shifting inside',
  'metal shovel scooping crushed ice and pouring it across a steel counter, ice cascading and settling',
  'whole fish and crabs tumbling wet onto crushed ice, water spray, plastic tote knock',
  'small tourist crowd murmur, clothing rustle, one quiet real camera shutter click',
  'busy fish market counter, wet fish being arranged on ice, crowd murmur behind',
  'wet slaps of a fish passed hand to hand down a line, workers grunting, market crowd',
  'butcher paper crinkling and folding fast around a fish, package sliding on a counter',
  'city morning ambience outside a market, traffic hum, seagulls, faint neon buzz',
  'a man winding up and shouting a short holler, apron fabric movement, crowd going quiet',
  'a whole fish flying through the air, air whoosh, water droplets, crowd gasp rising',
  'quiet market hall room tone, the slow creak and chain clink of a hanging brass scale',
  'a heavy wet fish caught in waiting hands on butcher paper, wet slap, paper flex, crowd burst of cheers',
];

const KEY = process.env.FAL_KEY;
const H = { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' };
async function mmaudio(videoB64, prompt, seconds) {
  const submit = await fetch('https://queue.fal.run/fal-ai/mmaudio-v2', {
    method: 'POST', headers: H, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      video_url: `data:video/mp4;base64,${videoB64}`,
      prompt,
      negative_prompt: 'music, melody, score, singing',
      duration: Math.max(1, Math.ceil(seconds)),
    }),
  });
  if (!submit.ok) throw new Error(`mmaudio submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`);
  const { status_url, response_url } = await submit.json();
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const j = await (await fetch(status_url, { headers: H, signal: AbortSignal.timeout(30_000) })).json();
    if (j.status === 'COMPLETED') break;
    if (j.status === 'FAILED' || j.error) throw new Error('mmaudio failed: ' + JSON.stringify(j).slice(0, 300));
    await new Promise((r) => setTimeout(r, 4000));
  }
  const out = await (await fetch(response_url, { headers: H, signal: AbortSignal.timeout(60_000) })).json();
  const url = out.video?.url ?? out.video_url;
  if (!url) throw new Error('mmaudio result had no video url: ' + JSON.stringify(out).slice(0, 200));
  return url;
}

// beat offsets from the actual rendered clips (ground truth of the cut)
const durs = FOLEY.map((_, i) => fx.probeDuration(join(BEAT, `beat-${i}.mp4`)));
const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, d) => a + d, 0));
console.log(`14 beats, cut total ${(starts[13] + durs[13]).toFixed(2)}s`);

let spend = 0;
await Promise.all(FOLEY.map((prompt, i) => (async () => {
  const wav = join(NAT, `beat-${i}.wav`);
  if (existsSync(wav)) { console.log(`  beat ${i}: cached`); return; }
  // small proxy: MMAudio listens to frames, not pixels-per-inch
  const proxy = join(NAT, `beat-${i}-proxy.mp4`);
  ff(['-i', join(BEAT, `beat-${i}.mp4`), '-vf', 'scale=-2:480', '-an', '-crf', '30', '-preset', 'veryfast', proxy]);
  const b64 = readFileSync(proxy).toString('base64');
  const url = await mmaudio(b64, prompt, durs[i]);
  const dl = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  const withAudio = join(NAT, `beat-${i}-va.mp4`);
  writeFileSync(withAudio, Buffer.from(await dl.arrayBuffer()));
  ff(['-i', withAudio, '-vn', '-t', String(durs[i]), wav]);
  spend += Math.ceil(durs[i]) * 0.001;
  // harshness gate, deterministic fallback only (a $0.002 regen buys another dice roll; lowpass is certain)
  let gap = fx.highBandGapDb(wav);
  if (gap < 8) { fx.lowpassAudio(wav, 5000); gap = fx.highBandGapDb(wav); }
  console.log(`  beat ${i}: nat ${durs[i].toFixed(1)}s (gap ${gap.toFixed(1)}dB${gap < 8 ? ' still bright' : ''})`);
})()));
console.log(`✓ per-shot nat tracks done, est spend $${spend.toFixed(3)}`);

// ── mesh: fades on every nat track (kills butt-join pops), cut-offset layout ──
const premix = join(BEAT, 'natplus-premix.mp4'); // visual track + untouched piece audio
const music = join(COVER, 'music.mp3');
const amb = join(COVER, 'ambience.mp3');
const vidDur = fx.probeDuration(premix);
const fadeOutAt = Math.max(0, vidDur - 2.5);

const inputs = ['-i', premix, '-i', music, '-stream_loop', '-1', '-i', amb];
const parts = [
  `[1:a]volume=0.22,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[mus]`,
  `[2:a]volume=0.14,lowpass=f=8000,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[amb]`,
];
const mix = ['[0:a]', '[mus]', '[amb]'];
FOLEY.forEach((_, i) => {
  inputs.push('-i', join(NAT, `beat-${i}.wav`));
  const d = Math.round(starts[i] * 1000);
  const fadeOut = Math.max(0.1, durs[i] - 0.35);
  parts.push(`[${3 + i}:a]afade=t=in:st=0:d=0.25,afade=t=out:st=${fadeOut.toFixed(2)}:d=0.35,volume=0.55,adelay=${d}|${d}[nat${i}]`);
  mix.push(`[nat${i}]`);
});
parts.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0,alimiter=limit=0.95[aout]`);

const out = join(ROOT, 'output', 'cover-v2a.mp4');
execFileSync('ffmpeg', [
  '-y', '-v', 'error', ...inputs,
  '-filter_complex', parts.join(';'),
  '-map', '0:v', '-map', '[aout]', '-map', '0:s?',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text',
  '-movflags', '+faststart', out,
]);
console.log(`✓ ${out} ${fx.probeDuration(out).toFixed(2)}s (voice + music 0.22 + amb glue 0.14 + 14 per-shot nat tracks 0.55)`);
