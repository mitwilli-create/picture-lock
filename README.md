# broll-pipeline

An ElevenLabs-native pipeline that turns a voiceover script into a produced short-form video: AI narration, generated b-roll, an auto-composed score, sound design, and an optional multilingual dub, assembled into a finished cut with a full call-log of every generation step.

Built as a forward-deployed reference workflow: the kind of reusable, adoption-ready production system an embedded creative would hand a customer so the value sticks after they leave the room.

> Status: v0.3 (2026-07-08). All seven stages run live end-to-end, visuals included. The 69s cut was produced for $3.32 all-in: TTS narration, Eleven Music v2 score, per-beat sound effects, stem mixing with local fades, seven code-rendered motion-graphics beats built from the pipeline's own artifacts, three AI-generated shots through the pluggable video adapter, and a Spanish dub. Every call is logged in [output/run-manifest.json](output/run-manifest.json), committed as the case-study receipt; cached artifacts carry their original cost forward so the receipt covers the whole cut. `npm run mock` still runs the whole workflow with zero spend.

## Quick start

```bash
npm install
node pipeline.mjs --script input/script.md --mock   # end-to-end, $0, produces output/short.mp4 + short.srt
node pipeline.mjs --script input/script.md --dry-run # auth/plan check (needs XI_API_KEY), no spend
node pipeline.mjs --script input/script.md           # live run (needs XI_API_KEY + XI_VOICE_ID)
```

Mock mode and live mode assemble identically: mock swaps `say`-generated narration in place of ElevenLabs audio and falls back to colored beat cards for generated shots (motion-graphics beats still render for real, they cost nothing), so the workflow, timing, caption track, and cost manifest are all real before a single credit is spent.

## Cover mode: bring your own piece

The product promise in one command: you don't need to shoot or source b-roll to cover a piece anymore.

```bash
node pipeline.mjs --cover my-piece.mp3            # audio or video in → output/cover.mp4
node pipeline.mjs --cover my-piece.mp4 --music    # + a scored bed ducked under your audio
```

Your audio is the master timeline. The pipeline transcribes it (ElevenLabs Speech-to-Text, word timestamps), segments it into beats, has the creative council direct the shots, generates the b-roll, cuts every clip to your exact timing, and muxes your original audio back untouched with word-timed captions. Cost scales with runtime (roughly $0.10/sec of generated coverage plus pennies of transcription and direction).

## The creative council

Prompting shot-by-shot in isolation produces b-roll that reads as disconnected stock. So every generation is directed by a council of seven active experts (cinematographer, story producer, video researcher, sound designer, motion designer, music composer, audience-engagement expert) who analyze the piece, then DEBATE each other across rounds: challenge, concede, align, hold non-negotiables (`DEBATE_ROUNDS`, default 2). A master director adjudicates the argument into one Edit Decision Brief, and the panel gets a veto round on that brief before a dollar of generation spend; objections force a directed revision.

