# Craft Law

Standing production rules. Loaded verbatim into every creative council seat, every
director synthesis, and every review-board judgment. Violations are grounds for
rejection at review. Append via the reflection mechanism; never delete ratified law.

## Ratified

1. **PACING.** No shot holds longer than 4 seconds unless it contains continuous,
   strong camera or subject movement. Default cut length is 2-4 seconds. Front-load
   the shortest cuts. Long shots give the viewer time to find inconsistencies;
   do not give them time.

2. **LITERALISM.** The on-screen subject must BE the thing the narration names at
   that moment, not a generic stand-in. Narration about video editing shows an
   editor cutting on a professional NLE timeline. Narration about sound design
   shows a sound designer working in a studio booth with consoles and gear.
   Narration about a script shows a properly formatted screenplay page.

3. **TEXT-BEARING PROPS.** Never show blank paper, blank screens, or blank
   whiteboards where content is expected; a blank prop reads as fake. Shots whose
   subject carries text or UI route to medium "animated": generate the still with
   an image model that renders legible text (nano banana 2), then animate it with
   image-to-video. Live text-to-video prompts must keep any text implied (angle,
   distance, shallow focus) and must never frame a close blank page.

4. **SOUND DOCTRINE.** A well-composed music bed runs under the entire piece by
   default, scored to the edit's energy curve. Sound effects are woven in, not
   featured: placed on cuts, ducked well under the voice, motivated by what is on
   screen. Never a mid-beat attention grab that disrupts the pacing.

5. **ALIGNMENT.** Every second of screen time aligns with the words being spoken
   in that window. If the narration moves on, the picture moves on.

6. **MOTION.** Every shot needs visible motion, camera or subject. Static or
   low-motion imagery may not hold beyond 3 seconds; cut it shorter or replace it
   with an animated insert.

7. **MEDIUM CHOICE.** Choose the right tool per shot, not one tool for everything:
   "live" (text-to-video) for organic humans-and-places footage; "animated"
   (nano banana 2 still, then image-to-video) for text-bearing, stylized, graphic,
   UI, or precision-composition shots and dynamic design-driven inserts;
   "mograph" (code-rendered) for the pipeline's real data and interfaces.

8. **VERB LITERALISM.** Literalism covers the action, not just the subject. If the
   narration says the ice ARRIVES, the screen shows arrival: a delivery truck
   pulling in (an ice truck or a fish-delivery truck both qualify), crates and
   totes being unloaded, ice being carried to the counter. Match the verb.

9. **SPECTATOR INTERCUT.** When the narration describes observers (tourists,
   audiences, customers), never settle for one shot of them watching. Build an
   action-reaction intercut: the queue outside, phones coming up, the spectacle
   itself (the toss, the wrap, the handoff to the customer), cut fast between
   what they see and them seeing it.

10. **THREE-LAYER SOUND.** Every piece carries three audio layers under the voice:
    (a) a continuous natural ambience bed matched to the scenes on screen (market
    murmur, ice, weather, room tone), always present, mixed low; (b) a music bed
    that sets pace, clearly audible but never overpowering the action or the voice;
    (c) sparse accents on cuts. No effect may be harsh, screechy, or high-frequency
    dominant; every accent is low-passed and level-capped, and audio that fails
    the harshness check regenerates with a softer prompt before mixing.

11. **VOICE QUALITY.** Demo and showcase pieces use production-quality narration
    (a real voice or ElevenLabs TTS), never OS speech synthesis. Cover mode
    preserves the customer's voice untouched; garbage in stays garbage out, so
    say so at intake rather than shipping it silently.

Provenance: rules 1-7 ratified 2026-07-08 from Mitchell's review of cover v1 and
portfolio v2; rules 8-11 ratified 2026-07-08 from Mitchell's review of cover v2.

## Proposed (pending ratification)

(Reflection runs append here; promote to Ratified after human review.)

