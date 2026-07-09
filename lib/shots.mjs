// lib/shots.mjs: turn transcript segments into per-beat b-roll shot prompts.
// The quality hinge of cover mode: bad prompts produce generic slop footage.
//
// Primary path: Claude Haiku via the Anthropic API (bare fetch, matching the
// repo's zero-dep adapter style), with structured output so the shot list is
// schema-valid. Fallback: a plain template when ANTHROPIC_API_KEY is absent,
// so cover mode still runs end-to-end without the key (flatter prompts).

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';

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

// segments: [{ text, seconds }] → { prompts: string[], source: 'haiku'|'template', estCostUsd }
export async function shotList({ segments }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { prompts: segments.map((s) => templatePrompt(s.text)), source: 'template', estCostUsd: 0 };

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
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SHOT_RULES,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{
        role: 'user',
        content: 'Write one shot prompt per segment (beat is the 0-based index):\n\n' +
          segments.map((s, i) => `[${i}] (${s.seconds.toFixed(1)}s) ${s.text}`).join('\n'),
      }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`shots (${MODEL}) → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const msg = await res.json();
  if (msg.stop_reason === 'refusal') throw new Error('shots: model refused; fall back to --shots-template');
  const out = JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{}');
  const prompts = segments.map((s, i) => out.shots?.find((x) => x.beat === i)?.prompt ?? templatePrompt(s.text));
  const est = ((msg.usage?.input_tokens ?? 0) / 1e6) * 1 + ((msg.usage?.output_tokens ?? 0) / 1e6) * 5;
  return { prompts, source: 'haiku', estCostUsd: +est.toFixed(4) };
}