The brief routes every shot to the right medium: **live** (text-to-video) for organic footage, **animated** (a designed still from nano banana 2, which renders legible text, animated via Veo image-to-video) for anything text-bearing, graphic, UI, or stylized, and **mograph** (code-rendered from the pipeline's real artifacts). After generation, the review board inspects five frames from every clip against the brief and the Craft Law, rejects unacceptable takes, and re-prompts, switches medium, and regenerates (budget-guarded, `--max-retakes N`). Nothing ships unreviewed.

## Craft Law + reflection

[craft/rules.md](craft/rules.md) is the standing production law, loaded into every council seat, every director synthesis, and every review. It encodes the rules a human producer would enforce: cut ceilings, subject literalism, no blank text props, the sound doctrine (bed under everything, effects woven on cuts), narration alignment, motion requirements, medium choice.

The law grows through reflection: `node pipeline.mjs --reflect "your feedback"` converts producer notes into proposed rules appended to the file's Proposed section; a human promotes keepers to Ratified. A mistake caught once becomes a rule enforced on every future piece.

On by default when `ANTHROPIC_API_KEY` is set; `--no-creative` falls back to a flat shot list, `--redirect` forces the council to re-run. Applies to both modes: cover mode gets the full brief; script mode gets its generated beats rewritten into one visual system.

## Why this shape

Two decisions define the visual stage:

- **Per-beat visual modes.** Each beat in `input/script.md` declares `VISUAL-MODE: mograph | gen | card`. Beats that carry the pipeline's own evidence (the script, the narration waveform, the run manifest, the receipt) are rendered deterministically in code from the real artifacts via Playwright frame capture, at $0. Beats that need cinematic footage are generated from their `VISUAL:` prompt.
- **A pluggable provider adapter.** Generation goes through one thin module (`lib/fal.mjs`, bare fetch, no SDK) so the text-to-video provider is a config choice, not an architecture choice. Today it routes to Veo 3.1 Fast via fal.ai at $0.10/sec; the audio stack stays 100% ElevenLabs.

The split is the point: knowing which beats deserve a model and which deserve the actual data is what makes the cut credible, and keeping the provider behind an adapter keeps the workflow portable.

## Pipeline stages

```
input/script.md
   │
   ▼
[1] parseScript      → beats: [{ vo, visualPrompt, seconds }]
   │
   ├─▶ [2] voiceover  (ElevenLabs TTS API)                        → .cache/vo/*.mp3
   ├─▶ [3] visuals    (per beat: mograph render | video adapter)  → .cache/broll/*.mp4
   ├─▶ [4] score      (Eleven Music v2, length measured from the actual edit) → .cache/music.mp3
   └─▶ [5] sfx        (Sound Effects API, offsets measured from the actual edit) → .cache/sfx/*.mp3
   │
   ▼
[6] assemble  (ffmpeg: cover-fit + cut visuals to VO timing, grade, mix stems, soft captions) → output/short.mp4
   │
   ▼
[7] dub       (Dubbing API → target language, optional) → output/short.<lang>.mp4
```

Each stage caches its output to `.cache/` keyed by content hash, so a re-run only regenerates what changed. Every API call is appended to `output/run-manifest.json` (model, params, cost, latency): that manifest IS the case-study evidence: a transparent, costed, reproducible production log.

## Cost model (ElevenLabs API, 2026)

| Stage | Rate | ~60s short |
|---|---|---|
| Voiceover (TTS Multilingual v2) | $0.10 / 1k chars | ~$0.10 |
| Music (Eleven Music v2) | $0.15 / min | ~$0.18 |
| Sound effects | $0.12 / min | ~$0.04 |
| Dubbing (per target lang) | $0.33–0.50 / min | ~$0.58 |
| Visuals: generated shots (adapter → Veo 3.1 Fast) | $0.10 / sec | ~$2.00 (3 shots) |
| Visuals: mograph beats (Playwright render) | $0 | $0.00 (7 beats) |

The cut in `output/` cost **$3.32 all-in** — $2.71 of production logged in `output/run-manifest.json` plus the ~$0.58 Spanish dub. Video generation is the cost driver; the mograph beats regenerate for free, which is what makes iteration cheap: `--reroll-beat N` retakes a single beat without touching the rest.

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

## Usage (once keyed)

```bash
cp .env.example .env        # add XI_API_KEY (+ XI_VOICE_ID, FAL_KEY for generated shots)
node pipeline.mjs --script input/script.md          # full run (resumable, content-hash cached)
node pipeline.mjs --stage voiceover                 # single stage
node pipeline.mjs --script input/script.md --dub es # + Spanish dub
node pipeline.mjs --skip-gen                        # $0 visuals: mograph renders, gen beats fall back to cards
node pipeline.mjs --reroll-beat 4                   # retake one beat (0-based), keep the old take
node pipeline.mjs --budget 25                       # hard spend ceiling for the run (default 50)
```

## Verify-before-first-run

Exact API endpoint paths for Music / Sound Effects / Dubbing are marked `// VERIFY` in `lib/elevenlabs.mjs`: confirm each against the live docs (https://elevenlabs.io/docs) with your account before the first paid run. TTS is wired to the documented `POST /v1/text-to-speech/{voice_id}`.
