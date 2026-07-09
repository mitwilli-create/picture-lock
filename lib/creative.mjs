// lib/creative.mjs: the creative council, v2.
//
// Seven active experts analyze the piece, DEBATE each other across rounds
// (rebut, concede, hold non-negotiables), a master director adjudicates the
// argument into one Edit Decision Brief, and the panel gets a veto round on
// the brief before anything generates. Every seat, every judgment, works under
// the Craft Law in craft/rules.md, which is append-only and grows through the
// reflection mechanism, so a mistake caught once is guarded forever.
//
// The brief routes each shot to a medium: "live" (text-to-video), "animated"
// (nano banana 2 still with legible text, animated via image-to-video), or
// "mograph" (code-rendered from real artifacts). Bare fetch, structured
// outputs, per-call cost estimates recorded by the caller.

import { execFileSync } from 'child_process';
import { readFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CREATIVE_MODEL ?? 'claude-opus-4-8';
const IN_RATE = 5 / 1e6, OUT_RATE = 25 / 1e6; // Opus 4.8 $/token
const DEBATE_ROUNDS = parseInt(process.env.DEBATE_ROUNDS ?? '2', 10);

const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

export function craftLaw() {
  try { return readFileSync(join(ROOT, 'craft', 'rules.md'), 'utf8'); } catch { return ''; }
}

function apiKey() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY not set: the creative council needs it (add to .env).');
  return k;
}

