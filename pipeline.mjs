#!/usr/bin/env node
// pipeline.mjs — ElevenLabs-native b-roll pipeline orchestrator.
// Resumable (content-hash cache), cost-logged (output/run-manifest.json).
//
//   node pipeline.mjs --script input/script.md            # full run
//   node pipeline.mjs --script input/script.md --stage voiceover
//   node pipeline.mjs --script input/script.md --dub es   # + dub
//   node pipeline.mjs --stage voiceover --dry-run         # auth/plan check, no spend

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
try { const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') }); } catch {}

const args = process.argv.slice(2);
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const has = (f) => args.includes(f);

const SCRIPT = arg('--script', 'input/script.md');
const ONLY = arg('--stage', null);        // run a single stage
const DUB_LANG = arg('--dub', null);
const DRY = has('--dry-run');
const MOCK = has('--mock');                // end-to-end run with $0 spend (say + ffmpeg)

const CACHE = join(ROOT, '.cache');
const OUT = join(ROOT, 'output');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const manifest = { started: null /* stamp after run */, script: SCRIPT, dry: DRY, calls: [], costUsd: 0 };
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
function record(stage, meta, costUsd = 0) {
  manifest.calls.push({ stage, ...meta, costUsd });
  manifest.costUsd += costUsd;
  console.log(`  [${stage}] ${JSON.stringify(meta)}  $${costUsd.toFixed(4)}`);
}

// ── [1] parseScript ──────────────────────────────────────────────────────────
// input/script.md format — one beat per block:
//   ## beat
//   VO: <narration line>
//   VISUAL: <b-roll prompt>
//   SECONDS: <n>
function parseScript(path) {
  const raw = readFileSync(join(ROOT, path), 'utf8');
  const beats = [];
  for (const block of raw.split(/^##\s+/m).slice(1)) {
    const vo = (block.match(/VO:\s*(.+)/i) || [])[1]?.trim() || '';
    const visual = (block.match(/VISUAL:\s*(.+)/i) || [])[1]?.trim() || '';
    const seconds = parseFloat((block.match(/SECONDS:\s*([\d.]+)/i) || [])[1] || '5');
    if (vo || visual) beats.push({ vo, visualPrompt: visual, seconds });
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
  if (DRY) { await el.listVoices().then(v => console.log(`  auth OK — ${v.voices?.length ?? '?'} voices available`)); return; }
  for (const [i, b] of beats.entries()) {
    if (!b.vo) { b.voPath = null; continue; }
    if (MOCK) {
      b.voPath = fx.mockVoiceover(b.vo, join(VO_DIR, `beat-${i}.aiff`));
      record('voiceover', { beat: i, chars: b.vo.length, mock: true }, 0);
    } else {
      const voiceId = process.env.XI_VOICE_ID;
      if (!voiceId) throw new Error('XI_VOICE_ID not set — add a default voice id to .env (see .env.example).');
      const buf = await el.tts({ text: b.vo, voiceId });
      b.voPath = join(VO_DIR, `beat-${i}.mp3`);
      _wf(b.voPath, buf);
      record('voiceover', { beat: i, chars: b.vo.length }, (b.vo.length / 1000) * 0.10); // ~$0.10/1k chars
    }
  }
}
async function stageVisuals(beats) {
  console.log(`▶ [3] visuals${MOCK ? ' (MOCK: prompt-card placeholders)' : ' (ElevenCreative Studio + capture shim)'}`);
  // MOCK renders the visual PROMPT onto the beat card at assemble time, so intent is visible without real footage.
  // LIVE: emit prompts → drive Studio via browser shim → pull clips to .cache/broll/.
  record('visuals', { beats: beats.length, mock: MOCK, note: MOCK ? 'prompt-card in assemble' : 'Studio-in-the-loop; see docs/visual-shim.md' });
}
async function stageScore(beats) {
  console.log('▶ [4] score (Eleven Music)');
  record('score', { note: MOCK ? 'skipped in mock' : 'el.music(text) OR el.videoToMusic(rough-cut)' });
}
async function stageSfx(beats) {
  console.log('▶ [5] sfx');
  record('sfx', { note: MOCK ? 'skipped in mock' : 'el.soundEffect per accent beat (optional)' });
}
async function stageAssemble(beats) {
  console.log('▶ [6] assemble (ffmpeg)');
  if (DRY) { record('assemble', { note: 'dry-run: skipped' }); return; }
  const clips = [], durations = [];
  for (const [i, b] of beats.entries()) {
    const { out, dur } = fx.renderBeat({ index: i, seconds: b.seconds, voPath: b.voPath, cacheDir: BEAT_DIR });
    clips.push(out); durations.push(dur);
  }
  const srtPath = join(BEAT_DIR, 'captions.srt');
  fx.buildSrt(beats, durations, srtPath);
  const finalPath = join(OUT, 'short.mp4');
  fx.assembleBeats(clips, srtPath, finalPath, BEAT_DIR);
  const dur = fx.probeDuration(finalPath);
  record('assemble', { beats: clips.length, out: 'output/short.mp4', captions: 'output/short.srt (soft)', duration_s: +dur.toFixed(2) });
  // also drop a standalone SRT next to the video for NLE import
  try { _cp(srtPath, join(OUT, 'short.srt')); } catch {}
}
async function stageDub(lang) {
  console.log(`▶ [7] dub → ${lang}`);
  record('dub', { lang, note: 'el.dub(final, lang) → output/short.<lang>.mp4' });
}

// ── run ───────────────────────────────────────────────────────────────────────
const beats = existsSync(join(ROOT, SCRIPT)) ? parseScript(SCRIPT) : [];
const mode = DRY ? 'DRY RUN' : MOCK ? 'MOCK ($0)' : 'LIVE';
manifest.started = new Date().toISOString();
manifest.mode = mode;
console.log(`broll-pipeline — ${beats.length} beats — ${mode}\n`);

const stages = {
  voiceover: () => stageVoiceover(beats),
  visuals: () => stageVisuals(beats),
  score: () => stageScore(beats),
  sfx: () => stageSfx(beats),
  assemble: () => stageAssemble(beats),
};
if (ONLY) { await stages[ONLY]?.(); }
else { for (const s of ['voiceover', 'visuals', 'score', 'sfx', 'assemble']) await stages[s](); if (DUB_LANG) await stageDub(DUB_LANG); }

writeFileSync(join(OUT, 'run-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n✓ manifest → output/run-manifest.json   est. spend $${manifest.costUsd.toFixed(4)}`);
