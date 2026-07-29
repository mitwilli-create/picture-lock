// Design council: fan the gate-animation redesign + the SYNTHETIC-label problem
// out to premium models role-playing as motion designers / explainer producers,
// collect concrete canvas-executable concepts, then a final adjudicator model
// synthesizes ONE executable workflow. Usage: node scripts/_design-council.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const OUT = 'output/design-council-gates';
mkdirSync(OUT, { recursive: true });
const env = p => existsSync(p) ? readFileSync(p, 'utf8') : '';
const CAREER = env(join(homedir(), 'Documents', 'career-ops', '.env'));
const LOCAL = env('.env');
const get = (src, k) => src.match(new RegExp(`^${k}=([^#\\n]+)`, 'm'))?.[1]?.trim();
const GEMINI = get(CAREER, 'GEMINI_API_KEY');
const OPENAI = get(CAREER, 'OPENAI_API_KEY');
const XAI = get(CAREER, 'XAI_API_KEY');
const ANTHROPIC = get(LOCAL, 'ANTHROPIC_API_KEY') ?? get(CAREER, 'ANTHROPIC_API_KEY');
const OPUS = get(CAREER, 'ANTHROPIC_MODEL_OPUS') ?? 'claude-opus-4-7';
const GPT = get(CAREER, 'OPENAI_MODEL_PRO') ?? 'gpt-5.5-pro';
const GROK = get(CAREER, 'XAI_MODEL_HEAVY') ?? get(CAREER, 'XAI_MODEL_BETA') ?? 'grok-4';

const BRIEF = `You are a senior motion designer and explainer-video producer. Give CONCRETE, executable ideas — this will be built in a 2D HTML canvas mograph engine, no 3D, no external assets.

THE PIECE: an 85-second explainer in an ENGRAVED PATENT-ILLUSTRATION style — thin bone-cream (#ECE9DE) line strokes on near-black (#141210), exactly ONE oxblood/rust accent (#9A4C42), monospace type, deliberate draw-on animation (lines draw on over 12-20 frames), a persistent oxblood "route line" advancing along the bottom. Everything is hand-drawn-feeling vector line art.

THE PROBLEM BEAT (~9 seconds): the narration says the site passed three automated verification gates. We must reveal THREE verdicts, ONE AT A TIME synced to the voice:
  1. "VOICE MATCH" -> PASS
  2. "CODE REVIEW" -> 0 FINDINGS
  3. "RESOLUTION AUDIT" -> 0 FLAGS
Above them sit two big counters: "53 { SECONDS OF FILM }" = "$14.20 { ALL IN }".
Then a final big oxblood stamp "PUBLIC · DATED · ZERO FLAGS" slams over the whole thing.

WHAT FAILED: we tried literal "doors/gates opening" (double doors swinging to reveal each verdict). It reads as stiff boxes, the motion is clunky, it is not visually dynamic or premium.

TASK A — propose 3 DISTINCT alternative concepts for revealing these three verdicts. For EACH: name it, describe the staging (what's on screen), and describe the MOTION frame-by-frame (entrance, the reveal moment, the settle) in terms a canvas engine can execute — draw-on strokes, translate/scale/rotate, easing, oxblood accent usage, timing per verdict. Rank them premium-to-simple. Favor motion that feels alive and smooth (checkmarks drawing on, seals stamping, meters filling, a ledger/checklist ticking, gauges sweeping, etc.) over literal object metaphors.

TASK B — separately, a label "SYNTHETIC" (describing the AI-cloned voice) is getting LOST against a busy oxblood voice-waveform illustration behind it. Give 2 concrete fixes to make it read without fighting the art (placement, a solid backing plate, a lockup, timing, etc.).

Be specific and buildable. No fluff.`;

async function retry(name, fn, tries = 3) {
  for (let a = 1; ; a++) { try { return await fn(); }
    catch (e) { if (a >= tries) throw e; console.log(`${name} try ${a}: ${String(e).slice(0,160)}`); await new Promise(r=>setTimeout(r,15000*a)); } }
}
const gemini = () => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent', {
  method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI}, signal:AbortSignal.timeout(300000),
  body:JSON.stringify({contents:[{parts:[{text:BRIEF}]}]})}).then(async r=>{ if(!r.ok) throw new Error('gemini '+r.status+await r.text()); const j=await r.json(); return j.candidates[0].content.parts.map(p=>p.text||'').join(''); });
