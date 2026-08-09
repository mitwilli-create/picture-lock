# Spec — AI storyboarding layer for PictureLock

**Status:** Draft
**Source idea:** `broll-pipeline-ideas/docs/FUTURE-IDEAS.md` — "Add an AI storyboarding layer to the stack" (logged 2026-07-16)
**Research basis:** `~/.claude/agents/runs/researcher-report-20260723-034928.md` (adjudicated ADOPT-vs-BUILD sweep — verdict: BUILD thin)
**Target repo:** `mitwilli-create/picture-lock` (broll-pipeline)

## Problem Statement

Producing a shot Mitchell already sees in his head requires re-engineering prompts across a single instance — usually multiple paid regenerations per shot — because intent lives only inside a prose prompt string. When a shot misses, he cannot diff intent-vs-output, so the next attempt is another guess. Provider-specific prompt idioms (Runway motion params, Kling camera tokens, Veo prose, Sora prose) leak into every prompt, so swapping providers or model versions silently breaks look.

## Solution

Introduce a provider-neutral **shot object** as the durable creative source-of-truth between the creative council and the generator. The council already produces per-beat direction (`lib/creative.mjs :: directShots / directPiece`); today its output is a partially-shaped prose prompt plus a `medium` tag. This spec formalizes that output into a validated shot schema with semantic tokens (framing, camera-move, lens, lighting, palette, style-refs, continuity-group, duration, aspect), then adds **versioned per-provider compilers** that translate the neutral shot into each generator's native control surface at the last possible moment. The neutral spec is written to disk as the run's storyboard; the compiled prompt, provider, model version, seed, and returned asset are linked back to the shot in `output/run-manifest.json` so any failed take can be diffed against the intent that produced it. Telemetry — prompt-iterations-per-shot, $/finished-shot, retake count — is emitted from day one so the layer can be measured against the hypothesis that it reduces total iteration cost. If those numbers do not move, the layer is removed.

Nothing about the storyboard authoring UI changes: the council is the author. No new editor is built. No new orchestrator is built. OpenTimelineIO is adopted for sequence/timing/media-reference interchange; the shot object carries the cinematic-intent fields OTIO deliberately does not define.

## User Stories

1. As a PictureLock user, I want the council's direction persisted as a structured storyboard, so I can inspect exactly what each shot was asked to be before spending on generation.
2. As a PictureLock user, I want to see per-shot fields (subject, framing, camera-move, lens, lighting, palette, duration) rather than only a prose prompt, so I can edit intent surgically instead of rewriting prose.
3. As a PictureLock user, I want the same storyboard to work whether the generator is Veo, Runway, Kling, or Sora, so switching providers does not force a rewrite of every prompt.
4. As a PictureLock user, I want provider-specific prompt strings compiled from the neutral shot at render time, so provider-idiom drift stays in one file instead of leaking through the pipeline.
5. As a PictureLock user, I want each shot to declare `camera_move_intensity` as a bounded value, so "slow dolly in" is not a different phrase across providers.
6. As a PictureLock user, I want the storyboard to carry `start_frame_ref` and `end_frame_ref` fields, so shots that need identity or setup continuity have somewhere to hang the reference instead of dying in the prose.
7. As a PictureLock user, I want a `continuity_group` field grouping shots that must share look/subject/character, so a downstream consistency layer (StoryDiffusion-class, out of scope for v1) has a hook when it lands.
8. As a PictureLock user, I want the storyboard validated before any spend, so an over-specified shot (impossible lens + framing + subject-motion combo) is caught pre-render, not after a paid failure.
9. As a PictureLock user, I want every rendered clip linked back to the exact shot spec, compiled prompt, provider, model version, and seed that produced it, so I can diff a rejected take against the intent behind it.
10. As a PictureLock user, I want to re-run a single failed shot from its stored spec, so I do not have to re-derive intent from scratch or rerun the council.
11. As a PictureLock user, I want the shot spec versioned (schema version pinned per run), so a schema change six months from now does not silently invalidate a past receipt.
12. As a PictureLock user, I want compilers versioned per `(provider, model)`, so a Veo update or a Runway model swap changes one compiler function, not every shot.
13. As a PictureLock user, I want the review board (`reviewClip`) to receive the neutral shot spec plus the compiled prompt, so its judgment is against original intent, not the lossy prose.
14. As a PictureLock user, I want retake attempts to reuse the same shot spec by default and only mutate the compiled prompt (or bump `camera_move_intensity`, or swap provider), so the intent stays anchored across attempts.
15. As a PictureLock user, I want the run manifest to record prompt-iterations-per-shot, retakes-per-shot, and $/finished-shot as first-class fields, so I can test whether the storyboarding layer paid for itself.
16. As a PictureLock user, I want a baseline captured (last N runs pre-storyboard) so the post-storyboard numbers have something to compare against.
17. As a PictureLock user, I want the storyboard writable as OpenTimelineIO so timing and media-references can round-trip through tools that speak OTIO.
18. As a PictureLock user, I want the pipeline to still run end-to-end in `--mock` with zero spend, producing the same storyboard artifact against colored-card fallback clips, so the schema is exercised on every mock run.
19. As a PictureLock user, I want the CLI to accept `--storyboard path/to/storyboard.json` to skip council direction and render straight from a hand-edited spec, so I can hand-tune a single shot without re-running the debate.
20. As a PictureLock user, I want a compiler failure (unknown provider, unknown model version) to fail loud and refuse to spend, so silent fall-through to a generic prompt never happens.
21. As a PictureLock user, I want cover-mode (`directPiece`) to emit the same shot schema as script-mode (`directShots`), so both paths converge on one storyboard model.
22. As a PictureLock user, I want negative constraints (`no readable text`, `no logos`, etc.) as a structured `negative` list rather than a suffix pinned to every prose prompt, so provider compilers can express them idiomatically.
23. As a PictureLock user, I want a `style_refs` array of asset IDs (with immutable content-hash IDs the run manifest resolves), so referenced imagery is portable across providers instead of encoded as URLs baked into a prompt string.