- **SIGNAGE ROUTING** (proposed 2026-07-08): Any establishing or wide shot of a real branded location (markets, storefronts, streets, or interiors) whose frame would include readable signage must NOT be produced in the live (text-to-video) medium. Route it to the animated medium: generate a designed still with correct, legible signage using the text-capable image model, then animate via image-to-video. At review, reject any live-generated location shot containing signage, whether legible or garbled.
- **SIGNAGE EXCLUSION FRAMING** (proposed 2026-07-08): If a signage-heavy real location must be shot live, the direction must specify framing that physically excludes all signage from the frame (tight subject crops, low or overhead angles, foreground occlusion, or facing away from signage) rather than relying on crop, bokeh, blur, or distance instructions to hide it. Any prompt whose only defense against garbled signage is 'crop out,' 'blur,' or 'bokeh' is non-compliant and rejected at direction time.

- **SCENE-RESPONSIVE AMBIENCE LEVEL** (proposed 2026-07-08): Sharpening Rule 10(a): the natural ambience bed is not a fixed low mix. In any scene whose on-screen action carries strong implied sound (fish slapping counters, crowds, market calls, machinery, weather), raise the nat-sound bed until it is clearly audible beneath the voice, not merely present. At review, reject cuts where a visibly loud environment reads as near-silent under music and voice; the ambience level must track the visible sound-energy of each scene, not sit at one global low setting.
- **SYNCED DIEGETIC ACCENTS** (proposed 2026-07-08): Every on-screen action that would physically make a sound (a fish hitting the counter, a crate dropping, a cleaver strike, a handoff, a door) must carry a diegetic accent synced to the exact frame of impact, motivated by and matched to that action. These synced accents are distinct from the sparse cut accents of Rule 10(c) and are required wherever a clear sound-producing beat appears on screen. At review, reject any prominent sound-making action that plays silent.
- **VOICE ENERGY AT INTAKE** (proposed 2026-07-08): Assess narrator voice energy upstream, at sample selection, before production: a flat, low-energy read reads as flat no matter how the mix is balanced and cannot be rescued downstream. Reject any voice sample or TTS take whose delivery lacks dynamic energy and pace variation at intake, and re-source or re-generate before the piece proceeds; do not defer voice-energy problems to the mix stage.

- **PER-SHOT SOUND DESIGN FROM SCRATCH** (proposed 2026-07-08): The sound designer must examine EVERY shot in the assembled piece individually and build its sound design from scratch, recreating the full natural sound that footage would have produced had a live microphone been on set for that action. An isolated one-shot accent dropped on a cut does NOT satisfy this and is not sound design. At direction time, every shot must carry an explicit per-shot nat-sound spec (what the mic would hear: the ice crunch, the shovel scrape, the pour, the footsteps, the room tone). At review, reject any shot that plays with no purpose-built natural sound of its own, and specifically reject any sound-producing open (e.g. a fish-on-ice slap) that lands silent.
- **CONTINUOUS AMBIENCE COVERAGE** (proposed 2026-07-08): No scene may carry zero ambience. Every shot and every scene must have a natural ambience bed present; a scene that plays with no nat-sound at all is a defect. At review, audit ambience coverage scene by scene and reject any scene (not just the loud ones) that reads as an ambience dropout beneath the voice and music.
- **NAT-SOUND MESHING AND CROSSFADES** (proposed 2026-07-08): Each shot's natural sound must be meshed into the whole piece, not butt-joined. Crossfade every shot's nat-sound bed with the preceding and following shots' nat sound so the environment flows continuously across cuts, and weave those beds with the music using deliberate sound transitions. No audio clip may start or stop abruptly: hard clip starts and stops read as pops and are rejected. At review, reject any audible pop, click, or abrupt clip edge, and reject any cut where the ambience cuts in or out instead of crossfading.
- **NATURALISTIC ACCENT SOURCING** (proposed 2026-07-08): Diegetic and accent sounds must sound like real recorded sound from the scene, not synthetic library stings. Any accent that reads as artificial, electronic, or 'off' for its on-screen source (e.g. a camera-shutter accent that sounds synthetic) fails the naturalism check and must be re-sourced or regenerated before mixing. At review, reject any accent whose timbre does not plausibly match the physical object that would have produced it on set.
- **GRADE FOR NATURALISM** (proposed 2026-07-08): Color-grade every piece for naturalism, not vividness. Do not push warmth or saturation to the point that footage reads as stock or advertising footage rather than real, observed footage. At review, reject grades that are visibly oversaturated or overly warm; the target is believable, neutral real-world color that matches how the scene would actually look, not a heightened commercial look.