const gpt = () => fetch('https://api.openai.com/v1/responses', {
  method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${OPENAI}`}, signal:AbortSignal.timeout(300000),
  body:JSON.stringify({model:GPT,input:[{role:'user',content:[{type:'input_text',text:BRIEF}]}]})}).then(async r=>{ if(!r.ok) throw new Error('gpt '+r.status+await r.text()); const j=await r.json(); return j.output_text ?? j.output.flatMap(o=>o.content??[]).filter(c=>c.type==='output_text').map(c=>c.text).join(''); });
const opus = () => fetch('https://api.anthropic.com/v1/messages', {
  method:'POST', headers:{'content-type':'application/json','x-api-key':ANTHROPIC,'anthropic-version':'2023-06-01'}, signal:AbortSignal.timeout(300000),
  body:JSON.stringify({model:OPUS,max_tokens:4000,messages:[{role:'user',content:BRIEF}]})}).then(async r=>{ if(!r.ok) throw new Error('opus '+r.status+await r.text()); const j=await r.json(); return j.content.filter(b=>b.type==='text').map(b=>b.text).join(''); });
const grok = () => fetch('https://api.x.ai/v1/chat/completions', {
  method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${XAI}`}, signal:AbortSignal.timeout(300000),
  body:JSON.stringify({model:GROK,messages:[{role:'user',content:BRIEF}]})}).then(async r=>{ if(!r.ok) throw new Error('grok '+r.status+await r.text()); const j=await r.json(); return j.choices[0].message.content; });

const panel = [['gemini',gemini],['gpt5',gpt],['opus',opus]]; // grok chat endpoint deprecated (see .env)
const results = await Promise.allSettled(panel.map(async ([n,f])=>{ const t=await retry(n,f); writeFileSync(join(OUT,`${n}.md`),`# ${n}\n\n${t}\n`); console.log(`OK ${n} (${t.length}b)`); return {n,t}; }));
const ok = results.filter(r=>r.status==='fulfilled').map(r=>r.value);
console.log(`\n${ok.length}/4 responded`);

// adjudicate with Opus: synthesize ONE executable concept
if (ok.length) {
  const combined = ok.map(o=>`### ${o.n}\n${o.t}`).join('\n\n---\n\n');
  const ADJ = `You are the adjudicator. Below are ${ok.length} motion-designer proposals for the same brief (revealing three verification verdicts in an engraved 2D-canvas explainer, and fixing a lost "SYNTHETIC" label). Read them all. Then output a SINGLE, FINAL, BUILDABLE spec:
1. Pick or synthesize the BEST verdict-reveal concept (name it). Justify in 2 lines why it beats the others.
2. Give a precise build spec: staging + per-verdict motion (entrance/reveal/settle), timing offsets for the 3 beats, easing, oxblood usage — concrete enough for an engineer to implement in a canvas engine that already has: drawPoly(pts,t) [draws a polyline on over t=0..1], rectOn, label(), stamp() [solid oxblood option], ss()/over() easers, an oxblood route-line.
3. Give the final SYNTHETIC-label fix (one concrete approach).
Keep it tight and implementation-focused.

PROPOSALS:\n\n${combined}`;
  const final = await retry('adjudicator', ()=>fetch('https://api.anthropic.com/v1/messages',{
    method:'POST', headers:{'content-type':'application/json','x-api-key':ANTHROPIC,'anthropic-version':'2023-06-01'}, signal:AbortSignal.timeout(300000),
    body:JSON.stringify({model:OPUS,max_tokens:3000,messages:[{role:'user',content:ADJ}]})}).then(async r=>{ if(!r.ok) throw new Error('adj '+r.status+await r.text()); const j=await r.json(); return j.content.filter(b=>b.type==='text').map(b=>b.text).join(''); }));
  writeFileSync(join(OUT,'ADJUDICATED.md'),`# Adjudicated gate-animation spec\n\n${final}\n`);
  console.log('\n===== ADJUDICATED =====\n'+final);
}
const log = JSON.parse(readFileSync('output/takes/spend-log.json','utf8'));
log.push({when:'2026-07-14',what:`design council (gates redesign) ${ok.length} models + adjudicator`,est_cost_usd:+(ok.length*0.05+0.05).toFixed(2)});
writeFileSync('output/takes/spend-log.json',JSON.stringify(log,null,2)+'\n');
console.log('done');
