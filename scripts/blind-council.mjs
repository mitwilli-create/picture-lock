// Blind council review: N zero-context expert watchers (Gemini video) + text-model
// blind reads (Opus, GPT-5.5) on a frame contact sheet + transcript. Extension of
// blind-review.mjs. Usage: node scripts/blind-council.mjs <video> <srt> <outdir>
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, basename } from 'path';
import { homedir } from 'os';

const VIDEO = process.argv[2];
const SRT = process.argv[3];
const OUT = process.argv[4] ?? 'output/blind-council-v4';
mkdirSync(OUT, { recursive: true });

const env = p => existsSync(p) ? readFileSync(p, 'utf8') : '';
const CAREER = env(join(homedir(), 'Documents', 'career-ops', '.env'));
const LOCAL = env('.env');
const get = (src, k) => src.match(new RegExp(`^${k}=([^#\\n]+)`, 'm'))?.[1]?.trim();
const GEMINI_KEY = get(CAREER, 'GEMINI_API_KEY');
const OPENAI_KEY = get(CAREER, 'OPENAI_API_KEY');
const ANTHROPIC_KEY = get(LOCAL, 'ANTHROPIC_API_KEY') ?? get(CAREER, 'ANTHROPIC_API_KEY');
const OPUS = get(CAREER, 'ANTHROPIC_MODEL_OPUS') ?? 'claude-opus-4-7';
const GPT = get(CAREER, 'OPENAI_MODEL_PRO') ?? 'gpt-5.5-pro';
if (!GEMINI_KEY || !OPENAI_KEY || !ANTHROPIC_KEY) throw new Error('missing keys');

// ---------- assets ----------
const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', VIDEO], { encoding: 'utf8' }));
const proxy = join(OUT, '_proxy.mp4');
if (!existsSync(proxy)) execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VIDEO, '-vf', 'scale=-2:480', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '96k', proxy]);
let vb64 = readFileSync(proxy).toString('base64');
if (vb64.length > 26e6) { // ~19.5MB binary; drop to 360p
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VIDEO, '-vf', 'scale=-2:360', '-crf', '32', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '80k', proxy]);
  vb64 = readFileSync(proxy).toString('base64');
}
console.log(`proxy ${(vb64.length * 0.75 / 1e6).toFixed(1)}MB, video ${dur.toFixed(1)}s`);

// contact sheets: frame every 3s, 640x360, timestamped, tiled 3x2
const sheetDir = join(OUT, '_sheets');
mkdirSync(sheetDir, { recursive: true });
const times = []; for (let t = 1; t < dur; t += 3) times.push(+t.toFixed(1));
if (!readdirSync(sheetDir).some(f => f.startsWith('sheet-'))) {
  times.forEach((t, i) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', VIDEO, '-frames:v', '1',
    '-vf', 'scale=640:360',
    join(sheetDir, `f-${String(i).padStart(2, '0')}.png`)]));
  const frames = readdirSync(sheetDir).filter(f => f.startsWith('f-')).sort();
  for (let s = 0; s * 6 < frames.length; s++) {
    const six = frames.slice(s * 6, s * 6 + 6);
    while (six.length < 6) six.push(six.at(-1)); // pad tile grid
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...six.flatMap(f => ['-i', join(sheetDir, f)]),
      '-filter_complex', `${six.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0[v]`,
      '-map', '[v]', '-q:v', '4', join(sheetDir, `sheet-${s}.jpg`)]);
  }
}
const sheets = readdirSync(sheetDir).filter(f => f.startsWith('sheet-')).sort()
  .map(f => readFileSync(join(sheetDir, f)).toString('base64'));
const transcript = readFileSync(SRT, 'utf8');
// timestamp legend: sheets are 3x2 grids in reading order, one frame per ~3s
const legend = sheets.map((_, s) => {
  const cells = times.slice(s * 6, s * 6 + 6);
  return `Image ${s + 1}: ${cells.map((t, i) => `cell ${i + 1} (${['top-left', 'top-mid', 'top-right', 'bottom-left', 'bottom-mid', 'bottom-right'][i]}) = ${t}s`).join(', ')}`;
}).join('\n');
console.log(`${sheets.length} contact sheets, transcript ${transcript.length}b`);