- **COMPOSITION MIX PASS** (proposed 2026-07-08): Never ship a static-level stem mix; every piece must pass a composition mix pass with dynamic, program-dependent levels. Sidechain-duck the natural-sound bed to the voice at approximately 4:1 and the music bed at approximately 3:1, leaving audible breathing room so neither is crushed to inaudibility under continuous narration. The voice must always sit on top of the mix. At review, reject any mix whose stems hold fixed levels regardless of whether the narrator is speaking, or where nat sound or music vanishes to near-silence during sustained voice.
- **MASTER LOUDNESS SPEC** (proposed 2026-07-08): Loudness-normalize the final master to -14 LUFS integrated with a true-peak ceiling of -1.5 dB. At review, reject any cut whose measured integrated loudness or true peak falls outside these targets.
- **TRANSIENT-ALIGNED IMPACTS** (proposed 2026-07-08): Align every impact accent to the transient of its cut or on-screen impact frame-accurately. At review, reject any impact accent that lands early or late relative to its visual hit.
- **NAT-SOUND RING-OUT** (proposed 2026-07-08): Every natural-sound track must ring past its shot boundary and fade out under the following shot rather than terminating at the cut. At review, reject any nat track that stops dead on its shot's out-point instead of decaying across the boundary.
- **BLIND MULTIMODAL AUDIO REVIEW GATE** (proposed 2026-07-08): No cut ships without passing a blind audio review performed by a multimodal listener model that actually processes both video and audio. Give the reviewer zero context and require it to score, with timestamps, mix hierarchy, music, nat-sound realism, sync, transitions, artifacts, and overall polish. Iterate the cut until the blind reviewer returns a ship verdict; a human must never be the sole QA listener. At review, reject any piece lacking a passing blind-reviewer report with timestamped scores.
- **FOLEY PROMPT ACOUSTIC AND MATERIAL SPEC** (proposed 2026-07-08): Every foley or video-to-audio prompt must explicitly specify both the acoustic space (e.g. indoor market reverb, not dry ADR) and the physical material of the sound source (e.g. fleshy wet fish impact, weighty ice), because audio models default to white-noise-like stock textures without them. At direction time, reject any foley prompt missing an explicit acoustic-space descriptor or an explicit physical-material descriptor.