async function call({ system, content, schema, maxTokens = 4000, _retry = true }) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`creative (${MODEL}) → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const msg = await res.json();
  if (msg.stop_reason === 'refusal') throw new Error('creative: model declined the request');
  const cost = (msg.usage?.input_tokens ?? 0) * IN_RATE + (msg.usage?.output_tokens ?? 0) * OUT_RATE;
  if (msg.stop_reason === 'max_tokens') {
    if (!_retry) throw new Error('creative: output truncated twice (max_tokens)');
    const again = await call({ system, content, schema, maxTokens: maxTokens * 2, _retry: false });
    return { out: again.out, costUsd: +(cost + again.costUsd).toFixed(4) };
  }
  const text = msg.content.find((b) => b.type === 'text')?.text ?? '{}';
  return { out: JSON.parse(text), costUsd: +cost.toFixed(4) };
}

const MANDATE = `The audience has the attention span of a gnat. The piece must CAPTURE within the first 2 seconds and HOLD with a change of visual energy every 5-7 seconds. Every recommendation serves retention. Concrete over abstract, motion over stillness, specific over generic.`;

const GEN_RULES = `Live text-to-video prompts (9:16 vertical): physical subjects, described light, described camera movement; keep any text implied (angle, distance, shallow focus); never frame close blank pages or garbled UI. Animated-medium shots are FIRST generated as a designed still by an image model with state-of-the-art legible text rendering, then animated with image-to-video; use this medium for anything text-bearing, stylized, graphic, UI, or precision-composed. No cliches: no hooded figures, no generic glowing-tech abstractions.`;

const SPECIALISTS = [
  ['cinematographer', 'You are an award-winning cinematographer who fights for the frame. Define ONE visual system (palette, light, lens and movement language) and enforce it shot by shot. You never accept a static hold beyond 3 seconds. You specify camera movement for every shot.'],
  ['story-producer', 'You are a story and editorial producer who protects the narrative spine: hook, turn, payoff. Every cut must SAY the thing the narration is saying at that instant. You kill any shot that is merely adjacent to the story.'],
  ['video-researcher', 'You are a video researcher with encyclopedic knowledge of real places, tools, and professions. When the track names a craft, you name the exact authentic imagery: the actual NLE timeline an editor cuts on, the actual booth a sound designer works in, the actual formatting of a screenplay page. You destroy generic stand-ins.'],
  ['sound-designer', 'You are a sound and audio design expert. Doctrine: the bed carries the piece; effects are woven on cuts, ducked under the voice, motivated by the screen, never disruptive. You design the full effects map with levels and placement, and you cut any effect that draws attention to itself.'],
  ['motion-designer', 'You are an expert motion graphics designer and animator. You own the "animated" medium: designed stills with legible type and clean composition, animated with image-to-video for dynamic, visually stimulating inserts. You argue for animated inserts wherever design beats live action: text, interfaces, diagrams, stylized transitions.'],
  ['music-composer', 'You are a music composer scoring to picture. You write the score brief mapped to the cut list: genre, tempo, energy curve, builds, ducks, the ending. The score serves the voice and the edit. You assume the bed runs under the whole piece.'],
  ['engagement-genius', 'You are an audience engagement genius who has studied millions of hours of short-form retention. You call out every second a viewer would swipe: static holds, misaligned visuals, pacing sags, weak hooks. You enforce cut ceilings and demand a pattern interrupt every 5-7 seconds. You do not compromise.'],
];

const ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['notes'],
  properties: {
    notes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['topic', 'recommendation'],
        properties: { topic: { type: 'string' }, recommendation: { type: 'string' } },
      },
    },
  },
};

const DEBATE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['positions'],
  properties: {
    positions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['stance', 'statement'],
        properties: {
          stance: { type: 'string', enum: ['challenge', 'concede', 'align', 'non-negotiable'] },
          statement: { type: 'string' },
        },
      },
    },
  },
};

const BEAT_PROPS = {
  start: { type: 'number' },
  seconds: { type: 'number' },
  medium: { type: 'string', enum: ['live', 'animated'] },
  shotPrompt: { type: 'string' },
  stillPrompt: { type: 'string' },
  motionPrompt: { type: 'string' },
  sfxPrompt: { type: 'string' },
  rationale: { type: 'string' },
};

const BRIEF_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['visualSystem', 'hook', 'beats', 'musicPrompt', 'ambiencePrompt', 'grade', 'engagementNotes'],
  properties: {
    visualSystem: { type: 'string' },
    hook: { type: 'string' },
    beats: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['start', 'seconds', 'medium', 'shotPrompt'], properties: BEAT_PROPS },
    },
    musicPrompt: { type: 'string' },
    ambiencePrompt: { type: 'string' },
    grade: {
      type: 'object', additionalProperties: false, required: ['saturation', 'contrast'],
      properties: { saturation: { type: 'number' }, contrast: { type: 'number' } },
    },
    engagementNotes: { type: 'string' },
  },
};

const VETO_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['verdict'],
  properties: {
    verdict: { type: 'string', enum: ['approve', 'object'] },
    objection: { type: 'string' },
    requiredFix: { type: 'string' },
  },
};

function seat(charter) {
  return `${charter}\n\nCRAFT LAW (binding):\n${craftLaw()}\n\n${MANDATE}\n\n${GEN_RULES}`;
}

// Sorted, gap-free tiling of [0, pieceDur], durations clamped per Craft Law,
// boundaries snapped to word ends when given.
export function snapBeats(beats, pieceDur, words = null, { minSec = 2, maxSec = 4.5 } = {}) {
  const ends = (words || []).filter((w) => w.type !== 'spacing').map((w) => w.end);
  const snap = (t) => {
    if (!ends.length) return t;
    let best = t, d = 0.6;
    for (const e of ends) { const dd = Math.abs(e - t); if (dd < d) { d = dd; best = e; } }
    return best;
  };
  const sorted = [...beats].sort((a, b) => a.start - b.start);
  const out = [];
  let cursor = 0;
  for (let i = 0; i < sorted.length; i++) {
    const isLast = i === sorted.length - 1;
    let end = isLast ? pieceDur : snap(Math.min(pieceDur, sorted[i + 1].start));
    if (end <= cursor + 0.5) continue;
    const span = end - cursor;
    const n = Math.max(1, Math.ceil(span / maxSec));
    for (let k = 0; k < n; k++) {
      const s = cursor + (span / n) * k;
      const e = k === n - 1 ? end : cursor + (span / n) * (k + 1);
      if (e - s < (out.length ? minSec * 0.5 : 0.5)) continue;
      out.push({ ...sorted[i], start: +s.toFixed(2), seconds: +(e - s).toFixed(2) });
    }
    cursor = end;
  }
  if (!out.length) return [{ start: 0, seconds: pieceDur, medium: 'live', shotPrompt: beats[0]?.shotPrompt ?? '', sfxPrompt: '' }];
  return out;
}

// The full council process: analyze → debate rounds → director adjudicates →
// panel veto round → director finalizes.
export async function directPiece({ transcriptText, segments, pieceDur, context = '', log = () => {} }) {
  let costUsd = 0;
  const trackBrief =
    `${context ? context + '\n\n' : ''}THE TRACK (${pieceDur.toFixed(1)}s total). Transcript:\n${transcriptText}\n\n` +
    `Provisional cut points:\n${segments.map((s, i) => `[${i}] ${s.start.toFixed(1)}s +${s.seconds.toFixed(1)}s: ${s.text}`).join('\n')}`;

  // Round 0: independent analysis
  log('  council: 7 specialists analyzing in parallel...');
  const analyses = await Promise.all(SPECIALISTS.map(([key, charter]) =>
    call({
      system: seat(charter),
      content: `${trackBrief}\n\nFile your professional notes for this piece (5-10 sharp, specific recommendations).`,
      schema: ANALYSIS_SCHEMA, maxTokens: 3500,
    }).then((r) => ({ key, ...r })),
  ));
  costUsd += analyses.reduce((a, r) => a + r.costUsd, 0);
  const notesOf = Object.fromEntries(analyses.map((a) => [a.key, a.out.notes]));
  let floor = analyses.map((a) => `## ${a.key} (opening notes)\n` + a.out.notes.map((n) => `- ${n.topic}: ${n.recommendation}`).join('\n')).join('\n\n');

  // Debate rounds: each expert answers the whole floor
  for (let round = 1; round <= DEBATE_ROUNDS; round++) {
    log(`  council: debate round ${round}/${DEBATE_ROUNDS}...`);
    const positions = await Promise.all(SPECIALISTS.map(([key, charter]) =>
      call({
        system: seat(charter),
        content:
          `${trackBrief}\n\nTHE FLOOR SO FAR:\n${floor}\n\n` +
          `Debate round ${round}. Respond to your colleagues: CHALLENGE anything that violates Craft Law or your domain expertise, ` +
          `CONCEDE where a colleague is right, ALIGN where positions can merge, and state your NON-NEGOTIABLES. Argue until you get what the piece needs.`,
        schema: DEBATE_SCHEMA, maxTokens: 5000,
      }).then((r) => ({ key, ...r })),
    ));
    costUsd += positions.reduce((a, r) => a + r.costUsd, 0);
    floor += '\n\n' + positions.map((p) => `## ${p.key} (round ${round})\n` + p.out.positions.map((x) => `- [${x.stance}] ${x.statement}`).join('\n')).join('\n\n');
    const heat = positions.flatMap((p) => p.out.positions).filter((x) => x.stance === 'challenge' || x.stance === 'non-negotiable').length;
    log(`  council: round ${round} filed (${heat} challenges/non-negotiables on the floor)`);
    if (heat === 0) break; // consensus reached early
  }

  // Master director adjudicates
  const DIRECTOR_SYSTEM =
    `You are the MASTER DIRECTOR. Your panel has argued; now you adjudicate. Resolve every open challenge explicitly in favor of the piece: ` +
    `retention first, Craft Law always. Produce ONE executable edit decision brief. The beats array must tile [0..${pieceDur.toFixed(1)}s] in order with no gaps. ` +
    `Cut lengths obey Craft Law (2-4s default, nothing static past 3s). Route each beat's medium: "live" for organic footage (write shotPrompt with camera movement), ` +
    `"animated" for text-bearing/stylized/graphic/UI shots (write stillPrompt for the designed image INCLUDING the exact legible text it should carry, and motionPrompt for how it animates). ` +
    `Every beat's visual states literally what the narration says in that window, verb included. sfxPrompt only where the sound designer motivated one, placed on the cut, mixed low, never harsh or high-frequency dominant. ` +
    `ambiencePrompt describes the continuous natural soundscape of the piece's world (per Craft Law rule 10a): what a microphone standing in these scenes would hear, no music, no melodies.\n\nCRAFT LAW (binding):\n${craftLaw()}\n\n${MANDATE}\n\n${GEN_RULES}`;
  log('  council: master director adjudicating...');
  let director = await call({
    system: DIRECTOR_SYSTEM,
    content: `${trackBrief}\n\nTHE FULL DEBATE:\n${floor}\n\nAdjudicate and deliver the brief.`,
    schema: BRIEF_SCHEMA, maxTokens: 10000,
  });
  costUsd += director.costUsd;

  // Veto round: the panel checks the brief before a dollar is spent
  log('  council: panel veto round on the brief...');
  const vetoes = await Promise.all(SPECIALISTS.map(([key, charter]) =>
    call({
      system: seat(charter),
      content:
        `${trackBrief}\n\nTHE DIRECTOR'S BRIEF:\n${JSON.stringify(director.out, null, 1)}\n\n` +
        `Final check before production spend. APPROVE only if this brief satisfies Craft Law and your non-negotiables; otherwise OBJECT with the specific requiredFix.`,
      schema: VETO_SCHEMA, maxTokens: 3000,
    }).then((r) => ({ key, ...r })),
  ));
  costUsd += vetoes.reduce((a, r) => a + r.costUsd, 0);
  const objections = vetoes.filter((v) => v.out.verdict === 'object');
  for (const v of vetoes) log(`  council: ${v.key} ${v.out.verdict}${v.out.verdict === 'object' ? ` (${(v.out.requiredFix || v.out.objection || '').slice(0, 80)})` : ''}`);

  if (objections.length) {
    log(`  council: director revising for ${objections.length} objection(s)...`);
    const revised = await call({
      system: DIRECTOR_SYSTEM,
      content:
        `${trackBrief}\n\nYOUR PRIOR BRIEF:\n${JSON.stringify(director.out, null, 1)}\n\n` +
        `PANEL OBJECTIONS (must be resolved):\n${objections.map((o) => `- ${o.key}: ${o.out.objection ?? ''} FIX: ${o.out.requiredFix ?? ''}`).join('\n')}\n\nDeliver the corrected final brief.`,
      schema: BRIEF_SCHEMA, maxTokens: 10000,
    });
    costUsd += revised.costUsd;
    director = revised;
  }

  return { brief: director.out, analyses: notesOf, debate: floor, vetoes: vetoes.map((v) => ({ key: v.key, ...v.out })), costUsd: +costUsd.toFixed(4) };
}

