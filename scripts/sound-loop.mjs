#!/usr/bin/env node
// The closed sound-design loop (Craft Law sound rules, proposed 2026-07-08):
//
//   stems → Auphonic multitrack mix → mux → BLIND REVIEW (Gemini, it can hear)
//     → ship? done : regenerate the beats the reviewer flagged (MMAudio) → again
//
// The cut only reaches a human once the blind reviewer says ship (or rounds run
// out, delivering the best-scoring round with its review as a receipt).
// Receipts per round in output/sound-loop/round-N/.
//
//   node scripts/sound-loop.mjs            # fish cover, max 3 rounds
//   MAX_ROUNDS=2 node scripts/sound-loop.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COVER = join(ROOT, '.cache', 'cover');
const NAT = join(COVER, 'nat');
const LOOP = join(ROOT, 'output', 'sound-loop');
const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS ?? '3', 10);
const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') });
const fx = await import(join(ROOT, 'lib', 'ffmpeg.mjs'));
const cover = await import(join(ROOT, 'lib', 'cover.mjs'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
const AUPH = process.env.AUPHONIC_API_KEY;
const GEMINI = readFileSync('/Users/mitchellwilliams/Documents/career-ops/.env', 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!AUPH || !GEMINI) throw new Error('need AUPHONIC_API_KEY (.env) and GEMINI_API_KEY (career-ops/.env)');
let spend = 0;

// Base foley direction per beat (space + material per Craft Law): regens append
// the blind reviewer's instruction to these.
const FOLEY = [
  'inside a busy echoing indoor fish market hall: a heavy wet fleshy whole fish slapped down onto crushed ice, weighty impact, ice crunch',
  'a quiet dawn market street outdoors: distant seagulls, wet cobblestones underfoot, a far-off roll-up gate, open air',
  'inside an indoor market hall: a man hauling a heavy ice crate, boots on wet concrete, apron rustle, ice shifting inside, natural room reverb',
  'inside an indoor market hall: a metal shovel scooping crushed ice and pouring it across a steel counter, distinct weighty granular ice cascade, room reverb',
  'inside an indoor market hall: whole fish and crabs tumbling wet onto crushed ice, weighty fleshy thuds, water spray, plastic tote knock, room reverb',
  'inside an indoor market hall: small tourist crowd murmur, clothing rustle, one quiet real camera shutter click, room reverb',
  'inside a busy indoor fish market: wet fish being arranged on ice, weighty handling, crowd murmur behind, room reverb',
  'inside a busy indoor fish market: wet fleshy slaps of a fish passed hand to hand down a line, workers grunting, market crowd, room reverb',
  'inside an indoor market: butcher paper crinkling and folding fast around a fish, package sliding on a counter, room reverb',
  'a city morning outside a market: traffic hum, seagulls, faint neon buzz, open air',
  'inside an echoing indoor fish market: a worker winding up and shouting one short loud holler that rings out and echoes in the hall, apron fabric movement, crowd hushing',
  'inside an echoing indoor fish market: a whole fish flying through the air, a clean air whoosh, crowd gasp rising, hall reverb, no water sounds',
  'inside a quiet indoor market hall: room tone, the slow creak and chain clink of a hanging brass scale, natural reverb',
  'inside an echoing indoor fish market: a heavy wet fleshy fish caught hard in waiting hands on butcher paper, one sharp weighty slap with hall reverb, paper rustle, then a low warm murmur of impressed human voices',
];
const IMPACT = { 0: 0.12, 13: 0.12 }; // peak must land this far after the cut
const NEG = 'music, melody, score, singing, birds, bird calls, seagull screech, screeching, squawking, animal sounds, high-pitched';

const durs = FOLEY.map((_, i) => fx.probeDuration(join(COVER, 'beat', `beat-${i}.mp4`)));
const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, d) => a + d, 0));
const total = starts[13] + durs[13];
const beatAt = (t) => Math.max(0, starts.findLastIndex((s) => s <= t));

