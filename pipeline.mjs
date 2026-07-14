#!/usr/bin/env node
// pipeline.mjs: picture-lock orchestrator. An ElevenLabs-native AI production studio.
// Resumable (content-hash cache), cost-logged (output/run-manifest.json).
//
//   node pipeline.mjs --script input/script.md            # full run
//   node pipeline.mjs --script input/script.md --stage voiceover
//   node pipeline.mjs --script input/script.md --dub es   # + dub
//   node pipeline.mjs --stage voiceover --dry-run         # auth/plan check, no spend
//   node pipeline.mjs --skip-gen                          # $0 visuals: mograph only, gen beats → cards
//   node pipeline.mjs --reroll-beat 4 --reroll-beat 7     # retake specific beats (0-based)
//   node pipeline.mjs --budget 25                         # hard spend ceiling (default 50)
//   node pipeline.mjs --cover piece.mp3 [--music]         # cover YOUR piece with AI b-roll → output/cover.mp4
//   node pipeline.mjs --redirect                          # force the creative council to re-run
//   node pipeline.mjs --no-creative                       # skip the council (flat shot list)
//   node pipeline.mjs --max-retakes 2                     # review-board regen ceiling per beat (default 1)
//   node pipeline.mjs --reflect "feedback text"           # feedback → proposed Craft Law (craft/rules.md)

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
try { const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') }); } catch {}

const args = process.argv.slice(2);
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const has = (f) => args.includes(f);

const SCRIPT = arg('--script', 'input/script.md');
const COVER = arg('--cover', null);        // bring-your-own-piece: audio/video in, AI b-roll cover out
// Craft Law rule 4: the bed runs under the piece by default in cover mode
const WANT_MUSIC = COVER ? !has('--no-music') : has('--music');
const REFLECT_TEXT = arg('--reflect', null); // feedback → proposed Craft Law additions
// The creative council (lib/creative.mjs) directs shots/pacing/sound and
// vision-reviews every generated clip. On by default when the key is present.
const CREATIVE = !has('--no-creative') && !!process.env.ANTHROPIC_API_KEY;
const MAX_RETAKES = parseInt(arg('--max-retakes', '1'), 10);
const REDIRECT = has('--redirect');        // force the council to re-run (ignore cached brief)
const ONLY = arg('--stage', null);        // run a single stage
const DUB_LANG = arg('--dub', null);
const DRY = has('--dry-run');
const MOCK = has('--mock');                // end-to-end run with $0 spend (say + ffmpeg)
const SKIP_GEN = has('--skip-gen');        // $0 visuals: mograph renders, gen beats fall back to cards
const BUDGET = parseFloat(arg('--budget', '50'));
// --reroll-beat N (repeatable, 0-based to match beat-N filenames): bypass the
// clip cache for those beats and keep the old take alongside.
const REROLL = args.flatMap((a, i) => (a === '--reroll-beat' ? [parseInt(args[i + 1], 10)] : [])).filter(Number.isInteger);

const CACHE = join(ROOT, '.cache');
const OUT = join(ROOT, 'output');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const manifest = { started: null /* stamp after run */, script: SCRIPT, dry: DRY, calls: [], costUsd: 0 };
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const rel = (p) => (p && p.startsWith(ROOT + '/') ? p.slice(ROOT.length + 1) : p);
function record(stage, meta, costUsd = 0) {
  manifest.calls.push({ stage, ...meta, costUsd });
  manifest.costUsd += costUsd;
  console.log(`  [${stage}] ${JSON.stringify(meta)}  $${costUsd.toFixed(4)}`);
}

// ── [1] parseScript ──────────────────────────────────────────────────────────
// input/script.md format: one beat per block:
//   ## beat
//   VO: <narration line>
//   VISUAL: <b-roll prompt>
//   SECONDS: <n>
function parseScript(path) {
  const raw = readFileSync(join(ROOT, path), 'utf8');
  const beats = [];
  for (const block of raw.split(/^##\s+/m).slice(1)) {
    const vo = (block.match(/^VO:\s*(.+)/im) || [])[1]?.trim() || '';
    const visual = (block.match(/^VISUAL:\s*(.+)/im) || [])[1]?.trim() || '';
    const sfx = (block.match(/^SFX:\s*(.+)/im) || [])[1]?.trim() || '';
    const seconds = parseFloat((block.match(/^SECONDS:\s*([\d.]+)/im) || [])[1] || '5');
    const mode = ((block.match(/^VISUAL-MODE:\s*(\w+)/im) || [])[1] || '').toLowerCase();
    const mographTemplate = (block.match(/^MOGRAPH:\s*([\w-]+)/im) || [])[1] || null;
    const caption = (block.match(/^CAPTION:\s*(.+)/im) || [])[1]?.trim() || '';
    if (!vo && !visual) continue;
    const visualMode = mode || (visual ? 'gen' : 'card');
    if (visualMode === 'mograph' && !mographTemplate)
      throw new Error(`beat ${beats.length}: VISUAL-MODE is mograph but no MOGRAPH: template named`);
    if (visualMode === 'gen' && !visual)
      throw new Error(`beat ${beats.length}: VISUAL-MODE is gen but no VISUAL: prompt given`);
    beats.push({ vo, visualPrompt: visual, sfxPrompt: sfx, seconds, visualMode, mographTemplate, caption });
  }
  return beats;
}

// ── stages (stubs call lib/elevenlabs.mjs; wired incrementally) ───────────────
const el = await import('./lib/elevenlabs.mjs');
const fx = await import('./lib/ffmpeg.mjs');
import { writeFileSync as _wf, copyFileSync as _cp } from 'fs';

const VO_DIR = join(CACHE, 'vo');
const BEAT_DIR = join(CACHE, 'beat');
mkdirSync(VO_DIR, { recursive: true });

// beats carry their generated assets forward to assemble (voPath).
async function stageVoiceover(beats) {
  console.log(`▶ [2] voiceover${MOCK ? ' (MOCK: macOS say, $0)' : ''}`);
  if (DRY) { await el.listVoices().then(v => console.log(`  auth OK: ${v.voices?.length ?? '?'} voices available`)); return; }
  for (const [i, b] of beats.entries()) {
    if (!b.vo) { b.voPath = null; continue; }
    if (MOCK) {
      b.voPath = fx.mockVoiceover(b.vo, join(VO_DIR, `beat-${i}.aiff`));
      record('voiceover', { beat: i, chars: b.vo.length, mock: true }, 0);
    } else {
      const voiceId = process.env.XI_VOICE_ID;
      if (!voiceId) throw new Error('XI_VOICE_ID not set: add a default voice id to .env (see .env.example).');
      b.voPath = join(VO_DIR, `beat-${i}.mp3`);
      // content-hash cache: a reworded line regenerates only its own beat
      const key = hash(`${voiceId}:${b.vo}`), sc = join(VO_DIR, `beat-${i}.json`);
      let side = null;
      try { side = JSON.parse(readFileSync(sc, 'utf8')); } catch {}
      if (side?.textHash === key && existsSync(b.voPath) && !REROLL.includes(i)) {
        record('voiceover', { beat: i, chars: b.vo.length, cached: true, originalCostUsd: side.costUsd ?? 0 }, 0);
        continue;
      }
      const buf = await el.tts({ text: b.vo, voiceId });
      const cost = (b.vo.length / 1000) * 0.10; // ~$0.10/1k chars
      _wf(b.voPath, buf);
      _wf(sc, JSON.stringify({ textHash: key, costUsd: cost, createdAt: new Date().toISOString() }));
      record('voiceover', { beat: i, chars: b.vo.length }, cost);
    }
  }
}

// A beat's real length is max(scripted seconds, VO length): the same rule
// renderBeat uses, so score length and SFX offsets track the actual edit.
function beatDur(b) { return Math.max(b.seconds || 5, b.voPath ? fx.probeDuration(b.voPath) : 0); }
// ── [3] visuals: hybrid, per-beat via VISUAL-MODE ────────────────────────────
//   mograph → deterministic Playwright render of the pipeline's real artifacts ($0)
//   gen     → text-to-video through the pluggable provider adapter (lib/fal.mjs)
//   card    → solid color (also the --mock and --skip-gen fallback)
// script mode and cover mode keep separate clip caches so neither clobbers the other
const BROLL_DIR = COVER ? join(CACHE, 'cover', 'broll') : join(CACHE, 'broll');
let VISUAL_SYSTEM = ''; // set by the council (either mode); guides the review board

function sidecarPath(i) { return join(BROLL_DIR, `beat-${i}.json`); }
function clipCached(i, key) {
  try {
    const sc = JSON.parse(readFileSync(sidecarPath(i), 'utf8'));
    return sc.promptHash === key && existsSync(join(BROLL_DIR, `beat-${i}.mp4`));
  } catch { return false; }
}
function keepTake(i) { // reroll: keep the old clip as evidence, cheap retakes
  const cur = join(BROLL_DIR, `beat-${i}.mp4`);
  if (!existsSync(cur)) return;
  let n = 1;
  while (existsSync(join(BROLL_DIR, `beat-${i}.take${n}.mp4`))) n++;
  renameSync(cur, join(BROLL_DIR, `beat-${i}.take${n}.mp4`));
}

// Real artifacts feeding each template. The manifest-driven templates read the
// manifest from the PREVIOUS run; reroll beats 4/6 after a live run to show
// fresh numbers (mograph rerolls are $0).
function mographData(template, b, i, beats, mo) {
  switch (template) {
    case 'md-to-timeline':
      return { scriptText: readFileSync(join(ROOT, SCRIPT), 'utf8'), beatCount: beats.length };
    case 'waveform': {
      // stage-only runs have no voPath in memory; fall back to the cached file
      const voFile = b.voPath ?? [`beat-${i}.mp3`, `beat-${i}.aiff`].map((f) => join(VO_DIR, f)).find(existsSync) ?? null;
      return { peaks: voFile ? mo.extractWaveformPeaks(voFile) : [], voLabel: voFile ? voFile.replace(ROOT + '/', '') : `.cache/vo/beat-${i}.mp3` };
    }
    case 'manifest-terminal': {
      let lines = ['{', '  "note": "run the pipeline once to fill this manifest"', '}'];
      try { lines = readFileSync(join(OUT, 'run-manifest.json'), 'utf8').split('\n'); } catch {}
      return { lines };
    }
    case 'reroll':
      return {
        command: 'node pipeline.mjs --reroll-beat 4',
        outputLines: ['regenerating beat 4 (1 clip) ...', `cached: ${beats.length - 1} beats untouched`, '✓ new cut assembled'],
        beatCount: beats.length, targetBeat: 4,
      };
    case 'receipt': {
      // the cut's production cost: fresh spend plus the original cost of every
      // cached artifact reused in it (each call logs which it was)
      try {
        const m = JSON.parse(readFileSync(join(OUT, 'run-manifest.json'), 'utf8'));
        const by = {};
        let total = 0;
        for (const c of m.calls ?? []) {
          const v = c.costUsd || c.originalCostUsd || 0;
          by[c.stage] = (by[c.stage] || 0) + v;
          total += v;
        }
        const lines = Object.entries(by).map(([k, v]) => ({ label: k, value: '$' + v.toFixed(3) }));
        return { lines, total: total.toFixed(3), costSource: 'estimate, logged per call' };
      } catch { return { lines: [{ label: 'first run pending', value: '' }], total: '0.000', costSource: 'estimate' }; }
    }
    case 'dub-card':
      return { command: 'node pipeline.mjs --dub es', langs: ['ES', 'FR', 'DE', 'PT', 'JA', 'HI', 'KO', 'IT'] };
    case 'endcard':
      return { command: 'node pipeline.mjs --script input/script.md' };
    default:
      throw new Error(`unknown MOGRAPH template: ${template}`);
  }
}

async function renderMographBeats(beats, moBeats) {
  const mo = await import('./lib/mograph.mjs');
  for (const [b, i] of moBeats) {
    const out = join(BROLL_DIR, `beat-${i}.mp4`);
    const tplFile = join(ROOT, 'templates', 'mograph', `${b.mographTemplate}.html`);
    const data = mographData(b.mographTemplate, b, i, beats, mo);
    const key = hash(`mograph:${b.mographTemplate}:${b.seconds}:${hash(readFileSync(tplFile, 'utf8'))}:${hash(JSON.stringify(data))}`);
    if (!REROLL.includes(i) && clipCached(i, key)) {
      b.clipPath = out;
      record('visuals', { beat: i, mode: 'mograph', template: b.mographTemplate, cached: true }, 0);
      continue;
    }
    keepTake(i);
    await mo.renderMograph({ template: b.mographTemplate, seconds: b.seconds, data, outPath: out, log: console.log });
    writeFileSync(sidecarPath(i), JSON.stringify({ promptHash: key, mode: 'mograph', template: b.mographTemplate, createdAt: new Date().toISOString() }, null, 2));
    b.clipPath = out;
    record('visuals', { beat: i, mode: 'mograph', template: b.mographTemplate }, 0);
  }
}

async function stageVisuals(beats) {
  console.log(`▶ [3] visuals${MOCK ? ' (MOCK: mograph + color cards, $0)' : ` (hybrid: mograph + ${SKIP_GEN ? 'gen SKIPPED' : 'gen'})`}`);
  mkdirSync(BROLL_DIR, { recursive: true });
  const genBeats = beats.map((b, i) => [b, i]).filter(([b]) => b.visualMode === 'gen');
  const moBeats = beats.map((b, i) => [b, i]).filter(([b]) => b.visualMode === 'mograph');
  if (MOCK) {
    // mograph is $0, so mock renders it too; gen beats stay color cards
    try { await renderMographBeats(beats, moBeats); }
    catch (e) { record('visuals', { mock: true, note: `mograph unavailable, cards instead: ${e.message.slice(0, 90)}` }); }
    record('visuals', { beats: beats.length, mock: true, note: 'gen beats: color cards' });
    return;
  }
  const fal = await import('./lib/fal.mjs');
  const slug = process.env.FAL_MODEL_SLUG ?? fal.DEFAULT_SLUG;

  if (DRY) {
    const v = process.env.FAL_KEY
      ? await fal.verifyModel(slug).catch((e) => ({ live: false, error: e.message }))
      : { live: false, error: 'FAL_KEY not set' };
    let projected = 0;
    for (const [b, i] of genBeats) {
      const est = fal.estimateCost(slug, b.seconds);
      projected += est;
      console.log(`  beat ${i}: gen "${b.visualPrompt.slice(0, 50)}..." ~$${est.toFixed(2)}`);
    }
    for (const [b, i] of moBeats) console.log(`  beat ${i}: mograph ${b.mographTemplate} $0`);
    record('visuals', { dry: true, slug, slugLive: v.live !== false, ...(v.error ? { slugError: v.error } : {}), projectedUsd: +projected.toFixed(2) });
    return;
  }

  // mograph first: $0, and it renders the real artifacts
  if (moBeats.length) await renderMographBeats(beats, moBeats);

  // script mode: the council rewrites gen-beat prompts into one visual system
  // (cover mode arrives here already directed, VISUAL_SYSTEM set by runCover)
  if (CREATIVE && !COVER && !SKIP_GEN && genBeats.length) {
    const creative = await import('./lib/creative.mjs');
    const segments = genBeats.map(([b, i]) => ({ index: i, text: b.vo, visual: b.visualPrompt, seconds: b.seconds }));
    // v2: brief carries musicPrompt/ambiencePrompt (three-layer sound); the
    // version bump retires cached v1 briefs that lack the sound direction
    const key = hash('directShots:v2:' + JSON.stringify(segments));
    const bPath = join(CACHE, 'script-brief.json');
    let directed = null;
    try { const c = JSON.parse(readFileSync(bPath, 'utf8')); if (c.key === key && !REDIRECT) directed = c; } catch {}
    if (directed) {
      record('council', { cached: true, shots: directed.shots.length, originalCostUsd: directed.costUsd ?? 0 }, 0);
    } else {
      console.log('▶ [council] directing the generated shots (7 specialists + director)');
      directed = await creative.directShots({
        fullScript: beats.map((b, i) => `[beat ${i}${b.visualMode === 'mograph' ? ' · mograph (locked)' : ''}] ${b.vo}`).join('\n'),
        segments,
        context: 'This piece mixes locked code-rendered motion-graphics beats with generated live-action beats. Only the listed beats get generated footage; they must read as one film with each other.',
        log: console.log,
      });
      directed.key = key;
      writeFileSync(bPath, JSON.stringify(directed, null, 2));
      record('council', { model: process.env.CREATIVE_MODEL ?? 'claude-opus-4-8', shots: directed.shots.length, costSource: 'estimate' }, directed.costUsd);
    }
    VISUAL_SYSTEM = directed.visualSystem;
    for (const [b, i] of genBeats) {
      const shot = directed.shots.find((s) => s.beat === i);
      if (!shot) continue;
      b.visualPrompt = shot.prompt;
      b.medium = shot.medium ?? 'live';
      b.stillPrompt = shot.stillPrompt ?? null;
      b.motionPrompt = shot.motionPrompt ?? null;
    }
  }

  // gen beats: cached → reuse; --skip-gen → color card; else submit in parallel
  const todo = [];
  for (const [b, i] of genBeats) {
    const out = join(BROLL_DIR, `beat-${i}.mp4`);
    const key = genKey(fal, slug, b);
    if (!REROLL.includes(i) && clipCached(i, key)) {
      b.clipPath = out;
      let orig = 0;
      try { orig = JSON.parse(readFileSync(sidecarPath(i), 'utf8')).estCostUsd ?? 0; } catch {}
      record('visuals', { beat: i, mode: 'gen', medium: b.medium ?? 'live', cached: true, originalCostUsd: orig, costSource: 'cache' }, 0);
    } else if (SKIP_GEN) {
      record('visuals', { beat: i, mode: 'gen', note: 'skipped (--skip-gen): color card fallback' }, 0);
    } else {
      todo.push({ b, i, out, key });
    }
  }
  if (todo.length) {
    const projected = todo.reduce((a, { b }) => a + genEstimate(fal, slug, b), 0);
    if (manifest.costUsd + projected > BUDGET)
      throw new Error(`budget guard: $${manifest.costUsd.toFixed(2)} spent + $${projected.toFixed(2)} projected > --budget ${BUDGET}`);
    // allSettled: one beat's provider failure must not sink the batch; the
    // failed beat falls back to a color card and the run keeps its receipts
    const settled = await Promise.allSettled(todo.map(async ({ b, i, out, key }) => {
      const tmp = join(BROLL_DIR, `beat-${i}.new.mp4`);
      const r = await generateBeatClip(fal, slug, b, i, tmp);
      keepTake(i); // only retire the old take once the new one exists
      renameSync(tmp, out);
      writeFileSync(sidecarPath(i), JSON.stringify({ promptHash: key, mode: 'gen', medium: r.medium, ...r, createdAt: new Date().toISOString() }, null, 2));
      b.clipPath = out;
      record('visuals', { beat: i, mode: 'gen', medium: r.medium, requestId: r.requestId, requestedSeconds: r.requestedSeconds, costSource: 'estimate' }, r.estCostUsd);
    }));
    settled.forEach((s, k) => {
      if (s.status === 'rejected')
        record('visuals', { beat: todo[k].i, mode: 'gen', error: String(s.reason?.message ?? s.reason).slice(0, 140), note: 'generation failed: color card fallback' }, 0);
    });
  }

  // the council's review board judges every generated clip; bad takes reroll
  await reviewAndRetake(beats);
}
// Craft Law rule 10: every generated effect and the ambience bed pass the
// harshness gate; failures regenerate softer once (script and cover modes
// share this — highBandGapDb gap < 8dB means screechy highs).
// Returns { gap, fresh }: callers must record cost only on fresh (billable)
// generations, so the manifest receipt never double-counts cache hits.
async function guardedSfx(text, durationSeconds, outFile, label) {
  // content-hash sidecar: a changed prompt or length must never serve a stale
  // artifact (the 72s-old-score-under-a-53s-cut lesson, 2026-07-08)
  const sideFile = outFile + '.json';
  const key = hash(`${text}:${durationSeconds}`);
  let side = null;
  try { side = JSON.parse(readFileSync(sideFile, 'utf8')); } catch {}
  if (side?.key !== key && existsSync(outFile)) { const { unlinkSync } = await import('fs'); unlinkSync(outFile); }
  let fresh = false;
  if (!existsSync(outFile)) {
    _wf(outFile, await el.soundEffect({ text, durationSeconds }));
    _wf(sideFile, JSON.stringify({ key, text: text.slice(0, 120), durationSeconds, createdAt: new Date().toISOString() }));
    fresh = true;
  }
  let gap = fx.highBandGapDb(outFile);
  if (gap < 8) {
    record('audio-qa', { file: label, gapDb: +gap.toFixed(1), verdict: 'harsh: regenerating softer' }, 0);
    _wf(outFile, await el.soundEffect({
      // truncate the base first: soundEffect slices at 450 chars and the
      // softening directive must survive on long prompts
      text: `${text.slice(0, 320)}. Soft, muffled, rounded, low-frequency, gentle; absolutely no screeching, scraping, hissing, or harsh high frequencies.`,
      durationSeconds,
    }));
    gap = fx.highBandGapDb(outFile);
  }
  if (gap < 8) {
    // deterministic last resort: a regenerated take that is still bright gets
    // a hard file-level lowpass (proven on the v3 scale-clink accent: 6.1dB → 10.1dB)
    fx.lowpassAudio(outFile, 4200);
    gap = fx.highBandGapDb(outFile);
  }
  record('audio-qa', { file: label, gapDb: +gap.toFixed(1), verdict: gap < 8 ? 'still bright after lowpass: mixing anyway' : 'clean' }, 0);
  return { gap, fresh };
}

// The council's script-mode brief (cached by stageVisuals, which runs before
// the sound stages) carries the director's musicPrompt/ambiencePrompt. Briefs
// cached before the council directed sound simply lack the fields: two-layer
// mix until a --redirect run refreshes the brief.
function scriptBrief() {
  try { return JSON.parse(readFileSync(join(CACHE, 'script-brief.json'), 'utf8')); } catch { return null; }
}

async function stageScore(beats) {
  console.log(`▶ [4] score (Eleven Music v2)${MOCK ? ' (MOCK: skipped)' : ''}`);
  if (DRY || MOCK) { record('score', { note: 'skipped (dry/mock)' }); return; }
  const totalS = Math.ceil(beats.reduce((a, b) => a + beatDur(b), 0)) + 2;
  const briefMusicPrompt = scriptBrief()?.musicPrompt ?? null;
  const prompt = arg('--music-prompt', briefMusicPrompt ??
    'minimal cinematic electronic underscore, dark and restrained, slow pulse, no melody hook, instrumental bed under narration');
  const out = join(CACHE, 'music.mp3');
  // content-hash sidecar: score must re-render when the prompt or the cut's
  // length changes (a cached 72s score under a 53s cut reads as "no music")
  const mKey = hash(`${prompt}:${totalS}`);
  let mSide = null;
  try { mSide = JSON.parse(readFileSync(join(CACHE, 'music.json'), 'utf8')); } catch {}
  const musicFresh = !existsSync(out) || mSide?.key !== mKey;
  if (musicFresh) {
    const buf = await el.music({ prompt, lengthMs: totalS * 1000 });
    _wf(out, buf);
    _wf(join(CACHE, 'music.json'), JSON.stringify({ key: mKey, prompt: prompt.slice(0, 140), seconds: totalS, createdAt: new Date().toISOString() }));
  }
  manifest.musicPath = rel(out);
  const scoreCost = (totalS / 60) * 0.15;
  record('score', { seconds: totalS, model: 'music_v2', out: '.cache/music.mp3', briefed: !!briefMusicPrompt, ...(musicFresh ? {} : { cached: true, originalCostUsd: scoreCost }) }, musicFresh ? scoreCost : 0);
}
async function stageSfx(beats) {
  console.log(`▶ [5] sfx${MOCK ? ' (MOCK: skipped)' : ''}`);
  if (DRY || MOCK) { record('sfx', { note: 'skipped (dry/mock)' }); return; }
  const SFX_DIR = join(CACHE, 'sfx');
  mkdirSync(SFX_DIR, { recursive: true });
  manifest.sfx = [];
  let offset = 0, made = 0;
  for (const [i, b] of beats.entries()) {
    if (b.sfxPrompt) {
      const dur = Math.min(4, Math.max(1, (b.seconds || 5) * 0.6));
      const out = join(SFX_DIR, `beat-${i}.mp3`);
      const { fresh } = await guardedSfx(b.sfxPrompt, dur, out, `sfx beat ${i}`);
      manifest.sfx.push({ path: rel(out), atSec: offset });
      const sfxCost = (dur / 60) * 0.12;
      record('sfx', { beat: i, prompt: b.sfxPrompt.slice(0, 60), duration_s: dur, ...(fresh ? {} : { cached: true, originalCostUsd: sfxCost }) }, fresh ? sfxCost : 0);
      made++;
    }
    offset += beatDur(b); // measured, so accents stay on their beats in the real edit
  }
  if (!made) record('sfx', { note: 'no SFX: lines in script' });
}
async function stageAssemble(beats) {
  console.log('▶ [6] assemble (ffmpeg)');
  if (DRY) { record('assemble', { note: 'dry-run: skipped' }); return; }
  const clips = [], durations = [];
  for (const [i, b] of beats.entries()) {
    const { out, dur } = fx.renderBeat({ index: i, seconds: b.seconds, voPath: b.voPath, clipPath: b.clipPath ?? null, visualMode: b.visualMode, cacheDir: BEAT_DIR });
    clips.push(out); durations.push(dur);
  }
  const srtPath = join(BEAT_DIR, 'captions.srt');
  fx.buildSrt(beats, durations, srtPath);
  // mock runs must not clobber the last real cut (same doctrine as the
  // manifest: output/ holds evidence of LIVE production runs only)
  const finalPath = join(OUT, MOCK ? 'short.mock.mp4' : 'short.mp4');
  fx.assembleBeats(clips, srtPath, finalPath, BEAT_DIR);
  const sfxEntries = manifest.sfx ?? [];
  // continuous natural ambience bed, scene-matched by the director's brief
  // (Craft Law rule 10, same doctrine as cover mode; mixStems loops it)
  let ambientPath = null;
  const briefAmbiencePrompt = MOCK ? null : scriptBrief()?.ambiencePrompt;
  if (briefAmbiencePrompt) {
    ambientPath = join(CACHE, 'ambience.mp3');
    const ambDur = Math.min(28, Math.ceil(durations.reduce((a, d) => a + d, 0)) + 2);
    const { fresh } = await guardedSfx(briefAmbiencePrompt, ambDur, ambientPath, 'ambience bed');
    const ambCost = (ambDur / 60) * 0.12;
    record('ambience', { prompt: briefAmbiencePrompt.slice(0, 70), duration_s: ambDur, ...(fresh ? {} : { cached: true, originalCostUsd: ambCost }) }, fresh ? ambCost : 0);
  }
  if (!MOCK && (manifest.musicPath || ambientPath || sfxEntries.length)) {
    const mixed = join(BEAT_DIR, 'short-mixed.mp4');
    fx.mixStems(finalPath, manifest.musicPath ?? null, sfxEntries, mixed, { ambientPath });
    _cp(mixed, finalPath);
    record('mix', { music: !!manifest.musicPath, ambience: !!ambientPath, sfx: sfxEntries.length, note: 'three layers under the voice' });
  }
  const dur = fx.probeDuration(finalPath);
  const outName = MOCK ? 'short.mock' : 'short';
  record('assemble', { beats: clips.length, out: `output/${outName}.mp4`, captions: `output/${outName}.srt (soft)`, duration_s: +dur.toFixed(2) });
  // also drop a standalone SRT next to the video for NLE import
  try { _cp(srtPath, join(OUT, `${outName}.srt`)); } catch {}
}
async function stageDub(lang) {
  console.log(`▶ [7] dub → ${lang}${MOCK ? ' (MOCK: skipped)' : ''}`);
  if (DRY || MOCK) { record('dub', { lang, note: 'skipped (dry/mock)' }); return; }
  const finalPath = join(OUT, 'short.mp4');
  const { dubbing_id, expected_duration_sec } = await el.dubCreate({ filePath: finalPath, targetLang: lang });
  console.log(`  dubbing job ${dubbing_id}, expected ~${expected_duration_sec}s`);
  const deadline = Date.now() + 15 * 60 * 1000;
  let status = '';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    const j = await el.dubStatus(dubbing_id);
    status = j.status;
    if (status === 'dubbed') break;
    if (status === 'failed') throw new Error('dub job failed: ' + JSON.stringify(j).slice(0, 300));
  }
  if (status !== 'dubbed') throw new Error('dub polling timed out after 15 min');
  const buf = await el.dubDownload(dubbing_id, lang);
  const out = join(OUT, `short.${lang}.mp4`);
  _wf(out, buf);
  const mins = fx.probeDuration(finalPath) / 60;
  record('dub', { lang, dubbing_id, out: `output/short.${lang}.mp4` }, mins * 0.50);
}

// Generate one gen beat's clip via its medium: "animated" designs a legible
// still (nano banana 2) then animates it (image-to-video); "live" is direct
// text-to-video. Returns clip metadata incl. combined cost estimate.
async function generateBeatClip(fal, slug, b, i, out) {
  if (b.medium === 'animated' && b.stillPrompt) {
    const still = join(BROLL_DIR, `beat-${i}-still.png`);
    const img = await fal.generateImage({ prompt: b.stillPrompt, outPath: still, log: console.log });
    const vid = await fal.imageToVideo({
      prompt: b.motionPrompt || 'subtle cinematic push-in, elements animate naturally, dynamic and alive',
      imageUrl: img.url, seconds: b.seconds, outPath: out, log: console.log,
    });
    return { ...vid, estCostUsd: +(vid.estCostUsd + img.estCostUsd).toFixed(2), medium: 'animated' };
  }
  const r = await fal.generateClip({ prompt: b.visualPrompt, seconds: b.seconds, slug, outPath: out, log: console.log });
  return { ...r, medium: 'live' };
}

function genKey(fal, slug, b) {
  return b.medium === 'animated' && b.stillPrompt
    ? hash(`anim:${b.stillPrompt}:${b.motionPrompt ?? ''}:${b.seconds}`)
    : hash(`gen:${slug}:${b.visualPrompt}:${fal.pickDuration(slug, b.seconds)}`);
}

function genEstimate(fal, slug, b) {
  return b.medium === 'animated' ? 0.08 + fal.pickDuration(slug, b.seconds) * 0.10 : fal.estimateCost(slug, b.seconds);
}

// The council's review board judges every generated clip against the brief;
// unacceptable takes get re-prompted and regenerated, budget-guarded.
async function reviewAndRetake(beats) {
  if (!CREATIVE || MOCK || DRY || SKIP_GEN) return;
  const visualSystem = VISUAL_SYSTEM;
  const creative = await import('./lib/creative.mjs');
  const fal = await import('./lib/fal.mjs');
  const slug = process.env.FAL_MODEL_SLUG ?? fal.DEFAULT_SLUG;
  console.log('▶ [review] council review board judging generated clips');
  for (const [i, b] of beats.entries()) {
    if (b.visualMode !== 'gen' || !b.clipPath) continue;
    let takes = 0;
    const promptDesc = () => (b.medium === 'animated' ? `[animated] still: ${b.stillPrompt} | motion: ${b.motionPrompt ?? ''}` : b.visualPrompt);
    // clips the board already accepted for this exact prompt don't re-review
    let sc0 = null;
    try { sc0 = JSON.parse(readFileSync(sidecarPath(i), 'utf8')); } catch {}
    if (sc0?.acceptedKey === genKey(fal, slug, b)) {
      record('review', { beat: i, verdict: 'accept', cached: true }, 0);
      continue;
    }
    while (true) {
      const r = await creative.reviewClip({ clipPath: b.clipPath, shotPrompt: promptDesc(), visualSystem, beatText: b.caption || b.vo || '', scratchDir: CACHE });
      record('review', { beat: i, verdict: r.verdict, take: takes, ...(r.switchMedium ? { switchMedium: r.switchMedium } : {}), reasons: r.reasons.slice(0, 110) }, r.costUsd);
      const hasRevision = r.revisedPrompt || r.revisedStillPrompt || r.switchMedium;
      if (r.verdict === 'accept' || takes >= MAX_RETAKES || !hasRevision) {
        try {
          const sc = JSON.parse(readFileSync(sidecarPath(i), 'utf8'));
          sc.acceptedKey = genKey(fal, slug, b);
          writeFileSync(sidecarPath(i), JSON.stringify(sc, null, 2));
        } catch {}
        break;
      }
      // apply the board's revision, including medium switches
      if (r.switchMedium === 'animated' || (b.medium === 'animated' && r.revisedStillPrompt)) {
        b.medium = 'animated';
        b.stillPrompt = r.revisedStillPrompt ?? b.stillPrompt;
        b.motionPrompt = r.revisedMotionPrompt ?? b.motionPrompt;
      } else if (r.switchMedium === 'live') {
        b.medium = 'live';
        b.visualPrompt = r.revisedPrompt ?? b.visualPrompt;
      } else {
        b.visualPrompt = r.revisedPrompt ?? b.visualPrompt;
      }
      const est = genEstimate(fal, slug, b);
      if (manifest.costUsd + est > BUDGET) { record('review', { beat: i, note: 'budget guard: keeping current take' }); break; }
      takes++;
      const out = join(BROLL_DIR, `beat-${i}.mp4`);
      const tmp = join(BROLL_DIR, `beat-${i}.new.mp4`);
      const g = await generateBeatClip(fal, slug, b, i, tmp);
      keepTake(i); // only retire the old take once the new one exists
      renameSync(tmp, out);
      writeFileSync(sidecarPath(i), JSON.stringify({ promptHash: genKey(fal, slug, b), mode: 'gen', medium: g.medium, retake: takes, ...g, createdAt: new Date().toISOString() }, null, 2));
      b.clipPath = out;
      record('visuals', { beat: i, mode: 'gen', medium: g.medium, retake: takes, requestId: g.requestId, costSource: 'estimate' }, g.estCostUsd);
    }
  }
}

// ── cover mode: bring your own piece, get it covered ─────────────────────────
// piece (audio/video) → ElevenLabs STT (word timestamps) → sentence-boundary
// beat segments → Claude Haiku shot list → the same visuals stage → visuals cut
// to the piece's exact timing, original audio untouched, word-timed captions.
async function runCover(piecePath) {
  const cover = await import('./lib/cover.mjs');
  const shots = await import('./lib/shots.mjs');
  const { createHash: ch } = await import('crypto');
  const COVER_DIR = join(CACHE, 'cover');
  const COVER_BEAT_DIR = join(COVER_DIR, 'beat');
  mkdirSync(COVER_DIR, { recursive: true });

  console.log(`▶ [c1] piece: ${piecePath}`);
  const src = piecePath.startsWith('/') ? piecePath : join(ROOT, piecePath);
  if (!existsSync(src)) throw new Error(`--cover: file not found: ${piecePath}`);
  const pieceAudio = cover.extractPieceAudio(src, COVER_DIR);
  const pieceDur = fx.probeDuration(pieceAudio);
  if (!pieceDur) throw new Error('--cover: could not read audio from the piece');
  const pieceHash = ch('sha256').update(readFileSync(pieceAudio)).digest('hex').slice(0, 12);
  // committed receipts must not leak machine-specific absolute paths
  const pieceLabel = src.startsWith(ROOT + '/') ? src.slice(ROOT.length + 1) : basename(src);
  record('cover', { piece: pieceLabel, duration_s: +pieceDur.toFixed(2), hash: pieceHash });

  console.log('▶ [c2] transcribe (ElevenLabs Speech-to-Text)');
  const tPath = join(COVER_DIR, `transcript-${pieceHash}.json`);
  let transcript;
  if (existsSync(tPath)) {
    transcript = JSON.parse(readFileSync(tPath, 'utf8'));
    record('stt', { cached: true, words: transcript.words?.length ?? 0 }, 0);
  } else {
    if (DRY || MOCK) { record('stt', { note: 'skipped (dry/mock): no cached transcript, cover mode needs a live STT pass' }); return; }
    transcript = await el.stt({ filePath: pieceAudio });
    writeFileSync(tPath, JSON.stringify(transcript, null, 2));
    record('stt', { words: transcript.words?.length ?? 0, lang: transcript.language_code }, (pieceDur / 3600) * 0.40);
  }

  const segments = cover.segmentWords(transcript.words, pieceDur);
  if (!segments.length) throw new Error('--cover: transcript produced no segments (is the piece silent?)');
  const textIn = (s, e) => (transcript.words || [])
    .filter((w) => w.type !== 'spacing' && w.start >= s - 0.05 && w.start < e)
    .map((w) => w.text).join(' ');

  let beats, visualSystem = '', briefGrade = null, briefMusicPrompt = null, briefAmbiencePrompt = null;
  if (CREATIVE && !MOCK && !DRY) {
    console.log('▶ [c3] creative council (7 specialists + director)');
    const creative = await import('./lib/creative.mjs');
    const bPath = join(COVER_DIR, `brief-${pieceHash}.json`);
    let directed;
    if (!REDIRECT && existsSync(bPath)) {
      directed = JSON.parse(readFileSync(bPath, 'utf8'));
      record('council', { cached: true, beats: directed.brief.beats.length, originalCostUsd: directed.costUsd ?? 0 }, 0);
    } else {
      directed = await creative.directPiece({ transcriptText: transcript.text, segments, pieceDur, log: console.log });
      writeFileSync(bPath, JSON.stringify(directed, null, 2));
      record('council', { model: process.env.CREATIVE_MODEL ?? 'claude-opus-4-8', specialists: 7, beats: directed.brief.beats.length, costSource: 'estimate' }, directed.costUsd);
    }
    const brief = directed.brief;
    visualSystem = brief.visualSystem;
    VISUAL_SYSTEM = brief.visualSystem;
    briefGrade = { saturation: Math.min(1.4, Math.max(0.6, brief.grade.saturation)), contrast: Math.min(1.3, Math.max(0.8, brief.grade.contrast)) };
    briefMusicPrompt = brief.musicPrompt;
    briefAmbiencePrompt = brief.ambiencePrompt ?? null;
    console.log(`  visual system: ${visualSystem.slice(0, 110)}...`);
    console.log(`  hook: ${brief.hook.slice(0, 110)}...`);
    beats = creative.snapBeats(brief.beats, pieceDur, transcript.words).map((s) => ({
      vo: '', caption: textIn(s.start, s.start + s.seconds), visualPrompt: s.shotPrompt, sfxPrompt: s.sfxPrompt || '',
      medium: s.medium ?? 'live', stillPrompt: s.stillPrompt ?? null, motionPrompt: s.motionPrompt ?? null,
      seconds: s.seconds, start: s.start, visualMode: 'gen', mographTemplate: null, voPath: null,
    }));
  } else {
    console.log('▶ [c3] segment + shot list (no council: template/Haiku fallback)');
    const sPath = join(COVER_DIR, `shots-${pieceHash}.json`);
    let shotsOut;
    if (existsSync(sPath) && JSON.parse(readFileSync(sPath, 'utf8')).prompts?.length === segments.length) {
      shotsOut = JSON.parse(readFileSync(sPath, 'utf8'));
      record('shots', { cached: true, source: shotsOut.source, beats: segments.length }, 0);
    } else {
      shotsOut = await shots.shotList({ segments, forceTemplate: MOCK || DRY });
      writeFileSync(sPath, JSON.stringify(shotsOut, null, 2));
      record('shots', { source: shotsOut.source, beats: segments.length, costSource: 'estimate' }, shotsOut.estCostUsd);
    }
    beats = segments.map((s, i) => ({
      vo: '', caption: s.text, visualPrompt: shotsOut.prompts[i], sfxPrompt: '',
      seconds: s.seconds, start: s.start, visualMode: 'gen', mographTemplate: null, voPath: null,
    }));
  }
  for (const [i, b] of beats.entries()) console.log(`  beat ${i} @${b.start.toFixed(1)}s (${b.seconds.toFixed(1)}s): ${b.visualPrompt.slice(0, 70)}...`);

  await stageVisuals(beats); // review + retakes happen inside
  if (DRY) return;

  console.log('▶ [c4] assemble (cut visuals to the piece, original audio untouched)');
  const clips = beats.map((b, i) =>
    fx.renderBeat({ index: i, seconds: b.seconds, voPath: null, clipPath: b.clipPath ?? null, visualMode: b.visualMode, grade: briefGrade, cacheDir: COVER_BEAT_DIR }).out);
  const srtPath = cover.buildWordSrt(transcript.words, join(COVER_DIR, 'captions.srt'));
  const visualTrack = join(COVER_BEAT_DIR, 'visual-track.mp4');
  fx.assembleBeats(clips, srtPath, visualTrack, COVER_BEAT_DIR);
  const finalPath = join(OUT, 'cover.mp4');
  cover.muxPieceAudio(visualTrack, pieceAudio, srtPath, finalPath);

  // Craft Law rule 10: three layers under the voice, every generated effect
  // and the ambience through the shared harshness gate (guardedSfx above).
  const sfxEntries = [];
  if (!MOCK) {
    const SFX_DIR = join(COVER_DIR, 'sfx');
    mkdirSync(SFX_DIR, { recursive: true });
    for (const [i, b] of beats.entries()) {
      if (!b.sfxPrompt) continue;
      const p = join(SFX_DIR, `beat-${i}.mp3`);
      const dur = Math.min(4, Math.max(1, b.seconds * 0.5));
      const { fresh } = await guardedSfx(b.sfxPrompt, dur, p, `sfx beat ${i}`);
      sfxEntries.push({ path: p, atSec: b.start });
      const sfxCost = (dur / 60) * 0.12;
      record('sfx', { beat: i, prompt: b.sfxPrompt.slice(0, 60), duration_s: dur, ...(fresh ? {} : { cached: true, originalCostUsd: sfxCost }) }, fresh ? sfxCost : 0);
    }
  }

  // continuous natural ambience bed, scene-matched by the director's brief
  let ambientPath = null;
  if (!MOCK && briefAmbiencePrompt) {
    ambientPath = join(COVER_DIR, 'ambience.mp3');
    const ambDur = Math.min(28, Math.ceil(pieceDur + 2));
    const { fresh } = await guardedSfx(briefAmbiencePrompt, ambDur, ambientPath, 'ambience bed');
    const ambCost = (ambDur / 60) * 0.12;
    record('ambience', { prompt: briefAmbiencePrompt.slice(0, 70), duration_s: ambDur, ...(fresh ? {} : { cached: true, originalCostUsd: ambCost }) }, fresh ? ambCost : 0);
  }

  let musicPath = null;
  if (WANT_MUSIC && !MOCK) {
    musicPath = join(COVER_DIR, 'music.mp3');
    const cPrompt = arg('--music-prompt', briefMusicPrompt ?? 'cinematic underscore with a clear pulse and forward momentum, instrumental bed under narration');
    const cSeconds = Math.ceil(pieceDur + 2);
    const cKey = hash(`${cPrompt}:${cSeconds}`);
    let cSide = null;
    try { cSide = JSON.parse(readFileSync(join(COVER_DIR, 'music.json'), 'utf8')); } catch {}
    const coverMusicFresh = !existsSync(musicPath) || cSide?.key !== cKey;
    if (coverMusicFresh) {
      _wf(musicPath, await el.music({ prompt: cPrompt, lengthMs: cSeconds * 1000 }));
      _wf(join(COVER_DIR, 'music.json'), JSON.stringify({ key: cKey, prompt: cPrompt.slice(0, 140), seconds: cSeconds, createdAt: new Date().toISOString() }));
    }
    const cCost = (cSeconds / 60) * 0.15;
    record('score', { seconds: cSeconds, model: 'music_v2', out: '.cache/cover/music.mp3', briefed: !!briefMusicPrompt, ...(coverMusicFresh ? {} : { cached: true, originalCostUsd: cCost }) }, coverMusicFresh ? cCost : 0);
  }
  if (musicPath || ambientPath || sfxEntries.length) {
    const mixed = join(COVER_BEAT_DIR, 'cover-mixed.mp4');
    fx.mixStems(finalPath, musicPath, sfxEntries, mixed, { ambientPath });
    _cp(mixed, finalPath);
    record('mix', { music: !!musicPath, ambience: !!ambientPath, sfx: sfxEntries.length, note: 'three layers under the voice' });
  }

  try { _cp(srtPath, join(OUT, 'cover.srt')); } catch {}
  record('assemble', { beats: clips.length, out: 'output/cover.mp4', captions: 'output/cover.srt (word-timed, soft)', duration_s: +fx.probeDuration(finalPath).toFixed(2) });
}

// ── run ───────────────────────────────────────────────────────────────────────
const beats = existsSync(join(ROOT, SCRIPT)) ? parseScript(SCRIPT) : [];
const mode = DRY ? 'DRY RUN' : MOCK ? 'MOCK ($0)' : 'LIVE';
manifest.started = new Date().toISOString();
manifest.mode = mode;
console.log(`picture-lock: ${beats.length} beats: ${mode}\n`);

const stages = {
  voiceover: () => stageVoiceover(beats),
  visuals: () => stageVisuals(beats),
  score: () => stageScore(beats),
  sfx: () => stageSfx(beats),
  assemble: () => stageAssemble(beats),
};
// Reflection: feedback in, proposed Craft Law out. Proposals append to the
// rules file's Proposed section; a human promotes them to Ratified. This is
// how a mistake caught once becomes a rule enforced forever.
if (REFLECT_TEXT) {
  const creative = await import('./lib/creative.mjs');
  console.log('▶ [reflect] converting feedback into proposed Craft Law');
  const { proposedRules, costUsd } = await creative.reflect({ feedback: REFLECT_TEXT });
  const rulesPath = join(ROOT, 'craft', 'rules.md');
  const current = readFileSync(rulesPath, 'utf8');
  const stamp = new Date().toISOString().slice(0, 10);
  const additions = proposedRules.map((r) => `- **${r.title}** (proposed ${stamp}): ${r.rule}`).join('\n');
  writeFileSync(rulesPath, current + '\n' + additions + '\n'); // lands under Proposed (last section)
  record('reflect', { proposed: proposedRules.length, costSource: 'estimate' }, costUsd);
  for (const r of proposedRules) console.log(`  proposed: ${r.title}: ${r.rule.slice(0, 100)}`);
  console.log('  → review craft/rules.md and move keepers into the Ratified section');
}
if (REFLECT_TEXT) { /* reflect-only run: rules proposed above, nothing generates */ }
else if (COVER) { await runCover(COVER); }
else if (ONLY) {
  if (!stages[ONLY]) throw new Error(`--stage ${ONLY}: unknown stage (expected one of ${Object.keys(stages).join(', ')})`);
  await stages[ONLY]();
}
else { for (const s of ['voiceover', 'visuals', 'score', 'sfx', 'assemble']) await stages[s](); if (DUB_LANG) await stageDub(DUB_LANG); }

// run-manifest.json is the committed receipt for the last FULL production
// run; cover runs get their own receipt; dry, mock, and stage-only
// invocations must not clobber the evidence.
const manifestOut = COVER && !(DRY || MOCK)
  ? join(OUT, 'cover-manifest.json')
  : (DRY || MOCK || ONLY || REFLECT_TEXT) ? join(CACHE, 'run-manifest.partial.json') : join(OUT, 'run-manifest.json');
writeFileSync(manifestOut, JSON.stringify(manifest, null, 2));
console.log(`\n✓ manifest → ${manifestOut.replace(ROOT + '/', '')}   est. spend $${manifest.costUsd.toFixed(4)}`);
