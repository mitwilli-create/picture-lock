# AGENTS.md: picture-lock

Read `~/Documents/mission-control/WORKSPACE.md` first: it defines the multi-agent lane rules for this machine. Your lane here (Codex) is building; Claude Code reviews your output and owns orchestration/memory. CodeRabbit reviews commits and PRs automatically.

## What this repo is

picture-lock (formerly broll-pipeline; GitHub slug renamed, old URLs 301): an ElevenLabs-native AI production studio. A Markdown voiceover script in `input/` becomes a finished short-form video with narration, council-directed generated shots, composed music, sound design, captions, and optional multilingual dubs. Seven stages orchestrated by `pipeline.mjs`, with every API call cost-logged to `output/run-manifest.json`. Built as a forward-deployed reference workflow; the manifest IS the case-study evidence. Never create a new repo named `broll-pipeline`: that would kill the GitHub redirect submitted job applications depend on. Status: v0.3, end-to-end live.

## Hard constraints

- **Live runs spend real money** (ElevenLabs TTS/Music/SFX/Dubbing, fal.ai Veo for generated video at ~$0.10/sec, Anthropic for the creative council). Develop against `--mock` (full $0 run: macOS `say` + ffmpeg + mograph) or `--dry-run`. Never trigger a live run unless Mitchell asked for one.
- **Never break manifest logging.** Every paid call logs model, params, cost, latency to `output/run-manifest.json`; cached artifacts carry their original cost forward. The manifest is deliberately committed even though other `output/*` artifacts are gitignored.
- **Budget ceiling:** `--budget N` (default 50) is a hard spend cap. Don't weaken or bypass it.
- **`.env` holds API keys** (XI_API_KEY, XI_VOICE_ID, FAL_KEY, ANTHROPIC_API_KEY) and is gitignored, along with personal working scripts in `input/`. Never commit either.
- **Content-hash caching:** `.cache/` is keyed on SHA256 of inputs; only changed beats regenerate. Preserve this invariant when touching stage code, or cost logging and reruns both break.
- **Endpoint paths marked VERIFY** in `lib/elevenlabs.mjs` (Music, SFX, Dubbing) must be confirmed against live docs before a first paid run.
- **Known ops gotchas:** a second preview server on port 8091 wedges video playback (check `lsof` first; serve faststart mp4s). A fal 403 "exhausted balance" right after a top-up is propagation lag, not a real failure.

## Commands

- Full live run: `npm start` (= `node pipeline.mjs --script input/script.md`)
- $0 end-to-end: `npm run mock` · plan/auth check: `npm run dry` · list voices: `npm run voices`
- Single stage: `node pipeline.mjs --stage voiceover` · retake one beat: `--reroll-beat 4`
- $0 visuals: `--skip-gen` · dub: `--dub es` · bring-your-own audio: `--cover piece.mp3`
- No test suite; verify with `npm run mock` end-to-end before declaring a change done.

## Conventions

- Node >=20, ESM `.mjs`, no build step, no TypeScript. Runtime deps are `dotenv` only (playwright is dev-only, for mograph frame capture); solve problems with Node stdlib before adding packages.
- `ffmpeg` must be on PATH; mock narration uses macOS `say`.
- Stage logic lives in `lib/` (one module per concern: elevenlabs, fal, creative, ffmpeg, mograph, cover, shots); `pipeline.mjs` is orchestration + CLI only. Keep that split.
- Script DSL is documented in README (beats with `VO:`, `VISUAL:`, `SECONDS:`, `VISUAL-MODE:`, etc.); timing is actual-VO-duration-driven, not scripted-seconds-driven.
