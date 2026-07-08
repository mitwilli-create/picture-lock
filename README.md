# broll-pipeline

An ElevenLabs-native pipeline that turns a voiceover script into a produced short-form video: AI narration, generated b-roll, an auto-composed score, sound design, and an optional multilingual dub, assembled into a finished cut with a full call-log of every generation step.

Built as a forward-deployed reference workflow: the kind of reusable, adoption-ready production system an embedded creative would hand a customer so the value sticks after they leave the room.

> Status: v0.2 (2026-07-07). The full audio stack has run live end-to-end: TTS narration, an Eleven Music v2 score, per-beat sound effects, stem mixing, and a Spanish dub, producing a 50.4s captioned cut for $0.696 total. Every call is logged in [output/run-manifest.json](output/run-manifest.json), committed as the case-study receipt. `npm run mock` still runs the whole workflow with zero spend. The visual stage runs through ElevenCreative Studio with a scripted capture shim (no public REST endpoint for image/video as of this build).

## Quick start

```bash
npm install
node pipeline.mjs --script input/script.md --mock   # end-to-end, $0, produces output/short.mp4 + short.srt
node pipeline.mjs --script input/script.md --dry-run # auth/plan check (needs XI_API_KEY), no spend
node pipeline.mjs --script input/script.md           # live run (needs XI_API_KEY + XI_VOICE_ID)
```

Mock mode and live mode assemble identically: mock swaps `say`-generated narration and colored beat cards in place of ElevenLabs audio and Studio b-roll, so the workflow, timing, caption track, and cost manifest are all real before a single credit is spent.

## Why this shape

ElevenLabs' 2026 creative suite splits cleanly:

- **API-callable:** Text-to-Speech, Eleven Music v2 (text-to-music + video-to-music), Sound Effects, Dubbing, Speech-to-Text.
- **Playground-only (UI):** Image & Video generation (Sora 2, Veo 3.1, Kling, Flux, etc.): no public REST endpoint as of this build.

So the pipeline orchestrates the audio stack end-to-end through the API and treats the visual step as a **product-in-the-loop** stage: prompts are generated programmatically, handed to ElevenCreative Studio, and the results are pulled back in via a browser-automation capture shim. Building a clean workflow *around* a real product constraint: rather than routing to a competitor's video API: is the point. It stays inside ElevenLabs' tools and demonstrates the exact instinct the work calls for.

## Pipeline stages

```
input/script.md
   │
   ▼
[1] parseScript      → beats: [{ vo, visualPrompt, seconds }]
   │
   ├─▶ [2] voiceover  (ElevenLabs TTS API)            → .cache/vo/*.mp3
   ├─▶ [3] visuals    (ElevenCreative Studio + shim)  → .cache/broll/*.mp4
   ├─▶ [4] score      (Eleven Music: text-to-music OR video-to-music) → .cache/music.mp3
   └─▶ [5] sfx        (Sound Effects API, optional)   → .cache/sfx/*.mp3
   │
   ▼
[6] assemble  (ffmpeg: cut b-roll to VO timing, mix stems, burn captions) → output/short.mp4
   │
   ▼
[7] dub       (Dubbing API → target language, optional) → output/short.<lang>.mp4
```

Each stage caches its output to `.cache/` keyed by content hash, so a re-run only regenerates what changed. Every API call is appended to `output/run-manifest.json` (model, params, cost, latency): that manifest IS the case-study evidence: a transparent, costed, reproducible production log.

## Cost model (ElevenLabs API, 2026)

| Stage | Rate | ~60s short |
|---|---|---|
| Voiceover (TTS Multilingual v2/v3) | $0.10 / 1k chars | ~$0.02 (≈180 words) |
| Music (Eleven Music) | $0.15 / min | ~$0.15 |
| Sound effects | $0.12 / min | ~$0.05 |
| Dubbing (per target lang) | $0.33–0.50 / min | ~$0.40 |
| Visuals (ElevenCreative Studio) | credit-based (Sora/Veo/Kling burn credits fast) | plan-dependent |

The audio stack for one short is a few dollars. The **visual generation is the real cost driver** and is credit-metered: budget an **API Pro ($99 / 100 credits)** or **Scale ($330 / 660 credits)** plan for enough headroom to iterate on video. Confirm current credit-per-second rates at signup.

## Positioning for the role (ElevenLabs · Forward Deployed Creative)

This repo maps directly onto the JD:

| JD asks for | This artifact shows |
|---|---|
| "Portfolio of shipped creative work" | The produced short in `output/` |
| "Hands-on fluency with AI creative tools" | Every ElevenLabs modality driven, not described |
| "Build reusable workflow templates, guides, best practices" | The pipeline itself + `run-manifest.json` |
| "Technical ability to prototype integrations/workflows using APIs" (bonus) | The whole orchestrator |
| "Public presence as a creator / thought leader" (bonus) | Public repo + the write-up |
| Localization / dubbing background | The `dub` stage |

## Week plan (apply by end of week)

- **Day 1 (signup):** Create ElevenLabs account on API **Pro/Scale** (video credits). Drop `XI_API_KEY` into `.env`. Run `node pipeline.mjs --stage voiceover --dry-run` to confirm auth.
- **Day 1–2:** Lock the 45–60s demo concept + write `input/script.md` (beats with VO + visual prompts). Generate voiceover + first b-roll pass.
- **Day 2–3:** Score (try both text-to-music and video-to-music), SFX, assemble v1. This v1 IS the demo: good enough beats perfect.
- **Day 3–4:** One dub pass (localization proof). Write the 1-page workflow case study (`docs/case-study.md`) from `run-manifest.json`.
- **Day 4–5:** Tailored CV variant + cover letter (re-led on creative-production × AI-creative-tooling). **Submit** with links to the short + this repo.
- **Fast-follow (post-apply):** the longer, more-polished multi-tool piece as an "extended cut."

## Usage (once keyed)

```bash
cp .env.example .env        # add XI_API_KEY
node pipeline.mjs --script input/script.md          # full run (resumable)
node pipeline.mjs --stage voiceover                 # single stage
node pipeline.mjs --script input/script.md --dub es # + Spanish dub
```

## Verify-before-first-run

Exact API endpoint paths for Music / Sound Effects / Dubbing are marked `// VERIFY` in `lib/elevenlabs.mjs`: confirm each against the live docs (https://elevenlabs.io/docs) with your account before the first paid run. TTS is wired to the documented `POST /v1/text-to-speech/{voice_id}`.
