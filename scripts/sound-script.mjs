#!/usr/bin/env node
// Script-mode sound pass: the cover pipeline's full sound doctrine ported to
// the script-mode cut (output/short.mp4 + .cache/beat), per Craft Law sound
// rules + the 2026-07-08 measured-mix keeper recipe:
//
//   per-shot V2A foley (hunyuan-video-foley, mmaudio-v2 fallback)
//     → gain-stage stems to measured LUFS (voice -16 / nat -24 / music -26 / amb -28)
//     → gentle 2:1 voice-keyed ducks on nat AND music, 0.55s dissolves, master -14
//     → BLIND REVIEW median-of-3 (Gemini can hear; its music score is unreliable)
//     → ship? done : regen flagged beats from the reviewer's regenPrompt
//       (positive-only target descriptions — complaint text contaminates prompts)
//
// Receipts per round in output/sound-loop/script-round-N/. Final cut:
// output/short-wow.mp4 (caller promotes to output/short.mp4 after human ear).
//
//   node scripts/sound-script.mjs
//   MAX_ROUNDS=2 node scripts/sound-script.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// staging targets (LUFS): env-tunable per piece. This cut is wall-to-wall
// narration, so the music bed rides higher than the fish-cover keeper (-26):
// with no VO gaps a -26 bed disappears entirely (Mitchell: "no music", twice)
const VOICE_I = parseFloat(process.env.VOICE_I ?? '-16');
const NAT_I = parseFloat(process.env.NAT_I ?? '-24');
const MUS_I = parseFloat(process.env.MUS_I ?? '-24');
const AMB_I = parseFloat(process.env.AMB_I ?? '-28');
// VOICE_MUSIC_ONLY=1: skip foley and ambience entirely. Motivated-sound
// judgment (Mitchell 2026-07-08): screen/UI-heavy footage with little physical
// action on camera carries voice + score only; per-shot foley on such shots is
// invented sound and reads as artifacts (phantom singing, whistling).
const VOICE_MUSIC_ONLY = process.env.VOICE_MUSIC_ONLY === '1';
const BEAT = join(ROOT, '.cache', 'beat');
const VO = join(ROOT, '.cache', 'vo');
const NAT = join(BEAT, 'nat');
const LOOP = join(ROOT, 'output', 'sound-loop');
const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS ?? '3', 10);
mkdirSync(NAT, { recursive: true });
const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') });
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const cover = await import(join(ROOT, 'lib', 'cover.mjs'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
const GEMINI = readFileSync('/Users/mitchellwilliams/Documents/career-ops/.env', 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!process.env.FAL_KEY || !GEMINI) throw new Error('need FAL_KEY (.env) and GEMINI_API_KEY (career-ops/.env)');
let spend = 0;

// Per-shot nat spec (Craft Law: acoustic space + physical material, every shot).
// Scripted SFX accents are folded in here as positive descriptions — the V2A
// pass replaces the ElevenLabs accent layer so nothing doubles.
const FOLEY = [
  'inside a quiet studio room: soft mechanical keyboard keys clicking in rapid bursts, low computer fan hum, close and intimate, dry small-room acoustics',
  'inside a cramped busy production office: overlapping muffled voices, paper shuffling and pages passing hand to hand, chairs rolling on hard floor, small-room acoustics',
  'inside a dead-quiet padded vocal booth: a soft breath close to a large microphone, fabric rustle, faint headphone bleed, extremely dry acoustics',
  'inside a dark edit suite: a jog wheel spinning and clicking, rapid keyboard shortcuts, mouse clicks, quiet air conditioning hum, small dry room',
  'inside an office over a long day compressed: papers shifting quickly, a ceramic mug set down on wood, pen scratches, distant muffled office chatter, gentle room tone',
  'inside a music studio control room: smooth fader movements on a console, a switch click, low playback rumble from studio monitors, warm room tone',
  'inside a music studio: a fader pushed up with a soft slide, a patch cable seated into a jack with a click, low electrical hum, close and tactile, warm room',
  'inside a quiet archive room: film handled on a metal editing block, one precise blade snip, tape smoothed down, sprockets ticking, close dry acoustics',
  'inside a quiet server room corner: soft data-center fan whir, faint hard-drive ticks, low electrical hum, steady and calm',
  'inside a quiet studio room: one fast fluid airy swish of motion, a soft rounded interface confirmation tick, low computer hum, dry room',
  'inside an empty conference room at dusk: deep quiet room tone, distant HVAC rumble, light switches clicking off one by one down a row, faint city murmur through glass',
  'inside a small quiet room: a thermal receipt printer chattering in a short burst, paper feeding and tearing cleanly, small mechanical detail, close and dry',
  'inside a sunlit home office in the morning: a pen nib scratching deliberate marks on paper, a page turning, a coffee cup set gently on wood, faint birdsong outside, calm room tone',
  'inside a quiet studio room: soft rounded interface ticks as items cascade and settle one by one, low computer hum, dry small room',
  'close on people listening with earbuds in calm places: soft cloth movement, a faint breath, gentle room tone shifting warmly between shots, quiet and intimate',
  'inside a quiet studio room: one deep soft cinematic impact with a long low tail, then near-silence with faint computer hum, dry room',
];
const N = FOLEY.length;
const NEG = 'music, melody, score, singing, birds, bird calls, screeching, squawking, animal sounds, high-pitched, harsh';
// impact-synced beats (peak trimmed to land IMPACT[i] sec after the beat start);
// NUDGE shifts a whole track for contact-frame sync (Gemini can read the frame)
const IMPACT = { 15: 0.35 };
const NUDGE = {};

for (let i = 0; i < N; i++) if (!existsSync(join(BEAT, `beat-${i}.mp4`))) throw new Error(`missing .cache/beat/beat-${i}.mp4 — run the pipeline first`);
const durs = FOLEY.map((_, i) => fx.probeDuration(join(BEAT, `beat-${i}.mp4`)));
const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, d) => a + d, 0));
const total = starts[N - 1] + durs[N - 1];
const beatAt = (t) => Math.max(0, starts.findLastIndex((s) => s <= t));
console.log(`${N} beats, cut total ${total.toFixed(2)}s`);