## Implementation Decisions

- **One new module: `lib/storyboard.mjs`.** Houses (a) the shot schema (JSON Schema), (b) the storyboard schema (ordered shots + visual system + schema version), (c) versioned compilers keyed on `(provider, model)`, (d) validation. No other new modules. This is the single new seam.
- **Existing seam reused: the council output boundary.** `lib/creative.mjs :: directShots / directPiece` are extended so their return value's `shots[]` items conform to the new shot schema — they already emit `prompt / medium / stillPrompt / motionPrompt`; the schema formalizes those and adds the missing semantic fields. The council remains the storyboard author.
- **Existing seam reused: `lib/fal.mjs`.** The generator adapter gets one new call ahead of the fetch: `compile(shot, provider, model)` → `{ prompt, params }`. `pipeline.mjs` never assembles a provider prompt string directly.
- **Existing seam reused: `output/run-manifest.json`.** The `record(...)` helper gets a new stage type `storyboard` and per-shot generation records extend with `{ shotId, schemaVersion, compilerVersion, provider, model, seed, compiledPrompt }`. No new receipt file.
- **Shot object fields (v1):** `id, beat, subject, action, setting, shot_size, camera_angle, lens_or_fov, camera_move, camera_move_intensity (0-3 bounded), duration_s, fps, aspect_ratio, lighting, palette, style_refs[], start_frame_ref?, end_frame_ref?, continuity_group?, negative[], medium (live|animated|mograph), edit_context, prompt_hint?`. `prompt_hint` is the council's prose seed the compiler may draw on; it is not authoritative.
- **`camera_move` vocabulary is enumerated** (`static, pan_l, pan_r, tilt_u, tilt_d, dolly_in, dolly_out, truck_l, truck_r, orbit_l, orbit_r, handheld, push_in, pull_out`) so the compiler layer, not the council, owns the provider-idiom translation.
- **`camera_move_intensity` is a bounded 0-3 integer.** Providers that only accept prose translate it to a phrase; providers with motion params translate it to a value.
- **Compilers are pure functions, one per `(provider, model)`.** Signature: `compile_veo_3_1_fast(shot, ctx) → { prompt, params }`. A registry maps `(provider, model) → compiler`. Unknown pair throws; no default fall-through. This addresses the research's "backend leakage" and "silent compromise" failure modes.
- **Validation runs before any paid call.** `validateShot(shot) → { ok, errors, warnings }`. Warnings include jointly-implausible combos (`shot_size: 'ecu' + camera_move: 'orbit_l'`); errors block spend. Council output is validated inside `directShots` before returning, so an invalid shot never reaches the cache.
- **Cache/version discipline.** The council's `directShots` cache key already versions on `directShots:v2:...`; add the shot schema version to the key so a schema change invalidates cached briefs correctly.
- **OpenTimelineIO adopted for timeline interchange, not intent.** `writeOTIO(storyboard) → path/to/storyboard.otio` writes the ordered timing/media-reference layer. The cinematic-intent fields ride in the OTIO `metadata` dict under a namespace (`picturelock.shot_v1`). No dependency on any OTIO writer library — a minimal JSON emitter that matches the OTIO schema is fine for v1 (the format is stable and well-documented).
- **The neutral storyboard is the on-disk artifact.** `output/storyboard.json` (this-run) plus `.cache/storyboard/<hash>.json` (durable). Compiled prompts are recorded in the manifest, not in the storyboard file — the storyboard stays provider-neutral.
- **Telemetry from day one.** `record('storyboard', ...)` emits `{ shotsPlanned, shotsRendered, retakes, promptIterations, costUsd, schemaVersion }`. `output/run-manifest.json` gains a top-level `metrics.storyboardV1 = { iterationsPerFinishedShot, dollarsPerFinishedShot, retakesPerShot }`.
- **Baseline captured before v1 ships.** A one-off `scripts/measure-baseline.mjs` extracts iterations/retakes/$-per-shot from the last N committed runs (pre-storyboard) and writes `output/baseline-pre-storyboard.json`. Kill-criterion for the layer post-launch is measured against this baseline.
- **Retake path anchors on the shot spec.** `reviewClip` receives the shot spec; retakes rewrite the compiled prompt (or bump `camera_move_intensity`, or swap provider/medium) without mutating the shot's semantic fields unless the review explicitly rules the intent wrong.
- **CLI flags added:** `--storyboard <path>` (render from existing spec, skip council) and `--dry-storyboard` (run council + write `output/storyboard.json`, exit before any generator spend).
- **Explicit non-goals coded as guards:** no storyboard editor UI, no new orchestrator, no automated cross-shot identity locking, no automated LLM re-write of storyboards beyond the council itself.
- **Compiler shape (from prototype-style pseudocode — decision-encoding only):**
  ```
  const REGISTRY = {
    'veo:3.1-fast':    compileVeo31Fast,
    'runway:gen-4':    compileRunwayGen4,
    'kling:v2-master': compileKlingV2,
    'sora:2':          compileSora2,
  }
  function compile(shot, provider, model) {
    const key = `${provider}:${model}`
    const fn = REGISTRY[key]
    if (!fn) throw new Error(`no compiler for ${key}`)
    return fn(shot, { schemaVersion: SHOT_SCHEMA_VERSION })
  }
  ```
  The point encoded here: registry lookup, throw on miss, schema version passed to compiler so it can refuse an unsupported version explicitly.

