// Take E polish assets: nano-banana-2 engraved plates (site STYLE), a proper
// event-synced SFX pack, and two arc-aware score candidates.
// Usage: node --env-file=.env scripts/_take-e-polish-assets.mjs   (~$1.15)
import { generateImage } from '../lib/fal.mjs';
import { soundEffect, music } from '../lib/elevenlabs.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';

const E = 'output/takes/e';
mkdirSync(`${E}/plates`, { recursive: true });
mkdirSync(`${E}/sfx`, { recursive: true });

const STYLE = `Flat 2D technical-diagram illustration, isometric/blueprint drafting register, in the style of a patent illustration or maintenance-manual engraving. Background: solid flat near-black (#111111), completely flat, no gradients, no vignette, no visible texture or noise. Linework: thin uniform-weight bone-cream outlines (#ECE9DE), precise and engineering-clean, consistent stroke width throughout. Exactly one restrained oxblood/rust accent color (#9A4C42) used as a small solid fill on only one or two elements, never more, never as an outline color elsewhere. Strictly no photorealism, no 3D shading, no soft drop shadows, no color gradients, no legible text, words, letters, or numerals anywhere in the frame (at most a few tiny abstract tick-mark engravings standing in for labels, never actual characters). Generous black negative space around the subject; the subject does not fill the whole frame. Mood: restrained, precise, engraved-technical, machine-and-signal.`;

const PLATES = [
  { id: 'voice-profile', subject: 'A human head in clean side profile, speaking; a sound waveform ribbon flows from the mouth into a hexagonal frame at right; the waveform core carries the single small oxblood fill.' },
  { id: 'newsroom-desk', subject: 'An editor\'s desk in isometric view: a broadsheet newspaper plate on a stand, a magnifying glass hovering over one article row, a small card-file drawer open beside it; the magnifier lens carries the single small oxblood fill.' },
  { id: 'portfolio-stack', subject: 'A leaning, toppling stack of glossy presentation cards at left; at right a single upright receipt pinned on a desk spike, taut and orderly; the spike base carries the single small oxblood fill.' },
];

let spend = 0;
for (const p of PLATES) {
  for (const c of [1, 2]) {
    const out = `${E}/plates/${p.id}-c${c}.jpg`;
    const r = await generateImage({ prompt: `${STYLE}\n\nSubject: ${p.subject}`, outPath: out, aspectRatio: '16:9', log: () => {} });
    spend += r.estCostUsd;
    console.log('plate', p.id, 'c' + c, `$${r.estCostUsd.toFixed(3)}`);
  }
}

const SFX = [
  { f: 'tick-roll.mp3',   t: 'rapid soft mechanical counter ticking, like a split-flap ticker rolling, dry, close', s: 1.6 },
  { f: 'stamp.mp3',       t: 'single firm rubber stamp thunk on paper, dry, satisfying, no room', s: 0.7 },
  { f: 'scratch1.mp3',    t: 'quick fine pen scratch drawing a line on paper, single stroke, dry, close', s: 0.8 },
  { f: 'scratch2.mp3',    t: 'short pencil hatching scribble on textured paper, two strokes, dry', s: 0.9 },
  { f: 'printer.mp3',     t: 'small thermal receipt printer feeding paper, brief mechanical whir, close, quiet', s: 1.6 },
  { f: 'pop.mp3',         t: 'single soft wooden tick pop, small object landing on felt, dry', s: 0.5 },
  { f: 'whoosh.mp3',      t: 'very soft low air whoosh transition, subtle, short', s: 0.9 },
  { f: 'clock.mp3',       t: 'single mechanical clock tick, small desk clock, dry, close', s: 0.5 },
  { f: 'slide.mp3',       t: 'a sheet of paper sliding across a wooden desk, short, smooth, dry', s: 0.9 },
];
for (const s of SFX) {
  writeFileSync(`${E}/sfx/${s.f}`, await soundEffect({ text: s.t, durationSeconds: s.s }));
  spend += s.s / 60 * 0.12;
  console.log('sfx', s.f);
}

const BEDS = [
  { f: 'bed-a.mp3', p: 'Minimal documentary underscore with a clear three-act arc for a 78 second explainer: opens with a quiet curious pulse and soft felt piano; gains a steady confident momentum with low strings and a gentle ticking rhythm in the middle act; resolves warm and assured at the end with a single settling piano figure. Understated throughout, low dynamics, no lead melody, generous space for a narrator. Analog tape warmth.' },
  { f: 'bed-b.mp3', p: 'Restrained newsroom underscore for a 78 second explainer: soft mechanical pulse like a wall clock and distant teletype, warm upright piano chords, muted cello swells that build quietly toward the final third, then a clean confident resolve. Very low dynamics under narration, no melody hooks, analog warmth, ends settled.' },
];
for (const b of BEDS) {
  writeFileSync(`${E}/${b.f}`, await music({ prompt: b.p, lengthMs: 77900 }));
  spend += 77.9 / 60 * 0.15;
  console.log('bed', b.f);
}

const notesPath = 'output/takes/spend-log.json';
const log = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : [];
log.push({ when: '2026-07-12', what: 'take E polish assets (6 nano plates, 9 sfx, 2 score candidates)', est_cost_usd: +spend.toFixed(3) });
writeFileSync(notesPath, JSON.stringify(log, null, 2) + '\n');
console.log('polish assets done, ~$' + spend.toFixed(2));
