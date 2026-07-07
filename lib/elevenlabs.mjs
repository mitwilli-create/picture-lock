// lib/elevenlabs.mjs — thin ElevenLabs REST adapter.
// Auth: xi-api-key header. Docs: https://elevenlabs.io/docs
//
// HONESTY NOTE: TTS is wired to the documented path. The Music / SFX / Dubbing
// paths are marked `VERIFY` — confirm each against the live API reference with
// your account before the first paid run (endpoints shift between versions).

const BASE = 'https://api.elevenlabs.io';

function key() {
  const k = process.env.XI_API_KEY;
  if (!k) throw new Error('XI_API_KEY not set — copy .env.example to .env and add your key.');
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

// [2] Voiceover — documented: POST /v1/text-to-speech/{voice_id}
export async function tts({ text, voiceId, modelId = 'eleven_multilingual_v2' }) {
  return post(`/v1/text-to-speech/${voiceId}`, { text, model_id: modelId }, { binary: true }); // → mp3 buffer
}

// [4] Score — text-to-music.  VERIFY path (likely /v1/music or /v1/music/compose)
export async function music({ prompt, lengthMs }) {
  return post(`/v1/music`, { prompt, music_length_ms: lengthMs }, { binary: true }); // VERIFY
}

// [4b] Score from the assembled cut — POST /v1/music/video-to-music (confirmed in changelog)
// NOTE: multipart/form-data, not JSON — implement with FormData when wiring live.  VERIFY shape.
export async function videoToMusic({ videoPath /* , ... */ }) {
  throw new Error('videoToMusic: implement multipart upload against /v1/music/video-to-music (VERIFY)');
}

// [5] SFX — VERIFY path (likely /v1/sound-generation)
export async function soundEffect({ text, durationSeconds }) {
  return post(`/v1/sound-generation`, { text, duration_seconds: durationSeconds }, { binary: true }); // VERIFY
}

// [7] Dubbing — VERIFY path (likely /v1/dubbing, multipart). Returns a job id to poll.
export async function dub({ /* filePath, targetLang */ }) {
  throw new Error('dub: implement multipart upload + poll against /v1/dubbing (VERIFY)');
}

export async function listVoices() {
  const res = await fetch(BASE + '/v1/voices', { headers: { 'xi-api-key': key() } });
  if (!res.ok) throw new Error(`listVoices → ${res.status}`);
  return res.json();
}