// ---------- prompts ----------
const ASK = `List every issue you see as: [timestamp] issue -> concrete fix (one line each, most important first). Then give a 0-10 score and a one-line verdict. Be harsh and specific; you have no stake in this piece and no other context.`;
const LENSES = {
  'film-editor': `You are a veteran film and commercial editor reviewing a short video you know nothing about. Judge cutting rhythm, shot selection, pacing, transitions, structure, and whether every cut earns its place. ${ASK}`,
  'motion-designer': `You are a senior motion designer reviewing a short video you know nothing about. Judge the animation craft: easing, timing, composition, typography, legibility, negative space, visual hierarchy, whether motion feels intentional and premium or cheap. ${ASK}`,
  'sound-mixer': `You are a veteran re-recording mixer and sound designer reviewing a short video you know nothing about. Judge ONLY the soundtrack: mix hierarchy, music placement and energy, natural sound, sync of impacts to picture, transitions across cuts, artifacts, broadcast loudness and dynamics. ${ASK}`,
  'retention-analyst': `You are an audience retention analyst who has studied thousands of social and web videos, reviewing one you know nothing about. Judge second-by-second: where attention is grabbed, where viewers would drop off, where information is too dense or too slow, whether the open earns the next 10 seconds, whether the ending converts. ${ASK}`,
  'lens-free': `Watch this short video with fresh eyes. You know nothing about it. React honestly: what works, what confused you, what bored you, what you'd fix. No professional lens, just a sharp viewer's gut reaction with timestamps. ${ASK}`,
};
const TEXT_PROMPT = `You are reviewing a short video you know nothing about, from limited evidence only: (1) contact-sheet images, each a 3x2 grid of frames sampled every ~3 seconds (timestamp legend below), (2) the caption transcript with timings. You cannot hear it or see motion, so judge structure, visual design, information density, story logic, copy, and legibility of on-screen material. ${ASK}\n\nTIMESTAMP LEGEND:\n{LEGEND}\n\nCAPTION TRANSCRIPT:\n`;

// ---------- callers (retry w/ backoff) ----------
async function retry(name, fn, tries = 3) {
  for (let a = 1; ; a++) {
    try { return await fn(); }
    catch (e) { if (a >= tries) throw e; console.log(`${name} attempt ${a} failed: ${String(e).slice(0, 200)} — backing off`); await new Promise(r => setTimeout(r, 20_000 * a)); }
  }
}
async function gemini(lens, prompt) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    signal: AbortSignal.timeout(600_000),
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: 'video/mp4', data: vb64 } }, { text: prompt }] }] }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const t = j.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('');
  if (!t) throw new Error('gemini empty: ' + JSON.stringify(j).slice(0, 300));
  return t;
}
async function opus() {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(600_000),
    body: JSON.stringify({
      model: OPUS, max_tokens: 16000,
      messages: [{ role: 'user', content: [
        ...sheets.map(d => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d } })),
        { type: 'text', text: TEXT_PROMPT.replace('{LEGEND}', legend) + transcript },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`opus ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const t = j.content?.filter(b => b.type === 'text').map(b => b.text).join('');
  if (!t) throw new Error('opus empty');
  return t;
}
async function gpt() {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${OPENAI_KEY}` },
    signal: AbortSignal.timeout(600_000),
    body: JSON.stringify({
      model: GPT,
      input: [{ role: 'user', content: [
        ...sheets.map(d => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${d}` })),
        { type: 'input_text', text: TEXT_PROMPT.replace('{LEGEND}', legend) + transcript },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`gpt ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const t = j.output_text ?? j.output?.flatMap(o => o.content ?? []).filter(c => c.type === 'output_text').map(c => c.text).join('');
  if (!t) throw new Error('gpt empty: ' + JSON.stringify(j).slice(0, 300));
  return t;
}

// ---------- run all in parallel ----------
const jobs = [
  ...Object.entries(LENSES).map(([k, p]) => [`gemini-${k}`, () => gemini(k, p)]),
  [`text-opus`, opus],
  [`text-gpt5`, gpt],
];
const results = await Promise.allSettled(jobs.map(async ([name, fn]) => {
  const text = await retry(name, fn);
  writeFileSync(join(OUT, `${name}.md`), `# Blind review: ${name} on ${basename(VIDEO)}\n\n${text}\n`);
  console.log(`✓ ${name} done (${text.length}b)`);
  return { name, text };
}));
const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value);
const bad = results.filter(r => r.status === 'rejected').map((r, i) => `${jobs[results.indexOf(r)][0]}: ${r.reason}`);
writeFileSync(join(OUT, '_summary.json'), JSON.stringify({ video: VIDEO, when: new Date().toISOString(), ok: ok.map(o => o.name), failed: bad }, null, 2));

// spend log (estimates)
const logPath = 'output/takes/spend-log.json';
const log = JSON.parse(readFileSync(logPath, 'utf8'));
log.push({ when: new Date().toISOString().slice(0, 10), what: `blind council v4 (${ok.length}/7 reviewers: 5x gemini video, opus, gpt5.5 contact-sheet)`, est_cost_usd: +(ok.filter(o => o.name.startsWith('gemini')).length * 0.20 + ok.filter(o => o.name.startsWith('text')).length * 0.40).toFixed(2) });
writeFileSync(logPath, JSON.stringify(log, null, 2));
console.log(`\nDONE: ${ok.length}/7 succeeded${bad.length ? '; FAILED: ' + bad.join(' | ') : ''}`);
