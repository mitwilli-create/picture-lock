# AGENTS.md: PictureLock

Read `~/Documents/mission-control/WORKSPACE.md` first: it defines the multi-agent lane rules for this machine. Your lane here (Codex) is building; Claude Code reviews your output and owns orchestration/memory. CodeRabbit reviews commits and PRs automatically.

## What this repo is

PictureLock (repo slug `picture-lock`, formerly broll-pipeline; GitHub slug renamed, old URLs 301): an ElevenLabs-native AI production studio. A Markdown voiceover script in `input/` becomes a finished short-form video with narration, council-directed generated shots, composed music, sound design, captions, and optional multilingual dubs. Seven stages orchestrated by `pipeline.mjs`, with every API call cost-logged to `output/run-manifest.json`. Built as a forward-deployed reference workflow; the manifest IS the case-study evidence. Never create a new repo named `broll-pipeline`: that would kill the GitHub redirect submitted job applications depend on. Status: v0.3, end-to-end live.

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

---

<!-- BEGIN DISTILLED: distill-session-preferences (topic: broll-pipeline / PictureLock video edits) -->
- Sound design must be diegetically accurate and professionally mixed — missing ambient/sync sound (e.g. "can't hear the fish hit the ice") is a defect, and so is over-produced nat sound/effects on quiet shots ("we may be inventing sound where there isn't movement to justify it"). Default to music + vocal track alone when a shot has little active movement; add sync/ambient sound only where the visual action justifies it. <!-- id:9b739d5136 evidence:4 -->
- Motion/animation must read as continuous and purposeful — no jump cuts, no repeated/looping shots, no dead (motionless) stretches. This mirrors the same rule found independently in the thestorytellermitch.com distillation — treat it as a cross-project standard, not project-specific. <!-- id:b0bd655683 evidence:7 -->
- Before declaring a cut/draft done, run an explicit blind/critical review pass — check category assignments make sense, flag anything "too technical" or under-justified, and be willing to say "kill this completely" rather than polish something that doesn't work. <!-- id:d533f9dc5f evidence:3 -->
- Expect timestamp-anchored, surgical review. Notes arrive as exact timecodes (":02 pop", ":17 stamp gets lost", "1:03 make bigger", ":58 dead gap") with many small precise edits per round — often sub-second and frame-level. Frame-verify EACH note at its exact timestamp before claiming it done; a round is not one big change, it is a dozen exact ones. <!-- id:53a5c5699c evidence:8 -->
- Elements must never get lost against busy art. The fix Mitchell reaches for is SOLID backing — a solid oxblood or solid black cell with white/bold text — not transparency, thin strokes, or a knockout that a blend can defeat. When a label rides over animation, give it an opaque plate and bold it. Bigger and bolder beats subtle every time. <!-- id:cfee428bbd evidence:5 -->
- Fill the negative space. "Reads as empty", "boring", small text with big black margins, or a centered element floating in dead space are all defects to him — scale key graphics up to use the frame and make the opening especially dynamic to hook the viewer. <!-- id:6c8e0fc9c9 evidence:4 -->
- Sync visuals to the vocal track and add comprehension beats. Each label/verdict should reveal as its word is spoken (not on a generic timer); insert pauses between items so the audience can read each one; and keep one graphic on screen until the next is ready — never leave a dead gap between animations. <!-- id:e58263a09f evidence:5 -->
- Audio is scrutinized at the sample level. Hunt and remove pops, clicks, blips, plosive p-pops, tinny/harsh sibilance, trailing artifacts, and any SFX that does not earn its place (pencil-scratch, redundant whooshes). Keep music comfortably under the voice — he will ask to bring the bed down a notch. Every SFX and every dB is fair game for a note. <!-- id:1ce048555f evidence:6 -->
- Show the real, recognizable him, and control on-screen text literally. His actual likeness must read as HIM ("oh, that is him"); his face is never cut off; and on-screen name/label wording is exact (e.g. "remove I am from I am Mitchell — it should read Mitchell Williams, same size font"). Generic/stock/"synthetic"/"just a zoomed clip"/"looks like it is looping" are kill words — the answer is more original, more dynamic, more him. <!-- id:2d1ce42b29 evidence:4 -->
- Route creative and design decisions through a council of models + an adjudicator, then collect his verdicts one question at a time in a low-cognitive-load interview. He explicitly asks for this on non-trivial redesigns and prefers deciding item-by-item, never a wall of choices. <!-- id:1b16184359 evidence:3 -->
- Every number and claim on screen must be true and reconciled to the live site. He will notice and challenge inconsistencies (e.g. $14.20 vs $8.26 vs $9.51 for one film; platform counts; stale screenshots). Cross-check costs, counts, copy, and captured site shots against current reality before shipping — the whole thesis is "every claim links to a source." <!-- id:f36f6528c5 evidence:3 -->
- When scope warrants, deliver changes as a self-contained handover prompt for a fresh instance, and isolate any file-mutating work in a git worktree to avoid colliding with sibling sessions running on the same repo. <!-- id:3557992d29 evidence:3 -->
<!-- END DISTILLED: distill-session-preferences (topic: broll-pipeline / PictureLock video edits) -->

<!-- BEGIN STANDING-RULES (Mitchell global, installed 2026-07-18) -->
## Standing rules (global)

These apply to any Claude instance working in this repo, including off-machine (CI, collaborators, cloud agents):

1. **Freshness re-anchor.** Before acting on the first input of a session, and again after any gap over ~3 hours, web-search to confirm the current Pacific date/time (PST/PDT-aware) and scan the task topic for anything that changed since your knowledge cutoff, before relying on training-data recall. Re-check any pending "today/tomorrow" commitment against the confirmed date.
2. **Stack-search before building.** At the start of any new build / feature / reusable tool, first research what already exists (X, Reddit, Hacker News, Discord, dev forums, package registries) for highly-rated, peer-recommended solutions. Report BUILD-vs-ADOPT with sources; bias to ADOPT over BUILD unless there is a real, audience-worthy gap. Build for an audience, not just yourself.
<!-- END STANDING-RULES -->
