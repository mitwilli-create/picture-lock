// Regenerate nat sound for beats 10 (shout must finish) and 13 (catch slap +
// crowd burst) with freeze-frame-extended clips: MMAudio scores exactly the
// video it sees, so we extend the last frame ~1.2s to give the sound room to
// complete and decay. Writes beat-N-va2.mp4; the mix script prefers va2.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const ROOT = '/Users/mitchellwilliams/Documents/broll-pipeline';
const COVER = join(ROOT, '.cache', 'cover');
const NAT = join(COVER, 'nat');
const { config } = await import(join(ROOT, 'node_modules', 'dotenv', 'lib', 'main.js')).then(m => m.default ?? m);
config({ path: join(ROOT, '.env') });
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });

const JOBS = {
  13: 'a heavy wet fish caught hard in waiting hands on butcher paper, one sharp wet slap impact, then paper rustle and a low warm murmur of impressed human voices, deep male laughter, human sounds only',
};
const EXT = 1.2;

const KEY = process.env.FAL_KEY;
const H = { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' };
async function mmaudio(videoB64, prompt, seconds) {
  const submit = await fetch('https://queue.fal.run/fal-ai/mmaudio-v2', {
    method: 'POST', headers: H, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      video_url: `data:video/mp4;base64,${videoB64}`, prompt,
      negative_prompt: 'music, melody, score, singing, birds, bird calls, seagull, screeching, squawking, animal sounds, high-pitched', duration: Math.max(1, Math.ceil(seconds)),
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

await Promise.all(Object.entries(JOBS).map(([i, prompt]) => (async () => {
  const src = join(COVER, 'beat', `beat-${i}.mp4`);
  const dur = fx.probeDuration(src) + EXT;
  const proxy = join(NAT, `beat-${i}-proxy-ext.mp4`);
  ff(['-i', src, '-vf', `scale=-2:480,tpad=stop_mode=clone:stop_duration=${EXT}`, '-an', '-crf', '30', '-preset', 'veryfast', proxy]);
  const url = await mmaudio(readFileSync(proxy).toString('base64'), prompt, dur);
  const dl = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  const va2 = join(NAT, `beat-${i}-va2.mp4`);
  writeFileSync(va2, Buffer.from(await dl.arrayBuffer()));
  console.log(`✓ beat ${i}: extended nat ${fx.probeDuration(va2).toFixed(2)}s → ${va2}`);
})()));
console.log(`est spend $${(Object.keys(JOBS).length * 4 * 0.001).toFixed(3)}`);