function peakTime(path) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'], { maxBuffer: 64 * 1024 * 1024 });
  let max = 0, at = 0;
  for (let i = 0; i < pcm.length - 1; i += 2) { const v = Math.abs(pcm.readInt16LE(i)); if (v > max) { max = v; at = i / 2; } }
  return at / 8000;
}

// ── V2A per-shot foley: hunyuan-video-foley first (benchmark leader), mmaudio
// fallback (hunyuan's content checker rejects innocuous prompts; reword or fall)
const H = { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' };
async function falQueue(slug, body) {
  const submit = await fetch(`https://queue.fal.run/${slug}`, {
    method: 'POST', headers: H, signal: AbortSignal.timeout(60_000), body: JSON.stringify(body),
  });
  if (!submit.ok) throw new Error(`${slug} submit ${submit.status}: ${(await submit.text()).slice(0, 200)}`);
  const { status_url, response_url } = await submit.json();
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const j = await (await fetch(status_url, { headers: H, signal: AbortSignal.timeout(30_000) })).json();
    if (j.status === 'COMPLETED') break;
    if (j.status === 'FAILED' || j.error) throw new Error(`${slug} failed: ` + JSON.stringify(j).slice(0, 200));
    await new Promise((r) => setTimeout(r, 4000));
  }
  const out = await (await fetch(response_url, { headers: H, signal: AbortSignal.timeout(60_000) })).json();
  const url = out.video?.url ?? out.video_url;
  if (!url) throw new Error(`${slug}: no video url in result`);
  return url;
}

async function v2a(i, prompt) {
  const proxy = join(NAT, `beat-${i}-proxy.mp4`);
  // strip the baked VO (-an) — the model must foley the frames, not hear narration;
  // freeze-extend 1.2s so tails exist past the cut (MMAudio scores only what it sees)
  ff(['-i', join(BEAT, `beat-${i}.mp4`), '-vf', 'scale=-2:480,tpad=stop_mode=clone:stop_duration=1.2', '-an', '-crf', '30', '-preset', 'veryfast', proxy]);
  const dataUri = `data:video/mp4;base64,${readFileSync(proxy).toString('base64')}`;
  let url, model = 'hunyuan-video-foley';
  try {
    url = await falQueue('fal-ai/hunyuan-video-foley', { video_url: dataUri, text_prompt: prompt });
  } catch (e) {
    console.log(`  beat ${i}: hunyuan fell back (${e.message.slice(0, 80)})`);
    model = 'mmaudio-v2';
    url = await falQueue('fal-ai/mmaudio-v2', {
      video_url: dataUri, prompt, negative_prompt: NEG, duration: Math.max(1, Math.ceil(durs[i] + 1.2)),
    });
  }
  const va = join(NAT, `beat-${i}-va.mp4`);
  writeFileSync(va, Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(120_000) })).arrayBuffer()));
  writeFileSync(join(NAT, `beat-${i}.json`), JSON.stringify({ prompt, model, createdAt: 'run' }));
  spend += Math.ceil(durs[i] + 1.2) * 0.001;
  return va;
}

