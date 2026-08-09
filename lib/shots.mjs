// lib/shots.mjs: turn transcript segments into per-beat b-roll shot prompts.
// The quality hinge of cover mode: bad prompts produce generic slop footage.
//
// Primary path: the subscription-first frontier failover adapter, with
// structured output so the shot list is schema-valid. Fallback: a plain
// template when no provider can be used, so cover mode still runs end-to-end.

import { callStructured } from './provider-failover.mjs';

const SHOT_RULES = `You write b-roll shot prompts for a text-to-video model (9:16 vertical, ~6-8s clips).
For each transcript segment, write ONE cinematic shot prompt that visually supports what is being said.
Rules:
- Concrete physical subjects and actions; documentary or cinematic texture; specify light quality.
- NEVER include readable text, words, screens with text, signs, logos, or user interfaces (models render text as gibberish).
- Avoid cliches: no dark editing suites, no glowing monitors, no haze, no hooded hackers, no generic "technology" abstractions.
- Match the segment's tone (problem = tension/clutter; solution = clarity/warmth; proof = precision/detail).
- End each prompt with ", no readable text".`;

function templatePrompt(text) {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 4);
  const subject = words.slice(0, 3).join(' ') || 'the subject';
  return `cinematic documentary b-roll evoking ${subject}, natural light, shallow depth of field, tactile physical detail, no readable text`;
}

// segments: [{ text, seconds }] → { prompts: string[], source: 'provider'|'template', estCostUsd }
// forceTemplate: mock/dry runs must never spend, even with the key present
export async function shotList({ segments, forceTemplate = false }) {
  if (forceTemplate) return { prompts: segments.map((s) => templatePrompt(s.text)), source: 'template', estCostUsd: 0 };

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['shots'],
    properties: {
      shots: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['beat', 'prompt'],
          properties: { beat: { type: 'integer' }, prompt: { type: 'string' } },
        },
      },
    },
  };
  const { out } = await callStructured({
    system: SHOT_RULES,
    content: 'Write one shot prompt per segment (beat is the 0-based index):\n\n' +
      segments.map((s, i) => `[${i}] (${s.seconds.toFixed(1)}s) ${s.text}`).join('\n'),
    schema,
    maxTokens: 2048,
  });
  const prompts = segments.map((s, i) => out.shots?.find((x) => x.beat === i)?.prompt ?? templatePrompt(s.text));
  return { prompts, source: 'provider', estCostUsd: 0 };
}
