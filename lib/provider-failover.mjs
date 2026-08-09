import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 300_000;
const MAX_BUFFER = 8 * 1024 * 1024;

const CANDIDATES = [
  ...['fable', 'opus', 'sonnet'].map((model) => ({
    provider: 'claude-cli', model, command: 'claude',
    args: (prompt) => ['--model', model, '-p', prompt],
  })),
  ...['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'].map((model) => ({
    provider: 'codex-cli', model, command: 'codex',
    args: (prompt) => ['exec', '--model', model, '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', prompt],
  })),
  {
    provider: 'antigravity-cli', model: 'gemini-3.1-pro', command: 'agy',
    args: (prompt) => ['--output-format', 'text', '--model', 'gemini-3.1-pro', '--effort', 'high', '--sandbox', '--print', prompt],
  },
  {
    provider: 'grok-cli', model: 'grok-4', command: 'grok',
    args: (prompt) => ['--single', prompt, '--output-format', 'plain', '--model', 'grok-4', '--no-plan', '--no-subagents'],
  },
];

function envWithoutMeteredKeys() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.OPENAI_API_KEY;
  delete env.XAI_API_KEY;
  return env;
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* provider preamble */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('provider returned malformed JSON');
}

function retryable(error) {
  const text = String(error?.message ?? error).toLowerCase();
  return /weekly limit|plan limit|quota|rate.?limit|429|unauthori[sz]ed|credential|enoent|not found|econn|timeout|temporar|unavailable|malformed|invalid json|empty|does not support video/.test(text);
}

export function providerFailoverOrder() {
  return CANDIDATES.map((candidate) => `${candidate.provider}:${candidate.model}`);
}

export async function callText({ system = '', content, maxTokens = 4000, preferredProvider }) {
  const prompt = `${system}\n\n${content}`.trim();
  const attempts = [];
  const start = preferredProvider ? CANDIDATES.findIndex((candidate) => candidate.provider === preferredProvider) : 0;
  for (const candidate of CANDIDATES.slice(start >= 0 ? start : 0)) {
    try {
      const result = await execFileAsync(candidate.command, candidate.args(prompt), {
        env: envWithoutMeteredKeys(), timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER,
      });
      const out = String(result.stdout ?? '').trim();
      if (!out) throw new Error(`provider returned empty response: ${String(result.stderr ?? '').slice(0, 180)}`);
      attempts.push({ provider: candidate.provider, model: candidate.model, outcome: 'success' });
      return { text: out, costUsd: 0, provider: candidate.provider, model: candidate.model, attempts, maxTokens };
    } catch (error) {
      const detail = String(error?.message ?? error).slice(0, 240);
      attempts.push({ provider: candidate.provider, model: candidate.model, outcome: 'failed', failure: detail });
      if (!retryable(error)) throw Object.assign(new Error(`provider ${candidate.provider}:${candidate.model} failed; safe failover stopped`), { attempts });
    }
  }
  throw Object.assign(new Error('all approved subscription providers exhausted'), { attempts });
}

export async function callStructured({ system, content, schema, maxTokens = 4000 }) {
  const prompt = `${system}\n\nOUTPUT SCHEMA:\n${JSON.stringify(schema)}\n\nReturn strict JSON only. No markdown fence, preamble, or commentary.\n\n${content}`;
  const attempts = [];
  for (const candidate of CANDIDATES) {
    try {
      const result = await execFileAsync(candidate.command, candidate.args(prompt), {
        env: envWithoutMeteredKeys(), timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER,
      });
      const out = parseJson(`${result.stdout}\n${result.stderr}`);
      const text = JSON.stringify(out);
      if (!text || text === 'null') throw new Error('provider returned empty response');
      attempts.push({ provider: candidate.provider, model: candidate.model, outcome: 'success' });
      return { out, costUsd: 0, provider: candidate.provider, model: candidate.model, attempts, maxTokens };
    } catch (error) {
      const detail = String(error?.message ?? error).slice(0, 240);
      attempts.push({ provider: candidate.provider, model: candidate.model, outcome: 'failed', failure: detail });
      if (!retryable(error)) throw Object.assign(new Error(`provider ${candidate.provider}:${candidate.model} failed; safe failover stopped`), { attempts });
    }
  }
  throw Object.assign(new Error('all approved subscription providers exhausted'), { attempts });
}

function openAiContent(content) {
  return content.map((block) => {
    if (block.type === 'text') return { type: 'input_text', text: block.text };
    if (block.type === 'video') throw new Error('provider does not support video input');
    return { type: 'input_image', image_url: `data:${block.source.media_type};base64,${block.source.data}` };
  });
}

function geminiParts(content) {
  return content.map((block) => block.type === 'text'
    ? { text: block.text }
    : { inline_data: { mime_type: block.source.media_type, data: block.source.data } });
}

