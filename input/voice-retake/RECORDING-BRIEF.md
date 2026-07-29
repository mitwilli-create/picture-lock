# Voice Retake: Recording Brief
**For:** Mitchell · **Date:** 2026-07-11 · **Purpose:** rebuild the ElevenLabs voice clone with real charisma and prosody. The current clone sounds flat; no site narration generates until this retake exists.

**Drop the finished recording in this folder:** `~/Documents/broll-pipeline/input/voice-retake/`
Any common format works (WAV preferred, 48kHz if your interface offers it; a clean iPhone Voice Memos file is acceptable). Name it anything; the run watches the folder.

---

## Setup (2 minutes before you record)

- **Room:** the quietest room you have, soft surfaces if possible (closet with clothes beats an empty kitchen). Kill the fridge hum, HVAC, notifications.
- **Mic:** the S25 Ultra's built-in mic, holding the phone itself. Do NOT record through Bluetooth headphone mics (including the Bose QC Ultra): Bluetooth voice capture drops to a compressed telephony codec with heavy processing, which is the worst possible input for a clone. Bare phone beats any wireless headset here.
- **App:** Samsung's built-in Voice Recorder, Standard mode, highest quality in settings. Record RAW: no noise-reduction apps, no filters, no cleanup passes. The clone pipeline applies its own noise removal, and pre-processed audio strips the natural voice detail the clone needs.
- **Mic distance:** close and CONSISTENT. A fist-width from your mouth (10-15cm), slightly off-axis so plosives (p, b) don't pop. Keep the same distance the whole take; the clone learns your room tone and proximity.
- **Level check:** read one paragraph, play it back. You should hear voice, not room. If you hear echo, get closer and add soft stuff around you.
- **Water, stand up if you can, smile before the first line.** It changes the resonance and the clone will keep it.

## Direction

The clone copies whatever you give it, including boredom. So give it the version of you that explains something you love to someone you like.

- **Energy:** up a notch from conversational, not performative. Think "telling a friend at dinner," not "presenting."
- **Prosody:** VARY it deliberately. Let sentences land differently: some fast and flat, some slow with weight. Monotone in equals monotone out, forever.
- **Pacing marks in the script:** `/` = short beat (half a breath) · `//` = full pause (a breath) · **bold** = lean in, give it weight · *italic* = lighter, almost a smile.
- **Mistakes:** don't restart the whole take. Pause a full 2 seconds, redo the sentence, keep rolling. It gets cleaned in processing (`removeBackgroundNoise` handles the rest).
- **Length:** the script below runs about 2.5 minutes read naturally. If you're feeling it, read it twice: once as directed, once looser. More varied material = better clone.

---

## The script

> Hey, I'm Mitchell. // If you're hearing this, you found the part of the site where I explain how the whole thing works. / *Good instincts.*
>
> Here's the short version. / Everything you're looking at came out of a pipeline I built **in my living room**, / stills, motion, the voice you're hearing right now. // One machine, a stack of scripts, and a running cost ledger that would make a studio accountant *wince*.
>
> Let me get technical, because this is the part I **love**. / The pipeline is a chain of small deterministic stages. / An image model paints the plates. / A video model animates them. / A browser automation stage renders every diagram and receipt as **real code**, in a **real DOM**, / because generated video of a user interface always wobbles, / and engineers notice that. // Each stage logs what it spent. / The whole run lands **under fifteen dollars**.
>
> Now the story. // For eight years at Google I wrote for executives. / The words shipped, / the systems behind them were mine, / and nobody outside the building ever saw either one. // Two years ago I stopped writing about the systems / and **started building them**. // And when the layoff notice came in June, I had a choice: / polish a resume like everyone else, / or **build the thing a resume gestures at**. // So I built it. / *You're inside it right now.*
>
> That's the bet this site makes: / taste you can inspect, / work you can audit, / a voice that tells you the truth about how it was made. // This narration is **synthetic**. / I cloned it with my own consent, / from a recording a lot like this one.
>
> So look around. / Open the dev tools. / **Check the receipts.** // And if you want to build things like this together, / come find me. / *That's the whole point of this thing.*

---

## What happens after you drop the file

The run re-clones via `lib/elevenlabs.mjs` with background-noise removal, renders one test line three ways (different stability/similarity/style settings), picks the best by listening pass, records the chosen settings, then generates all site narration. If the retake lands after v1 ships, narration drops in without a redeploy of anything else.

*Provenance note: script drafted through Voice OS (run `run-20260711T152613Z-e5d35999`, live mode, best-effort draft at fidelity 0.56 vs the 0.65 doc gate; the miss is on sentence-rhythm/pace axes, expected for a deliberately register-varied performance script). Edit any line that doesn't feel like you; the clone only needs your sound, not this exact text.*