function peakTime(path) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'], { maxBuffer: 64 * 1024 * 1024 });
  let max = 0, at = 0;
  for (let i = 0; i < pcm.length - 1; i += 2) { const v = Math.abs(pcm.readInt16LE(i)); if (v > max) { max = v; at = i / 2; } }
  return at / 8000;
}

// ── MMAudio per-shot foley (video-to-audio; always freeze-extended for tails) ──
async function mmaudio(i, prompt) {
  const H = { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' };
  const proxy = join(NAT, `beat-${i}-proxy-loop.mp4`);
  ff(['-i', join(COVER, 'beat', `beat-${i}.mp4`), '-vf', 'scale=-2:480,tpad=stop_mode=clone:stop_duration=1.2', '-an', '-crf', '30', '-preset', 'veryfast', proxy]);
  const submit = await fetch('https://queue.fal.run/fal-ai/mmaudio-v2', {
    method: 'POST', headers: H, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      video_url: `data:video/mp4;base64,${readFileSync(proxy).toString('base64')}`,
      prompt, negative_prompt: NEG, duration: Math.max(1, Math.ceil(durs[i] + 1.2)),
    }),
  });
  if (!submit.ok) throw new Error(`mmaudio submit ${submit.status}: ${(await submit.text()).slice(0, 200)}`);
  const { status_url, response_url } = await submit.json();
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const j = await (await fetch(status_url, { headers: H, signal: AbortSignal.timeout(30_000) })).json();
    if (j.status === 'COMPLETED') break;
    if (j.status === 'FAILED' || j.error) throw new Error('mmaudio failed: ' + JSON.stringify(j).slice(0, 200));
    await new Promise((r) => setTimeout(r, 4000));
  }
  const out = await (await fetch(response_url, { headers: H, signal: AbortSignal.timeout(60_000) })).json();
  const url = out.video?.url ?? out.video_url;
  if (!url) throw new Error('mmaudio: no video url');
  const va = join(NAT, `beat-${i}-va2.mp4`);
  writeFileSync(va, Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(120_000) })).arrayBuffer()));
  spend += Math.ceil(durs[i] + 1.2) * 0.001;
  return va;
}

// ── stems: nat layer assembled aligned + gated but unshaped (Auphonic levels) ──
function buildStems(dir) {
  const wavs = FOLEY.map((_, i) => {
    const va2 = join(NAT, `beat-${i}-va2.mp4`);
    const va = existsSync(va2) ? va2 : join(NAT, `beat-${i}-va.mp4`);
    const wav = join(dir, `nat-${i}.wav`);
    let take = Math.min(fx.probeDuration(va), durs[i] + 1.2), fadeIn = 0.25;
    if (IMPACT[i] !== undefined) {
      const full = join(dir, `nat-${i}-full.wav`);
      ff(['-i', va, '-vn', full]);
      const trim = Math.max(0, peakTime(full) - IMPACT[i]);
      take = Math.min(fx.probeDuration(va) - trim, durs[i] + 1.2);
      ff(['-ss', trim.toFixed(3), '-i', full, '-t', take.toFixed(3), wav]);
      fadeIn = 0.03;
    } else ff(['-i', va, '-vn', '-t', take.toFixed(3), wav]);
    if (fx.highBandGapDb(wav) < 8) fx.lowpassAudio(wav, 5000);
    return { wav, at: starts[i], dur: take, fadeIn };
  });
  const inputs = wavs.flatMap((t) => ['-i', t.wav]);
  const parts = wavs.map((t, i) => {
    const d = Math.round(t.at * 1000);
    return `[${i}:a]afade=t=in:st=0:d=${t.fadeIn},afade=t=out:st=${Math.max(0.1, t.dur - 0.4).toFixed(2)}:d=0.4,adelay=${d}|${d}[n${i}]`;
  });
  const natStem = join(dir, 'nat-stem.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex',
    parts.join(';') + `;${wavs.map((_, i) => `[n${i}]`).join('')}amix=inputs=${wavs.length}:duration=longest:normalize=0[out]`,
    '-map', '[out]', '-t', total.toFixed(2), natStem]);
  const ambStem = join(dir, 'amb-stem.wav');
  ff(['-stream_loop', '-1', '-i', join(COVER, 'ambience.mp3'), '-t', total.toFixed(2), ambStem]);
  const musStem = join(dir, 'mus-stem.wav');
  ff(['-i', join(COVER, 'music.mp3'), '-af', 'apad', '-t', total.toFixed(2), musStem]);
  return { voice: join(COVER, 'piece.mp3'), nat: natStem, music: musStem, amb: ambStem };
}