export async function callMultimodalStructured({ system, content, schema, maxTokens = 4000 }) {
  const attempts = [];
  const providers = [
    {
      provider: 'openai-api', key: process.env.OPENAI_API_KEY,
      run: async () => {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: process.env.CREATIVE_OPENAI_MODEL ?? 'gpt-5.5', input: [{ role: 'system', content: [{ type: 'input_text', text: system }] }, { role: 'user', content: openAiContent(content) }], max_output_tokens: maxTokens, text: { format: { type: 'json_schema', name: 'creative_output', strict: true, schema } } }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(`openai ${response.status}`), { status: response.status });
        return body.output_text || body.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text || '';
      },
    },
    {
      provider: 'google-api', key: process.env.GEMINI_API_KEY,
      run: async () => {
        const model = process.env.CREATIVE_GEMINI_MODEL ?? 'gemini-3.1-pro';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: geminiParts(content) }], generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json', responseSchema: schema } }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(`gemini ${response.status}`), { status: response.status });
        return body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
      },
    },
    {
      provider: 'xai-api', key: process.env.XAI_API_KEY,
      run: async () => {
        if (content.some((block) => block.type === 'video')) throw new Error('provider does not support video input');
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { authorization: `Bearer ${process.env.XAI_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: process.env.CREATIVE_GROK_MODEL ?? 'grok-4', messages: [{ role: 'system', content: system }, { role: 'user', content: content.map((block) => block.type === 'text' ? { type: 'text', text: block.text } : { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } }) }], max_tokens: maxTokens, response_format: { type: 'json_object' } }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(`grok ${response.status}`), { status: response.status });
        return body.choices?.[0]?.message?.content || '';
      },
    },
  ];
  for (const candidate of providers) {
    if (!candidate.key) continue;
    try {
      const out = parseJson(await candidate.run());
      attempts.push({ provider: candidate.provider, outcome: 'success' });
      return { out, costUsd: 0, provider: candidate.provider, attempts };
    } catch (error) {
      const detail = String(error?.message ?? error).slice(0, 240);
      attempts.push({ provider: candidate.provider, outcome: 'failed', failure: detail });
      const status = Number(error?.status || 0);
      if (status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429 && !retryable(error)) throw Object.assign(new Error(`multimodal provider ${candidate.provider} failed; failover stopped`), { attempts });
    }
  }
  throw Object.assign(new Error('all configured multimodal providers exhausted'), { attempts });
}

export async function callMultimodalText({ system = '', content, maxTokens = 4000, preferredProvider }) {
  const attempts = [];
  const providers = [
    {
      provider: 'openai-api', key: process.env.OPENAI_API_KEY,
      run: async () => {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: process.env.CREATIVE_OPENAI_MODEL ?? 'gpt-5.5', input: [{ role: 'system', content: [{ type: 'input_text', text: system }] }, { role: 'user', content: openAiContent(content) }], max_output_tokens: maxTokens }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(`openai ${response.status}`), { status: response.status });
        return body.output_text || body.output?.flatMap((item) => item.content || []).filter((item) => item.type === 'output_text').map((item) => item.text).join('') || '';
      },
    },
    {
      provider: 'google-api', key: process.env.GEMINI_API_KEY,
      run: async () => {
        const model = process.env.CREATIVE_GEMINI_MODEL ?? 'gemini-3.1-pro';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: geminiParts(content) }], generationConfig: { maxOutputTokens: maxTokens } }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(`gemini ${response.status}`), { status: response.status });
        return body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
      },
    },
    {
      provider: 'xai-api', key: process.env.XAI_API_KEY,
      run: async () => {
        if (content.some((block) => block.type === 'video')) throw new Error('provider does not support video input');
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { authorization: `Bearer ${process.env.XAI_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: process.env.CREATIVE_GROK_MODEL ?? 'grok-4', messages: [{ role: 'system', content: system }, { role: 'user', content: content.map((block) => block.type === 'text' ? { type: 'text', text: block.text } : { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } }) }], max_tokens: maxTokens }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(`grok ${response.status}`), { status: response.status });
        return body.choices?.[0]?.message?.content || '';
      },
    },
  ];
  const start = preferredProvider ? providers.findIndex((candidate) => candidate.provider === preferredProvider) : 0;
  for (const candidate of providers.slice(start >= 0 ? start : 0)) {
    if (!candidate.key) continue;
    try {
      const text = String(await candidate.run()).trim();
      if (!text) throw new Error(`${candidate.provider} returned empty response`);
      attempts.push({ provider: candidate.provider, outcome: 'success' });
      return { text, costUsd: 0, provider: candidate.provider, attempts };
    } catch (error) {
      const detail = String(error?.message ?? error).slice(0, 240);
      attempts.push({ provider: candidate.provider, outcome: 'failed', failure: detail });
      const status = Number(error?.status || 0);
      if (status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429 && !retryable(error)) throw Object.assign(new Error(`multimodal provider ${candidate.provider} failed; failover stopped`), { attempts });
    }
  }
  throw Object.assign(new Error('all configured multimodal providers exhausted'), { attempts });
}