## Testing Decisions

Tests target external behavior at the module boundaries: what the storyboard module accepts, what compilers emit, what `directShots` returns, what the manifest records. Nothing tests internal helpers directly.

- **`lib/storyboard.mjs` unit tests:** given a well-formed shot, `validateShot` returns `{ ok: true }`. Given each error case (missing required field, unknown `camera_move`, out-of-range `camera_move_intensity`, unknown `medium`), returns `{ ok: false, errors: [...] }` with the specific error surfaced. Given each warning case (jointly-implausible combos enumerated in the schema), returns `{ ok: true, warnings: [...] }`.
- **Compiler golden tests:** one snapshot per `(provider, model)` × three representative shots (static wide, dolly-in mid, orbit close-up). Snapshots are checked into `tests/fixtures/compiled/`. A compiler change requires an intentional snapshot update — prior art: the pattern used for `run-manifest.json` receipts committed under `output/`.
- **Registry test:** `compile(shot, 'unknown', 'x')` throws with a message naming the missing key. `compile(shot, 'veo', '3.1-fast')` returns `{ prompt, params }` for a shape assertion (not exact string match — the golden test covers content).
- **Council integration test:** `directShots` returned `shots[]` items validate against the shot schema on a canned segment list. Runs against a stubbed Anthropic response fixture (no network). If schema validation fails, the test names the specific shot index and field.
- **Round-trip provenance test:** after `pipeline.mjs --script fixtures/tiny.md --mock`, the run manifest contains an entry per shot linking `{ shotId → compiledPrompt, provider, model, seed }` and every `shotId` resolves to a shot in `output/storyboard.json`.
- **Mock smoke test (end-to-end):** `npm run mock` (existing) runs the full pipeline zero-spend and produces `output/short.mp4`, `output/storyboard.json` (new), and `output/run-manifest.json` with the `metrics.storyboardV1` block populated. **This is the named smoke test that proves it works end to end.** Success = mock exits 0, storyboard.json validates against the v1 schema, manifest carries the three metric fields (`iterationsPerFinishedShot`, `dollarsPerFinishedShot`, `retakesPerShot`) with real integer values.
- **`--storyboard <path>` test:** given a hand-authored `fixtures/mini-storyboard.json`, `pipeline.mjs --storyboard fixtures/mini-storyboard.json --mock` skips council direction (assertable via the manifest's absence of a `council` cost record for the run) and renders straight from the spec.
- **Kill-criterion measurement (post-ship, not CI):** the `scripts/measure-baseline.mjs` output is compared against the first 10 post-launch runs' `metrics.storyboardV1`. If `iterationsPerFinishedShot` and `dollarsPerFinishedShot` are not lower, the layer is removed. The decision itself is human, not automated; the measurement is committed as a receipt.

## Out of Scope

- Building a storyboard editor UI. The council is the author. If hand-editing becomes routine, revisit — but the neutral JSON on disk is the seam.
- Cross-shot identity/character/style locking. This is a separate problem (StoryDiffusion-class reference-image conditioning) the research flagged explicitly. The `continuity_group` field is the hook a future consistency layer would use; v1 does not act on it.
- Automated cross-provider fallback (if Veo fails, retry Kling). The registry supports it structurally; the routing policy is out of scope.
- Any new LLM other than the existing council. No separate storyboard-authoring LLM.
- Adopting an existing product (Higgsfield Popcorn, Kling multi-shot, LTX Studio, VideoDirectorGPT, Wonder Unit Storyboarder, ComfyUI). Research verdict is BUILD because none of these emit a provider-neutral spec with versioned compilers to Runway/Kling/Veo/Sora; they are either ecosystem-locked (Higgsfield, Kling, LTX) or category-adjacent (Storyboarder = manual authoring, ComfyUI = execution graph, OTIO = timing interchange). OTIO is the one adjacent thing being adopted, and only for the timing/media-reference layer.
- Storyboard versioning/history (git-style diffs across runs). The manifest carries schema version; richer history waits for evidence anyone needs it.
- Rendering the storyboard as a visual preview (thumbnail grid, PDF board). Nice-to-have, not load-bearing for the iteration-cost hypothesis.

## Further Notes

- **Research corroboration for this shape:** the adjudicated sweep enumerated Higgsfield Popcorn, Kling multi-shot, LTX Studio, VideoDirectorGPT, MovieAgent, Wonder Unit Storyboarder, ComfyUI, OpenTimelineIO, StoryDiffusion — none fit the provider-neutral-with-compilers scope. Failure modes to design against (all three models converged): storyboard-to-prompt translation loss, cross-shot drift, over-specification, LLM hallucinated non-executable moves, backend leakage from raw provider fields, reference-asset lifecycle debt. The schema + validation + versioned-compilers + provenance shape addresses each explicitly.
- **The success metric is the whole point of v1.** If prompt-iterations-per-shot and $/finished-shot do not drop, the layer failed and should be removed (not deepened). Baseline capture is a v1 blocker, not a follow-up.
- **Sequencing suggestion:** ship the schema + validation + one compiler (Veo 3.1 Fast, the current provider) first, wire the council output through it, land the storyboard.json artifact and the manifest metrics. Second compiler (Runway or Kling) comes after 10 runs of measured baseline-vs-post data — that measurement is what justifies the second compiler at all.
- **Kill criteria (locked at spec time):** (a) after 10 runs, `iterationsPerFinishedShot` not lower than baseline → remove the layer; (b) any compiler needs to touch three or more shot-schema fields to work → the schema is leaking backend concerns, redesign before adding more compilers; (c) validation false-positive rate blocks routine work → relax to warnings, do not silently drop rules.
- **Provider-neutral does not mean provider-blind.** The shot spec may carry `preferred_provider` / `preferred_model` hints from the council when the direction is idiomatically a fit for a specific model. The compiler layer is the enforcement point; the spec merely records the preference.
