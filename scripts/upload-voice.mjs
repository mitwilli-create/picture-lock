#!/usr/bin/env node
// upload-voice.mjs: upload a fresh voice recording to ElevenLabs as a new
// Instant Voice Clone, switch .env to it (old id kept as XI_VOICE_ID_PREV),
// and synth a short audition line so the new voice can be judged immediately.
//
//   node scripts/upload-voice.mjs ~/Desktop/voice-sample.m4a
//   node scripts/upload-voice.mjs sample.m4a --name "Mitchell v2" --keep-env
//
// --keep-env: upload + audition only; do not touch .env.
// The old voice stays on the ElevenLabs account untouched either way.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
try { const { config } = await import('dotenv'); config({ path: join(ROOT, '.env') }); } catch {}
const el = await import(join(ROOT, 'lib', 'elevenlabs.mjs'));

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
if (!file) { console.error('usage: node scripts/upload-voice.mjs <recording.(m4a|mp3|wav)> [--name "..."] [--keep-env]'); process.exit(1); }
const src = resolve(file.replace(/^~\//, process.env.HOME + '/'));
if (!existsSync(src)) { console.error(`not found: ${src}`); process.exit(1); }

// sanity: IVC wants 1-3 minutes of clean speech; warn outside that window
const probe = spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { encoding: 'utf8' });
const dur = parseFloat(probe.stdout) || 0;
if (dur && dur < 60) console.warn(`⚠ sample is ${dur.toFixed(0)}s: ElevenLabs IVC works best on 1-3 minutes; a short sample clones flatter`);
if (dur > 300) console.warn(`⚠ sample is ${(dur / 60).toFixed(1)}min: past ~3min adds little; fine to proceed`);

const name = arg('--name', `Mitchell v${new Date().toISOString().slice(0, 10)}`);
console.log(`uploading "${name}" (${dur ? dur.toFixed(0) + 's' : '?'}) to ElevenLabs IVC (background-noise removal on)...`);
const res = await el.cloneVoice({ name, filePaths: [src], description: 'Narration voice for broll-pipeline', removeBackgroundNoise: true });
const voiceId = res.voice_id;
if (!voiceId) throw new Error('no voice_id in response: ' + JSON.stringify(res).slice(0, 300));
console.log(`✓ voice created: ${voiceId}${res.requires_verification ? ' (requires verification on the ElevenLabs site)' : ''}`);

if (!args.includes('--keep-env')) {
  const envPath = join(ROOT, '.env');
  let env = readFileSync(envPath, 'utf8');
  const prev = (env.match(/^XI_VOICE_ID=(.*)$/m) || [])[1];
  env = env.replace(/^XI_VOICE_ID_PREV=.*\n?/m, '');
  env = env.replace(/^XI_VOICE_ID=.*$/m, `XI_VOICE_ID=${voiceId}\nXI_VOICE_ID_PREV=${prev ?? ''}`);
  if (!/^XI_VOICE_ID=/m.test(env)) env += `\nXI_VOICE_ID=${voiceId}\n`;
  writeFileSync(envPath, env);
  console.log(`✓ .env updated: XI_VOICE_ID=${voiceId} (previous kept as XI_VOICE_ID_PREV)`);
}

// audition: one line through the new voice (~$0.01)
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const auditionPath = join(ROOT, '.cache', 'voice-audition.mp3');
const buf = await el.tts({
  text: 'This is the new narration voice. If this energy sounds right, the next full run uses it everywhere.',
  voiceId,
});
writeFileSync(auditionPath, buf);
console.log(`✓ audition line → ${auditionPath}\n  play it: afplay ${auditionPath}`);