// ── Auphonic multitrack: the actual mix engineer ──────────────────────────────
async function auphonicMix(stems, dir, title) {
  const AH = { Authorization: `bearer ${AUPH}` };
  const create = await fetch('https://auphonic.com/api/productions.json', {
    method: 'POST', headers: { ...AH, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      is_multitrack: true,
      metadata: { title },
      // Lesson from rounds 1-2 (both no-ship, nat+music scored 3/10): with
      // continuous narration, 'ducking' + gate + crossgate suppress the other
      // stems to inaudible — the reviewer kept asking for sounds that were in
      // the stems. Nat is pre-aligned and pre-faded, so it passes 'unchanged'
      // with a lift; music and amb ride as constant background beds.
      multi_input_files: [
        { type: 'multitrack', id: 'voice', algorithms: { backforeground: 'foreground' } },
        { type: 'multitrack', id: 'nat', algorithms: { backforeground: 'unchanged', gain: 3, filtering: false } },
        { type: 'multitrack', id: 'music', algorithms: { backforeground: 'background', filtering: false } },
        { type: 'multitrack', id: 'amb', algorithms: { backforeground: 'background', gain: -3, filtering: false } },
      ],
      algorithms: { leveler: true, gate: false, crossgate: false, loudnesstarget: -14, maxpeak: -2 },
      output_files: [{ format: 'wav' }],
    }),
  });
  if (!create.ok) throw new Error(`auphonic create ${create.status}: ${(await create.text()).slice(0, 300)}`);
  const uuid = (await create.json()).data.uuid;
  const form = new FormData();
  for (const [id, path] of Object.entries(stems)) form.append(id, new Blob([readFileSync(path)]), `${id}.wav`);
  const up = await fetch(`https://auphonic.com/api/production/${uuid}/upload.json`, { method: 'POST', headers: AH, body: form, signal: AbortSignal.timeout(300_000) });
  if (!up.ok) throw new Error(`auphonic upload ${up.status}: ${(await up.text()).slice(0, 300)}`);
  const st = await fetch(`https://auphonic.com/api/production/${uuid}/start.json`, { method: 'POST', headers: AH, signal: AbortSignal.timeout(60_000) });
  if (!st.ok) throw new Error(`auphonic start ${st.status}: ${(await st.text()).slice(0, 300)}`);
  const deadline = Date.now() + 15 * 60 * 1000;
  let prod;
  while (Date.now() < deadline) {
    prod = (await (await fetch(`https://auphonic.com/api/production/${uuid}.json`, { headers: AH, signal: AbortSignal.timeout(30_000) })).json()).data;
    if (prod.status === 3) break;
    if (prod.status === 2 || prod.error_message) throw new Error(`auphonic error: ${prod.error_message ?? prod.status_string}`);
    console.log(`  auphonic: ${prod.status_string}...`);
    await new Promise((r) => setTimeout(r, 8000));
  }
  if (prod.status !== 3) throw new Error('auphonic timed out');
  const dlUrl = prod.output_files?.[0]?.download_url;
  if (!dlUrl) throw new Error('auphonic: no output download_url');
  const mixed = join(dir, 'mix.wav');
  writeFileSync(mixed, Buffer.from(await (await fetch(dlUrl, { headers: AH, signal: AbortSignal.timeout(300_000) })).arrayBuffer()));
  return mixed;
}