// Script-mode variant: timing locked, council directs only the generated shots
// plus the piece's sound direction (score + ambience, Craft Law rule 10).
const SHOTS_ONLY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['visualSystem', 'shots', 'musicPrompt', 'ambiencePrompt'],
  properties: {
    visualSystem: { type: 'string' },
    musicPrompt: { type: 'string' },
    ambiencePrompt: { type: 'string' },
    shots: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['beat', 'medium', 'prompt'],
        properties: {
          beat: { type: 'integer' },
          medium: { type: 'string', enum: ['live', 'animated'] },
          prompt: { type: 'string' },
          stillPrompt: { type: 'string' },
          motionPrompt: { type: 'string' },
        },
      },
    },
  },
};

export async function directShots({ fullScript, segments, context = '', log = () => {} }) {
  let costUsd = 0;
  const trackBrief =
    `${context ? context + '\n\n' : ''}FULL PIECE SCRIPT:\n${fullScript}\n\n` +
    `THE SHOTS TO DIRECT (timing locked):\n` +
    segments.map((s) => `[beat ${s.index}] (${s.seconds.toFixed(1)}s) VO: "${s.text}"\n  current prompt: ${s.visual}`).join('\n');

  log('  council: 7 specialists analyzing in parallel...');
  const analyses = await Promise.all(SPECIALISTS.map(([key, charter]) =>
    call({
      system: seat(charter),
      content: `${trackBrief}\n\nFile your notes (5-8 sharp recommendations) for making these shots one cohesive, engaging, Craft-Law-compliant film.`,
      schema: ANALYSIS_SCHEMA, maxTokens: 3000,
    }).then((r) => ({ key, ...r })),
  ));
  costUsd += analyses.reduce((a, r) => a + r.costUsd, 0);
  let floor = analyses.map((a) => `## ${a.key}\n` + a.out.notes.map((n) => `- ${n.topic}: ${n.recommendation}`).join('\n')).join('\n\n');

  log('  council: debate round...');
  const positions = await Promise.all(SPECIALISTS.map(([key, charter]) =>
    call({
      system: seat(charter),
      content: `${trackBrief}\n\nTHE FLOOR:\n${floor}\n\nChallenge, concede, align; state non-negotiables.`,
      schema: DEBATE_SCHEMA, maxTokens: 4000,
    }).then((r) => ({ key, ...r })),
  ));
  costUsd += positions.reduce((a, r) => a + r.costUsd, 0);
  floor += '\n\n' + positions.map((p) => `## ${p.key} (debate)\n` + p.out.positions.map((x) => `- [${x.stance}] ${x.statement}`).join('\n')).join('\n\n');

  log('  council: master director adjudicating shot brief...');
  const director = await call({
    system:
      `You are the MASTER DIRECTOR. Adjudicate the debate into ONE visual system and one directed prompt per listed beat, with visual continuity across them. ` +
      `Route each shot's medium: "live" (prompt with camera movement) or "animated" (stillPrompt with exact legible text + motionPrompt). ` +
      `Each shot must literally show what its VO names. ` +
      `musicPrompt scores the whole piece to the edit's energy curve (instrumental bed under narration). ` +
      `ambiencePrompt describes the continuous natural soundscape of the piece's world (per Craft Law rule 10a): what a microphone standing in these scenes would hear, no music, no melodies.\n\nCRAFT LAW (binding):\n${craftLaw()}\n\n${MANDATE}\n\n${GEN_RULES}`,
    content: `${trackBrief}\n\nTHE FULL DEBATE:\n${floor}\n\nDeliver the shot brief.`,
    schema: SHOTS_ONLY_SCHEMA, maxTokens: 6000,
  });
  costUsd += director.costUsd;
  return {
    visualSystem: director.out.visualSystem, shots: director.out.shots,
    musicPrompt: director.out.musicPrompt, ambiencePrompt: director.out.ambiencePrompt,
    debate: floor, costUsd: +costUsd.toFixed(4),
  };
}

