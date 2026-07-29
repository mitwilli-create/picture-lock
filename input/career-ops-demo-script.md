# Career-ops dashboard walkthrough · narration script (v1 draft)
# Target: ~3:00 at conversational pace. One continuous TTS take for prosody,
# same pattern as walkthrough-script-e.md. Em-dash free per standing gate.
# Numbers cross-checked against career-ops.html (52 launchd agents, 1,150+
# scored role reports) 2026-07-14. Beat map follows
# career-ops/data/dashboard-demo-run-of-show-2026-07-07.md, adjusted for
# demo-mode honesty: the recording shows fabricated demo data, and the VO
# says so out loud. Beat 4 incident: temperature-deprecation bug (default
# pick, swap if Mitchell prefers the tax-agent story).

This is career-ops. I forked an open-source job-search pipeline and rebuilt it into a cost-governed system run by fifty-two scheduled agents. It runs my actual job search. One honest note before we start: the real dashboard shows recruiter names and salary numbers, so what you're watching is the same system pointed at a demo dataset. Every company on this screen is invented. Everything else is real.

This is the apply-now board. Every role here ran through triage, a multi-model scoring council, and adjudication before it earned a rank. These scores aren't hardcoded. They're computed per role, grounded in my actual CV corpus, with the source cited. Over eleven hundred role reports have come through this pipeline.

Here's the part that matters. I don't just run agents, I watch them. Batch telemetry with per-run cost and timing. A regression guard that flags when something quietly breaks. A health agent that checks OAuth tokens, quotas, and scheduled jobs every morning. When you operate agents in production, the hard part isn't generation. It's knowing when they're wrong.

One story to make that concrete. A model vendor deprecated a single API parameter. Every batch started failing silently, and the queue just kept retrying forever. No crash, no error email, nothing. The dashboard is how I caught it: the batch panel showed one hundred percent errors at zero progress. Symptom, telemetry, fix. That loop is the whole reason this page exists.

I built this to run my own search, but the muscle is the one a forward-deployed role needs: stand up an agentic system against a real workflow, instrument it, and keep it honest. Even this voice is synthetic, cloned from me with my consent. The code is on my GitHub, and I write about what I learn at the storyteller mitch dot com. Check the receipts.