// ── blind review: structured, zero context ────────────────────────────────────
async function blindReview(videoPath, dir) {
  const proxy = join(dir, 'review-proxy.mp4');
  ff(['-i', videoPath, '-vf', 'scale=-2:480', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', proxy]);
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI }, signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'video/mp4', data: readFileSync(proxy).toString('base64') } },
        { text: `You are a veteran re-recording mixer reviewing a 28-second vertical short with narration, for a paying client deciding whether to ship. You have no other context. Judge ONLY the soundtrack, harshly: mix hierarchy, music, natural-sound realism, sync, transitions, artifacts, loudness/polish.\n\nReturn JSON only:\n{"scores":{"hierarchy":0-10,"music":0-10,"nat":0-10,"sync":0-10,"transitions":0-10,"artifacts":0-10,"polish":0-10},"overall":0-10,"ship":true|false,"fixes":[{"t":seconds,"instruction":"what is wrong","regenPrompt":"POSITIVE-ONLY description of the CORRECT sound for this moment, as a text-to-foley prompt. Never name the artifact being removed — a generation model treats every noun as a request. Wrong: 'remove the splash, add a whoosh'. Right: 'one clean dry air whoosh, indoor hall reverb'."}]}\n\nfixes = top priority items only (max 4), t = timestamp in seconds as a number.` },
      ] }],
      generationConfig: { response_mime_type: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const text = (await r.json()).candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}';
  writeFileSync(join(dir, 'review.json'), text);
  return JSON.parse(text);
}

// ── the loop ──────────────────────────────────────────────────────────────────
let best = null;
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const dir = join(LOOP, `round-${round}`);
  mkdirSync(dir, { recursive: true });
  console.log(`\n▶ round ${round}: stems`);
  const stems = buildStems(dir);
  console.log(`▶ round ${round}: auphonic multitrack mix`);
  const mixed = await auphonicMix(stems, dir, `fish-cover sound-loop r${round}`);
  const cut = join(dir, 'cut.mp4');
  cover.muxPieceAudio(join(COVER, 'beat', 'visual-track.mp4'), mixed, join(COVER, 'captions.srt'), cut);
  console.log(`▶ round ${round}: blind review`);
  const review = await blindReview(cut, dir);
  console.log(`  scores ${JSON.stringify(review.scores)} overall ${review.overall} ship=${review.ship}`);
  for (const f of review.fixes ?? []) console.log(`  fix @${f.t}s (beat ${beatAt(f.t)}): ${f.instruction.slice(0, 90)}`);
  if (!best || review.overall > best.review.overall) best = { cut, review, round };
  if (review.ship) { console.log(`\n✓ SHIP verdict in round ${round}`); break; }
  if (round === MAX_ROUNDS) { console.log(`\n⚠ rounds exhausted; best was round ${best.round} (${best.review.overall}/10)`); break; }
  // regenerate the flagged beats with the reviewer's instruction folded in
  const beats = [...new Set((review.fixes ?? []).map((f) => beatAt(f.t)))];
  console.log(`▶ round ${round}: regenerating beats ${beats.join(', ')}`);
  await Promise.all(beats.map((b) => {
    // regenPrompt only: reviewer complaint text names the artifacts, and a
    // generation model treats every noun as a request (the "splash" lesson)
    const target = (review.fixes ?? []).filter((f) => beatAt(f.t) === b).map((f) => f.regenPrompt).filter(Boolean).join('; ');
    return mmaudio(b, target ? `${FOLEY[b].split(':')[0]}: ${target}` : FOLEY[b]);
  }));
}
const FINAL = join(ROOT, 'output', 'cover-final.mp4');
execFileSync('cp', [best.cut, FINAL]);
writeFileSync(join(LOOP, 'result.json'), JSON.stringify({ winner: best.round, review: best.review, estExtraSpendUsd: +spend.toFixed(3), finished: 'stamped-by-caller' }, null, 2));
console.log(`\n✓ ${FINAL} (round ${best.round}, overall ${best.review.overall}/10, ship=${best.review.ship}) est extra spend $${spend.toFixed(3)}`);