// Derive each beat's foley prompt from the ACTUAL rendered frames (Gemini
// vision), never from script intent: the council rewrites shots, and foley
// written against the script scores footage that is not on screen (the
// analog-tape-under-digital-NLE lesson, Mitchell 2026-07-08). DERIVE_FOLEY=1
// re-derives all prompts.
async function deriveFoley(i) {
  const proxy = join(NAT, `beat-${i}-proxy.mp4`);
  if (!existsSync(proxy))
    ff(['-i', join(BEAT, `beat-${i}.mp4`), '-vf', 'scale=-2:480,tpad=stop_mode=clone:stop_duration=1.2', '-an', '-crf', '30', '-preset', 'veryfast', proxy]);
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI }, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'video/mp4', data: readFileSync(proxy).toString('base64') } },
        { text: 'You are a foley supervisor. Watch this short muted clip and write ONE text-to-foley prompt describing exactly the natural sound a live microphone on set would have recorded for THESE frames: name the acoustic space, every visible sound-producing action in order, and the physical material of each source. If the clip shows a screen, UI, or terminal, the mic hears the ROOM (computer hum, room tone, small device sounds), never interface bleeps. No music. Reply with ONLY the prompt text on one line, no JSON, no quotes, no preamble.' },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`gemini foley ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const text = (await r.json()).candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) throw new Error('gemini foley: empty prompt');
  return line;
}

// generate any beat missing its nat track (cache: sidecar prompt match)
async function ensureNat(prompts) {
  const todo = prompts.map((p, i) => ({ p, i })).filter(({ p, i }) => {
    try { return JSON.parse(readFileSync(join(NAT, `beat-${i}.json`), 'utf8')).prompt !== p || !existsSync(join(NAT, `beat-${i}-va.mp4`)); }
    catch { return true; }
  });
  if (todo.length) console.log(`▶ V2A foley: ${todo.length} beats (${todo.map((t) => t.i).join(', ')})`);
  // small parallelism, data URIs are heavy
  for (let k = 0; k < todo.length; k += 4) await Promise.all(todo.slice(k, k + 4).map(({ p, i }) => v2a(i, p)));
}

// ── stems ─────────────────────────────────────────────────────────────────────
const stage = (inPath, I, out) => {
  ff(['-i', inPath, '-af', `loudnorm=I=${I}:TP=-2:LRA=11:linear=true`, '-ar', '48000', out]);
  return out;
};

function buildVoiceStem(dir) {
  // per-beat VO laid at each beat's measured start (renderBeat plays VO from
  // the beat's first frame, so this reproduces the cut's voice timing exactly)
  const items = [];
  for (let i = 0; i < N; i++) {
    const p = join(VO, `beat-${i}.mp3`);
    if (existsSync(p)) items.push({ p, at: starts[i] });
  }
  const raw = join(dir, 'voice-raw.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...items.flatMap(({ p }) => ['-i', p]), '-filter_complex',
    items.map(({ at }, k) => { const d = Math.round(at * 1000); return `[${k}:a]adelay=${d}|${d}[v${k}]`; }).join(';')
    // apad: the last VO line ends before the endcard does; without padding, -t
    // caps-but-does-not-extend and duration=first mixes truncate the whole master
    + `;${items.map((_, k) => `[v${k}]`).join('')}amix=inputs=${items.length}:duration=longest:normalize=0,apad[out]`,
    '-map', '[out]', '-t', total.toFixed(2), raw]);
  return stage(raw, VOICE_I, join(dir, 'voice.wav'));
}

function buildNatStem(dir) {
  const wavs = FOLEY.map((_, i) => {
    const va = join(NAT, `beat-${i}-va.mp4`);
    const wav = join(dir, `nat-${i}.wav`);
    let take = Math.min(fx.probeDuration(va), durs[i] + 1.2), fadeIn = 0.55;
    if (IMPACT[i] !== undefined) {
      const full = join(dir, `nat-${i}-full.wav`);
      ff(['-i', va, '-vn', full]);
      const trim = Math.max(0, peakTime(full) - IMPACT[i]);
      take = Math.min(fx.probeDuration(va) - trim, durs[i] + 1.2);
      ff(['-ss', trim.toFixed(3), '-i', full, '-t', take.toFixed(3), wav]);
      fadeIn = 0.03;
    } else ff(['-i', va, '-vn', '-t', take.toFixed(3), wav]);
    if (fx.highBandGapDb(wav) < 8) fx.lowpassAudio(wav, 5000);
    return { wav, at: Math.max(0, starts[i] + (NUDGE[i] ?? 0)), dur: take, fadeIn };
  });
  const raw = join(dir, 'nat-raw.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...wavs.flatMap((t) => ['-i', t.wav]), '-filter_complex',
    wavs.map((t, i) => {
      const d = Math.round(t.at * 1000);
      return `[${i}:a]afade=t=in:st=0:d=${t.fadeIn},afade=t=out:st=${Math.max(0.1, t.dur - 0.55).toFixed(2)}:d=0.55,adelay=${d}|${d}[n${i}]`;
    }).join(';') + `;${wavs.map((_, i) => `[n${i}]`).join('')}amix=inputs=${N}:duration=longest:normalize=0,apad[out]`,
    '-map', '[out]', '-t', total.toFixed(2), raw]);
  return stage(raw, NAT_I, join(dir, 'nat.wav'));
}

function buildBedStems(dir) {
  const musRaw = join(dir, 'mus-raw.wav');
  ff(['-i', join(ROOT, '.cache', 'music.mp3'), '-af', 'apad', '-t', total.toFixed(2), musRaw]);
  const music = stage(musRaw, MUS_I, join(dir, 'music.wav'));
  let amb = null;
  const ambSrc = join(ROOT, '.cache', 'ambience.mp3');
  if (existsSync(ambSrc)) {
    const ambRaw = join(dir, 'amb-raw.wav');
    ff(['-stream_loop', '-1', '-i', ambSrc, '-t', total.toFixed(2), ambRaw]);
    amb = stage(ambRaw, AMB_I, join(dir, 'amb.wav'));
  }
  return { music, amb };
}

// ── the keeper mix (measured staging + gentle voice-keyed ducks) ──────────────
function mix(dir, voice, nat, music, amb) {
  const fadeOutAt = Math.max(0, total - 2.5);
  const mixWav = join(dir, 'mix.wav');
  const inputs = ['-i', voice, ...(nat ? ['-i', nat] : []), '-i', music, ...(amb ? ['-i', amb] : [])];
  const mi = nat ? 2 : 1; // music input index
  const graph = [
    `[0:a]asplit=${nat ? 3 : 2}[v]${nat ? '[key1]' : ''}[key2]`,
    ...(nat ? [`[1:a][key1]sidechaincompress=threshold=0.06:ratio=2:attack=15:release=400[natd]`] : []),
    `[${mi}:a]afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[mus]`,
    `[mus][key2]sidechaincompress=threshold=0.05:ratio=2:attack=15:release=400[musd]`,
    ...(amb ? [`[${mi + 1}:a]afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2.5[ambf]`] : []),
    `[v]${nat ? '[natd]' : ''}[musd]${amb ? '[ambf]' : ''}amix=inputs=${1 + (nat ? 1 : 0) + 1 + (amb ? 1 : 0)}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11:linear=true[out]`,
  ].join(';');
  // -ar 48000: loudnorm upsamples to 192kHz internally; without an explicit
  // rate the AAC mux clamps to 96kHz, which browser decoders refuse to play
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', '-ar', '48000', '-t', total.toFixed(2), mixWav]);
  return mixWav;
}

// ── blind review, median-of-3 (single reviews carry ±1-2 noise) ───────────────
async function blindReviewOnce(proxyB64) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI }, signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'video/mp4', data: proxyB64 } },
        { text: `You are a veteran re-recording mixer reviewing a ~${Math.round(total)}-second vertical short with narration, for a paying client deciding whether to ship. You have no other context. Judge ONLY the soundtrack, harshly, in this priority order: (1) every on-screen action produces its real sound synced to its contact frame; (2) the voice is unambiguously on top everywhere; (3) music is felt but never winning; (4) all tracks dissolve — no audible starts, stops, pops, or dips; (5) everything reads as naturally recorded, never synthetic or stock.\n\nReturn JSON only:\n{"scores":{"hierarchy":0-10,"music":0-10,"nat":0-10,"sync":0-10,"transitions":0-10,"artifacts":0-10,"polish":0-10},"overall":0-10,"ship":true|false,"fixes":[{"t":seconds,"instruction":"what is wrong","regenPrompt":"POSITIVE-ONLY description of the CORRECT sound for this moment, as a text-to-foley prompt naming the acoustic space and physical material. Never name the artifact being removed — a generation model treats every noun as a request. Wrong: 'remove the splash, add a whoosh'. Right: 'one clean dry air whoosh, indoor hall reverb'."}]}\n\nfixes = top priority items only (max 4), t = timestamp in seconds as a number.` },
      ] }],
      generationConfig: { response_mime_type: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const text = (await r.json()).candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}';
  return [].concat(JSON.parse(text))[0]; // Gemini sometimes array-wraps
}

async function blindReview(videoPath, dir) {
  const proxy = join(dir, 'review-proxy.mp4');
  ff(['-i', videoPath, '-vf', 'scale=-2:480', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', proxy]);
  const b64 = readFileSync(proxy).toString('base64');
  const runs = [];
  // Gemini occasionally emits malformed JSON; a bad response costs a retry, not the round
  for (let attempt = 0; runs.length < 3 && attempt < 6; attempt++) {
    try { runs.push(await blindReviewOnce(b64)); }
    catch (e) { console.log(`  review attempt ${attempt + 1} failed (${e.message.slice(0, 80)}), retrying`); }
  }
  if (runs.length < 2) throw new Error('blind review: too few valid responses');
  runs.sort((a, b) => (a.overall ?? 0) - (b.overall ?? 0));
  const median = runs[1];
  const review = { ...median, ships: runs.filter((r) => r.ship).length, overalls: runs.map((r) => r.overall) };
  writeFileSync(join(dir, 'review.json'), JSON.stringify({ median: review, runs }, null, 2));
  return review;
}

// ── the loop ──────────────────────────────────────────────────────────────────
// seed from sidecars so a resumed run keeps prior rounds' regenerated foley
// instead of regressing to the base prompts (and re-spending to do it)
let prompts = FOLEY.map((p, i) => {
  try { return JSON.parse(readFileSync(join(NAT, `beat-${i}.json`), 'utf8')).prompt || p; } catch { return p; }
});
if (process.env.DERIVE_FOLEY === '1') {
  console.log('▶ deriving foley prompts from the actual rendered frames (Gemini)');
  prompts = [];
  for (let i = 0; i < N; i++) {
    prompts.push(await deriveFoley(i));
    console.log(`  beat ${i}: ${prompts[i].slice(0, 100)}`);
  }
}
let best = null;
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const dir = join(LOOP, `script-round-${round}`);
  mkdirSync(dir, { recursive: true });
  if (!VOICE_MUSIC_ONLY) await ensureNat(prompts);
  console.log(`▶ round ${round}: stems + measured mix${VOICE_MUSIC_ONLY ? ' (voice + score only)' : ''}`);
  const voice = buildVoiceStem(dir);
  const nat = VOICE_MUSIC_ONLY ? null : buildNatStem(dir);
  const { music, amb } = buildBedStems(dir);
  const mixWav = mix(dir, voice, nat, music, VOICE_MUSIC_ONLY ? null : amb);
  const cut = join(dir, 'cut.mp4');
  cover.muxPieceAudio(join(ROOT, 'output', 'short.mp4'), mixWav, join(BEAT, 'captions.srt'), cut);
  console.log(`▶ round ${round}: blind review ×3`);
  const review = await blindReview(cut, dir);
  console.log(`  medians ${JSON.stringify(review.overalls)} → overall ${review.overall}, ship votes ${review.ships}/3`);
  for (const f of review.fixes ?? []) console.log(`  fix @${f.t}s (beat ${beatAt(f.t)}): ${(f.instruction ?? '').slice(0, 90)}`);
  if (!best || review.overall > best.review.overall) best = { cut, review, round };
  if (review.ships >= 2) { console.log(`\n✓ SHIP verdict (majority) in round ${round}`); break; }
  if (round === MAX_ROUNDS) { console.log(`\n⚠ rounds exhausted; best was round ${best.round} (${best.review.overall}/10)`); break; }
  const beats = [...new Set((review.fixes ?? []).map((f) => beatAt(f.t)))];
  console.log(`▶ round ${round}: regen prompts for beats ${beats.join(', ')}`);
  for (const b of beats) {
    const target = (review.fixes ?? []).filter((f) => beatAt(f.t) === b).map((f) => f.regenPrompt).filter(Boolean).join('; ');
    if (target) prompts[b] = `${FOLEY[b].split(':')[0]}: ${target}`;
  }
}
const FINAL = join(ROOT, 'output', 'short-wow.mp4');
copyFileSync(best.cut, FINAL);
writeFileSync(join(LOOP, 'script-result.json'), JSON.stringify({ winner: best.round, review: best.review, estExtraSpendUsd: +spend.toFixed(3) }, null, 2));
console.log(`\n✓ ${FINAL} (round ${best.round}, overall ${best.review.overall}/10, ship votes ${best.review.ships}/3) est V2A spend $${spend.toFixed(3)}`);
