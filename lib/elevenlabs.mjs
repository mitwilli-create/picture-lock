// lib/elevenlabs.mjs: thin ElevenLabs REST adapter.
// Auth: xi-api-key header. Docs: https://elevenlabs.io/docs
//
// HONESTY NOTE: TTS is wired to the documented path. The Music / SFX / Dubbing
// paths are marked `VERIFY`: confirm each against the live API reference with
// your account before the first paid run (endpoints shift between versions).

const BASE = 'https://api.elevenlabs.io';

function key() {
  const k = process.env.XI_API_KEY;
  if (!k) throw new Error('XI_API_KEY not set: copy .env.example to .env and add your key.');
  return k;
}

async function post(path, body, { binary = false } = {}) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'xi-api-key': key(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
}

// [2] Voiceover: documented: POST /v1/text-to-speech/{voice_id}
export async function tts({ text, voiceId, modelId = 'eleven_multilingual_v2' }) {
  return post(`/v1/text-to-speech/${voiceId}`, { text, model_id: modelId }, { binary: true }); // → mp3 buffer
}

// [4] Score: text-to-music. POST /v1/music (verified against the API reference
// 2026-07-07): { prompt, music_length_ms (3000-600000), model_id, force_instrumental }.
// Returns audio bytes.
export async function music({ prompt, lengthMs, modelId = 'music_v2' }) {
  return post(`/v1/music`, {
    prompt,
    music_length_ms: Math.max(3000, Math.min(600000, Math.round(lengthMs))),
    model_id: modelId,
    force_instrumental: true,
  }, { binary: true });
}

// [4b] Score from the assembled cut: POST /v1/music/video-to-music (confirmed in changelog)
// NOTE: multipart/form-data, not JSON: implement with FormData when wiring live.  VERIFY shape.
export async function videoToMusic({ videoPath /* , ... */ }) {
  throw new Error('videoToMusic: implement multipart upload against /v1/music/video-to-music (VERIFY)');
}

// [5] SFX: POST /v1/sound-generation (verified 2026-07-07):
// { text, duration_seconds (0.5-30), prompt_influence }. Returns audio bytes.
export async function soundEffect({ text, durationSeconds }) {
  // API caps prompt text at 450 chars; directors write longer soundscapes
  return post(`/v1/sound-generation`, { text: text.slice(0, 450), duration_seconds: durationSeconds }, { binary: true });
}

// [7] Dubbing: POST /v1/dubbing (multipart: file, target_lang, source_lang).
// Returns { dubbing_id, expected_duration_sec }. Poll GET /v1/dubbing/{id} until
// status === 'dubbed', then download GET /v1/dubbing/{id}/audio/{lang}.
export async function dubCreate({ filePath, targetLang, sourceLang = 'en' }) {
  const { readFileSync } = await import('fs');
  const { basename } = await import('path');
  const form = new FormData();
  form.append('file', new Blob([readFileSync(filePath)], { type: 'video/mp4' }), basename(filePath));
  form.append('target_lang', targetLang);
  form.append('source_lang', sourceLang);
  const res = await fetch(BASE + '/v1/dubbing', {
    method: 'POST',
    headers: { 'xi-api-key': key() },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`dubCreate → ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

export async function dubStatus(dubbingId) {
  const res = await fetch(`${BASE}/v1/dubbing/${dubbingId}`, { headers: { 'xi-api-key': key() } });
  if (!res.ok) throw new Error(`dubStatus → ${res.status}`);
  return res.json();
}

export async function dubDownload(dubbingId, lang) {
  const res = await fetch(`${BASE}/v1/dubbing/${dubbingId}/audio/${lang}`, {
    headers: { 'xi-api-key': key() },
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`dubDownload → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

// Cover mode: transcribe a piece with word-level timestamps.
// POST /v1/speech-to-text (multipart, verified 2026-07-08): model_id scribe_v1|scribe_v2,
// file, timestamps default to word granularity. Returns { text, words: [{text,start,end,type}] }.
export async function stt({ filePath, modelId = 'scribe_v1' }) {
  const { readFileSync } = await import('fs');
  const { basename } = await import('path');
  const form = new FormData();
  form.append('model_id', modelId);
  form.append('file', new Blob([readFileSync(filePath)]), basename(filePath));
  const res = await fetch(BASE + '/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': key() },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`stt → ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

export async function listVoices() {
  const res = await fetch(BASE + '/v1/voices', { headers: { 'xi-api-key': key() } });
  if (!res.ok) throw new Error(`listVoices → ${res.status}`);
  return res.json();
}

// Instant Voice Clone: POST /v1/voices/add (multipart). Requires a paid tier.
// Returns { voice_id }. Do NOT set Content-Type; fetch sets the multipart boundary.
export async function cloneVoice({ name, filePaths, description = '', removeBackgroundNoise = false }) {
  const { readFileSync } = await import('fs');
  const { basename } = await import('path');
  const form = new FormData();
  form.append('name', name);
  if (description) form.append('description', description);
  if (removeBackgroundNoise) form.append('remove_background_noise', 'true');
  for (const p of filePaths) {
    form.append('files', new Blob([readFileSync(p)]), basename(p));
  }
  const res = await fetch(BASE + '/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': key() },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`cloneVoice → ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}