// Review board v2: five frames, Craft Law checks (blank text props, static
// holds, subject literalism, system adherence), medium-switch recommendations.
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['verdict', 'reasons'],
  properties: {
    verdict: { type: 'string', enum: ['accept', 'reroll'] },
    reasons: { type: 'string' },
    revisedPrompt: { type: 'string' },
    switchMedium: { type: 'string', enum: ['live', 'animated'] },
    revisedStillPrompt: { type: 'string' },
    revisedMotionPrompt: { type: 'string' },
  },
};

export async function reviewClip({ clipPath, shotPrompt, visualSystem, beatText, scratchDir }) {
  const dir = join(scratchDir, 'review-frames');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const dur = parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clipPath]).toString()) || 4;
  const times = [0.08, 0.3, 0.5, 0.7, 0.92].map((f) => dur * f);
  const images = times.map((t, i) => {
    const p = join(dir, `f${i}.jpg`);
    run('ffmpeg', ['-y', '-v', 'error', '-ss', t.toFixed(2), '-i', clipPath, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '6', p]);
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(p).toString('base64') } };
  });
  const { out, costUsd } = await call({
    system:
      `You are the council's review board (cinematographer + engagement genius + video researcher). Judge this generated clip against the brief and CRAFT LAW. ` +
      `Hard checks: (1) blank or gibberish text-bearing props = reject; (2) apparent static hold across the five frames = reject unless the VO window is under 3s; ` +
      `(3) the subject must literally BE what the VO names; (4) on the visual system; (5) no garbled anatomy or artifacts. Accept only work you would ship. ` +
      `If the failure is text/UI/design-related, set switchMedium to "animated" and write revisedStillPrompt (with the exact legible text) + revisedMotionPrompt. ` +
      `Otherwise write revisedPrompt for a live retake.\n\nCRAFT LAW:\n${craftLaw()}\n\n${GEN_RULES}`,
    content: [
      { type: 'text', text: `VISUAL SYSTEM: ${visualSystem}\n\nSHOT PROMPT USED: ${shotPrompt}\n\nVOICE OVER THIS CUT: "${beatText}"\n\nFive frames, evenly sampled (motion should be visible as change across them):` },
      ...images,
      { type: 'text', text: 'Verdict?' },
    ],
    schema: REVIEW_SCHEMA, maxTokens: 3500,
  });
  rmSync(dir, { recursive: true, force: true });
  return { ...out, costUsd };
}

// Reflection: turn feedback (human notes or a post-run self-critique) into
// proposed Craft Law additions. Proposals land in the rules file's Proposed
// section; a human promotes them to Ratified. Guarded self-improvement.
const REFLECT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['proposedRules'],
  properties: {
    proposedRules: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'rule'],
        properties: { title: { type: 'string' }, rule: { type: 'string' } },
      },
    },
  },
};

export async function reflect({ feedback, context = '' }) {
  const { out, costUsd } = await call({
    system:
      `You maintain the production Craft Law. Convert the feedback below into standing, checkable rules a creative council can enforce on every future piece. ` +
      `Each rule must be imperative, specific, and verifiable at direction time or review time. Do not restate rules already in the law; extend or sharpen instead.\n\nCURRENT CRAFT LAW:\n${craftLaw()}`,
    content: `${context ? 'CONTEXT: ' + context + '\n\n' : ''}FEEDBACK:\n${feedback}\n\nPropose the rules.`,
    schema: REFLECT_SCHEMA, maxTokens: 2500,
  });
  return { proposedRules: out.proposedRules, costUsd };
}