- **AUDIO VERB LITERALISM** (proposed 2026-07-09): Extend Rule 8 (Verb Literalism) to sound: when the picture shows a specific sound-producing action (an impact, a pour, a throw, a cut, a slap), the mix must carry that exact sound, matched to the action's material and force, not a generic substitute. At review, reject any shown action whose audio is missing, generic, or belongs to a different action than the one on screen.
- **CONTACT-FRAME SYNC, NOT CUT SYNC** (proposed 2026-07-09): Sharpen Rule TRANSIENT-ALIGNED IMPACTS and SYNCED DIEGETIC ACCENTS: when the on-screen moment of contact does not coincide with a cut, sync the diegetic sound to the visual contact frame, never to the nearest cut. At review, reject any impact, pour, or handoff sound aligned to the edit point rather than to the frame where the action physically lands.
- **MUSIC BAND: SILENCE AND DOMINANCE BOTH FAIL** (proposed 2026-07-09): Sharpen Rule 10(b): the music bed must be continuously felt yet never win. Both a passage with no perceptible music and a passage where music masks the voice or covers an on-screen sound-producing peak are defects. At review, reject any window where music is inaudible AND any window where music competes with or overtakes the vocal or a diegetic impact.
- **VOICE-ON-TOP IS AUTOMATIC-FAIL** (proposed 2026-07-09): Sharpen COMPOSITION MIX PASS: any single moment where music or nat sound rises to compete with, mask, or momentarily match the narration is an automatic rejection, not a balance judgment. At review, flag every timestamp where the voice is not unambiguously the top element of the mix and reject the cut until each is resolved.
- **SCENE-ORDERED PER-SHOT REVIEW OUTPUT** (proposed 2026-07-09): Every review report (human or blind-model) must be structured scene-by-scene in playback order with a per-shot timestamp for each note, mirroring how the client gives notes ('first scene, second scene, the shots of...'). At review, reject any QA report that aggregates notes globally instead of attributing each note to a specific timestamped shot in sequence.
- **REPEATED-NOTE PROCESS FAILURE** (proposed 2026-07-09): Treat any review note that recurs across cycles as a process failure, not a taste difference: after every review cycle, each distinct note must be converted into a checkable standing rule (via the reflection mechanism) before the next piece proceeds. At review, if a note repeats a prior cycle's note that was never codified, halt and file the missing rule rather than re-litigating the piece.
- **CLIENT-FINGERPRINT AUDIT ORDER** (proposed 2026-07-09): Run self-review and blind-review scoring in the client's demonstrated priority order: (1) does every on-screen action produce its real sound synced to its contact frame; (2) is the voice unambiguously on top everywhere; (3) is music felt but never winning; (4) do all tracks dissolve with no audible starts, stops, pops, or dips; (5) does all audio and grade read as naturally recorded rather than synthetic or stock. A piece that fails an earlier item is rejected before later items are judged.
- **SYNTHETIC-OR-STOCK KILL CRITERION** (proposed 2026-07-09): Sharpen NATURALISTIC ACCENT SOURCING and GRADE FOR NATURALISM into a single unconditional kill criterion: any audio element that reads as synthetic/library or any grade that reads as stock/advertising footage is an automatic rejection regardless of other merits. At review, tag every element that sounds or looks 'stock' with its timestamp and reject the cut until each is re-sourced to a naturalistic, observed-reality result.

- **SCREEN-AND-STATIC SHOTS ARE VOICE-AND-SCORE ONLY** (proposed 2026-07-09): Carve an explicit exception into PER-SHOT SOUND DESIGN FROM SCRATCH and CONTINUOUS AMBIENCE COVERAGE: for any shot whose subject is predominantly a screen, UI, terminal, dashboard, code, graphic, or an otherwise static space with no on-camera physical action, do NOT invent natural sound, foley, or ambience. The correct sound design for these shots is voice and music bed only. At direction time, mark each such shot 'voice+score only' and omit any per-shot nat-sound spec; at review, reject any screen/UI/static shot that carries invented foley or fabricated ambience.
- **FOLEY REQUIRES ON-CAMERA PHYSICAL ACTION** (proposed 2026-07-09): Restrict per-shot foley and synced diegetic accents to footage containing real physical action visible on camera (impacts, handling, pours, throws, cuts, crowds, machinery, weather, footsteps). A shot with no visible sound-producing action gets no manufactured foley. At review, reject any diegetic accent or foley element that has no corresponding on-screen physical action to motivate it.
- **PHANTOM-SOUND ARTIFACT KILL CRITERION** (proposed 2026-07-09): Treat invented sound on screen-heavy or static shots as an artifact defect. At review, flag and reject any phantom vocalization (singing, humming, muttering), whistling, unmotivated rustle, or other sound with no visible source, with its timestamp; these are automatic rejections regardless of mix quality, because unmotivated sound reads as a generation artifact rather than sound design.
- **RESTRAINT-AS-CRAFT REVIEW CHECK** (proposed 2026-07-09): Add a restraint pass to sound-design review: for every shot, confirm that each present sound element is motivated by something visible on camera, and that shots warranting silence-under-voice-and-score are left clean. At review, reject any cut that adds sound to a shot purely to satisfy coverage rules when no on-screen action motivates it; deliberate absence of foley on screen/UI/static shots is compliant, not a defect.
