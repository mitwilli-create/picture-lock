// Career-ops demo compositor — v3 (banner-system + motion-smoothness rebuild).
// Round-2 notes (Mitchell 2026-07-14): (1) unify banners to thestorytellermitch.com
// aesthetic — one solid site-oxblood system, real fonts (Archivo/JetBrains Mono),
// bone text, no red-vs-black inconsistency; (2) zooms/pans "much much smoother" —
// ONE continuous eased move per beat (no per-keyframe stop-go) over a 1.5×
// supersampled frame with per-frame scale (kills zoompan integer stutter).
// Usage: node scripts/_careerops-compose.mjs [--plates-only|--beats-only|--mix-only]
import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const OUT = 'output/career-ops-demo';
const V = `${OUT}/v3`;
const TMP = '.cache/careerops-v3';
mkdirSync(V, { recursive: true });
mkdirSync(`${OUT}/plates`, { recursive: true });
mkdirSync(TMP, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

const { beats } = JSON.parse(readFileSync(`${OUT}/beats.json`, 'utf8'));
const events = JSON.parse(readFileSync(`${OUT}/capture/events.json`, 'utf8'));
const words = JSON.parse(readFileSync(`${OUT}/narration-words.json`, 'utf8')).words.filter(w => w.type === 'word');
const beat = id => beats.find(b => b.id === id);
const norm = t => t.toLowerCase().replace(/[^a-z0-9']/g, '');
const wordAt = (txt, after = 0, occ = 1) => {
  let n = 0;
  for (const w of words) if (w.start >= after && norm(w.text) === norm(txt) && ++n === occ) return w.start;
  throw new Error(`word not found: ${txt} after ${after}`);
};
const LEAD = 0.45;

// ---------- SITE DESIGN TOKENS (extracted from shared/theme.css) ----------
const SITE = {
  bg: '#0a0a0b', surface: '#141416', bone: '#ece8e1', boneSoft: '#c7c2b9',
  blood: '#8a3a33', bloodSoft: '#b1554c', bloodDeep: '#5c2722',
  fontDir: '/Users/mitchellwilliams/Documents/storytellermitch-site/assets/fonts',
};

// ---------- PLATE DEFINITIONS (15; times FILM-absolute) ----------
const P = (id, kind, html, at, pos, w) => ({ id, kind, html, at: +(at - LEAD).toFixed(2), pos, w });
const b2s = beat('board').start, b3s = beat('observe').start, b4s = beat('incident').start, b5s = beat('close').start;
const PLATES = [
  P('fork',    'primary',  'production fork &middot; <b>santifer/career-ops</b>', wordAt('forked'), [96, 812], 640),
  P('hero',    'hero',     '<b>52 agents</b> &middot; <b>1,150+</b> scored reports &middot; <b>1</b> operator', wordAt('52'), [900, 110], 760),
  P('live',    'primary',  'runs the <b>actual</b> search &middot; daily', wordAt('actual'), [96, 812], 520),
  P('demo',    'primary',  'dataset: <b>demo</b> &middot; every company invented', wordAt('demo'), [96, 812], 640),
  P('real',    'primary',  '<b>everything else is real</b>', wordAt('else'), [96, 812], 460),
  P('council', 'primary',  'triage &rarr; <b>scoring council</b> &rarr; adjudication', wordAt('triage', b2s), [96, 812], 660),
  P('cited',   'primary',  'computed per role &middot; <b>source cited</b>', wordAt('computed', b2s), [96, 812], 580),
  P('reports', 'primary',  '<b>1,150+</b> role reports', wordAt('1100', b2s), [96, 812], 420),
  P('telem',   'primary',  'per-run <b>cost</b> &middot; <b>timing</b>', wordAt('cost', b3s), [96, 812], 460),
  P('guard',   'primary',  '<b>regression guard</b> &middot; silent-break detection', wordAt('regression', b3s), [96, 812], 680),
  P('health',  'primary',  '<b>health agent</b> &middot; OAuth &middot; quotas &middot; schedules', wordAt('health', b3s), [96, 812], 720),
  P('deprec',  'primary',  'the incident: <b>a deprecated parameter</b>', wordAt('deprecated', b4s), [96, 812], 640),
  P('caught',  'primary',  '<b>caught by telemetry</b>, not luck', wordAt('caught', b4s), [96, 812], 560),
  P('errors',  'primary',  'that morning: <b>100% errors</b> &middot; zero progress', wordAt('100%', b4s), [96, 812], 700),
  P('synth',   'primary',  'voice: <b>synthetic</b> &middot; cloned with consent', wordAt('synthetic', b5s), [96, 812], 620),
];
const CLICK_AT = wordAt('caught', b4s);
const RAIL_AT = +(beat('close').end - 8).toFixed(2);
for (let i = 0; i < PLATES.length; i++) {
  const p = PLATES[i], next = PLATES[i + 1];
  const myBeat = beats.find(b => p.at >= b.start && p.at < b.end);
  p.out = (next && next.at < myBeat.end) ? next.at : +(myBeat.end - 0.3).toFixed(2);
  if (p.id === 'synth') p.out = RAIL_AT;
}

// ---------- PLATE RENDER (site aesthetic) ----------
async function renderPlates() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1700, height: 400 }, deviceScaleFactor: 2 });
  const faces = `
    @font-face{font-family:'Archivo';font-weight:400 900;src:url('file://${SITE.fontDir}/archivo-var-latin.woff2') format('woff2');}
    @font-face{font-family:'JetBrains Mono';font-weight:400 700;src:url('file://${SITE.fontDir}/jetbrains-mono-var-latin.woff2') format('woff2');}`;
  // Unified banner: solid site-oxblood cell, bone text, Archivo, hairline deep-oxblood
  // edge for figure-ground crispness (legibility comes from the solid fill, not the stroke).
  const plateHtml = (p) => `<!doctype html><meta charset="utf-8"><style>${faces}
    body{margin:0;background:transparent}
    .plate{display:inline-block;font-family:'Archivo',sans-serif;color:${SITE.bone};
      background:${SITE.blood};border:1px solid ${SITE.bloodDeep};
      padding:${p.kind === 'hero' ? '22px 34px' : '15px 24px'};border-radius:3px;
      font-weight:${p.kind === 'hero' ? 900 : 700};letter-spacing:-0.01em;
      font-size:${p.kind === 'hero' ? '44px' : '30px'};line-height:1.05}
    .plate b{font-weight:${p.kind === 'hero' ? 900 : 800};color:#fff}</style>
    <span class="plate" id="p">${p.html}</span>`;
  for (const p of PLATES) {
    await page.setContent(plateHtml(p));
    await page.waitForTimeout(120);
    await page.locator('#p').screenshot({ path: `${OUT}/plates/${p.id}.png`, omitBackground: true });
  }
  // Receipt rail — site card language: near-black surface, oxblood left border, mono, bone.
  const renderId = `pl-${Date.now().toString(36)}`;
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${faces}
    body{margin:0;background:transparent}
    .rail{width:560px;font-family:'JetBrains Mono',monospace;background:${SITE.bg};
      border:1px solid rgba(236,232,225,0.12);border-left:4px solid ${SITE.blood};
      color:${SITE.boneSoft};padding:26px 30px;border-radius:3px;font-size:22px;line-height:1.85;font-weight:400}
    .rail h4{margin:0 0 12px;font-size:15px;letter-spacing:.2em;color:${SITE.bloodSoft};font-weight:700}
    .rail b{font-weight:700;color:${SITE.bone}}</style>
    <div class="rail" id="p"><h4>RENDER RECEIPT</h4>
      voice: <b>cloned narration</b><br>capture: <b>Playwright</b><br>overlays: <b>canvas plates</b><br>
      composite: <b>ffmpeg</b><br>dataset: <b>disclosed demo</b><br>shots: <b>5</b> &middot; plates: <b>15</b><br>
      render: <b>${renderId}</b></div>`);
  await page.waitForTimeout(120);
  await page.locator('#p').screenshot({ path: `${OUT}/plates/rail.png`, omitBackground: true });
  // cursor + ripple (bone-colored to match)
  await page.setContent(`<!doctype html><style>body{margin:0;background:transparent}</style>
    <svg id="p" width="56" height="72" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 4 L8 56 L22 44 L30 66 L38 62 L30 42 L48 42 Z" fill="${SITE.bone}" stroke="#000" stroke-width="3"/></svg>`);
  await page.locator('#p').screenshot({ path: `${OUT}/plates/cursor.png`, omitBackground: true });
  await page.setContent(`<!doctype html><style>body{margin:0;background:transparent}</style>
    <svg id="p" width="120" height="120"><circle cx="60" cy="60" r="44" fill="none" stroke="${SITE.bloodSoft}" stroke-width="6" opacity="0.9"/></svg>`);
  await page.locator('#p').screenshot({ path: `${OUT}/plates/ripple.png`, omitBackground: true });
  await browser.close();
  console.log('plates rendered:', PLATES.length, '+ rail + cursor (site aesthetic)');
  writeFileSync(`${OUT}/plates/timeline.json`, JSON.stringify({ PLATES, CLICK_AT, RAIL_AT, renderId }, null, 2));
}

// ---------- SMOOTH CAMERA ----------
// smootherstep (6t^5-15t^4+10t^3) between keyframes → C2-continuous, no stop-go.
// Emitted as an ffmpeg per-frame expression in `t`.
function smoothExpr(keys, key) {
  let expr = `${keys.at(-1)[key]}`;
  for (let i = keys.length - 2; i >= 0; i--) {
    const a = keys[i], b = keys[i + 1], dt = (b.t - a.t) || 1e-4;
    const S = `(clip((t-${a.t.toFixed(3)})/${dt.toFixed(4)},0,1))`;
    const sm = `(${S}*${S}*${S}*(${S}*(6*${S}-15)+10))`;
    const seg = `(${a[key].toFixed(3)}+(${(b[key] - a[key]).toFixed(3)})*${sm})`;
    expr = `if(lt(t,${b.t.toFixed(3)}),${seg},${expr})`;
  }
  return expr;
}

// ONE continuous move per beat (start→end). y = 16:9-window top in original px
// (0..1760 at z=1); z = zoom (1..1.5); xb = horizontal bias 0..1. Poses chosen
// so each beat drifts gently in a single direction — verified by frame extraction.
const CAM = {
  'b1-open':    { xb: .5, keys: [ { t: 0, y: 40, z: 1.06 }, { t: 28.28, y: 700, z: 1.20 } ] },
  'b2-board':   { xb: .58, keys: [ { t: 0, y: 250, z: 1.14 }, { t: 22.78, y: 900, z: 1.30 } ] },
  'b3-observe': { xb: .5, keys: [ { t: 0, y: 720, z: 1.10 }, { t: 25.12, y: 1230, z: 1.22 } ] },
  'b4-incident':{ xb: .5, keys: [ { t: 0, y: 980, z: 1.12 }, { t: 28.34, y: 1120, z: 1.40 } ] },
  'b5-close':   { xb: .5, keys: [ { t: 0, y: 1080, z: 1.28 }, { t: 23.70, y: 70, z: 1.04 } ] },
};
const SEG_OF = { open: 'b1-open', board: 'b2-board', observe: 'b3-observe', incident: 'b4-incident', close: 'b5-close' };

function buildBeat(b) {
  const seg = SEG_OF[b.id];
  const settled = events[seg].find(e => e.name === 'settled').recAt;
  const inpoint = settled + 0.3;
  const cam = CAM[seg];
  const Z = smoothExpr(cam.keys, 'z');
  const Y = smoothExpr(cam.keys, 'y');
  // 1.5× supersample crop-render (2880×1620) → downscale 1920×1080 for sub-pixel pan.
  const camChain =
    `scale=w='ceil(2560*1.125*(${Z})/2)*2':h='ceil(3200*1.125*(${Z})/2)*2':eval=frame:flags=bicubic,` +
    `crop=2880:1620:x='(in_w-2880)*(${cam.xb})':y='clip((${Y})*(in_h/3200),0,in_h-1620)',` +
    `scale=1920:1080:flags=lanczos,format=yuv420p`;

  const plates = PLATES.filter(p => p.at >= b.start - 0.01 && p.at < b.end).map(p => ({
    ...p, in: +(p.at - b.start).toFixed(2), outL: +(Math.min(p.out, b.end) - b.start).toFixed(2),
  }));
  const inputs = ['-ss', inpoint.toFixed(2), '-t', (b.dur + 0.5).toFixed(2), '-i', `${OUT}/capture/${seg}.webm`];
  plates.forEach(p => inputs.push('-loop', '1', '-i', `${OUT}/plates/${p.id}.png`));

  let fc = `[0:v]fps=60,setpts=PTS-STARTPTS,${camChain}[v0]`;
  let last = 'v0';
  plates.forEach((p, i) => {
    const idx = i + 1;
    // hero PNG is wider than frame (rendered big + DPR2): fit to 1560 and center.
    const px = p.id === 'hero' ? 180 : p.pos[0];
    const pre = p.id === 'hero' ? 'scale=1560:-1,' : '';
    const s = `clip((t-${p.in})/0.28,0,1)`;
    const slide = `${px}+14*(1-(${s}*${s}*${s}*(${s}*(6*${s}-15)+10)))`;
    fc += `;[${idx}:v]${pre}format=rgba,fade=t=in:st=${p.in}:d=0.28:alpha=1,fade=t=out:st=${(p.outL - 0.16).toFixed(2)}:d=0.16:alpha=1[p${idx}]` +
          `;[${last}][p${idx}]overlay=x='${slide}':y=${p.pos[1]}:enable='between(t,${p.in},${p.outL})'[v${idx}]`;
    last = `v${idx}`;
  });
  if (b.id === 'incident') {
    const cIn = +(CLICK_AT - b.start - 0.6).toFixed(2), cClick = +(CLICK_AT - b.start).toFixed(2);
    const nc = plates.length + 1, nr = plates.length + 2;
    inputs.push('-loop', '1', '-i', `${OUT}/plates/cursor.png`, '-loop', '1', '-i', `${OUT}/plates/ripple.png`);
    const cs = `clip((t-${cIn})/0.6,0,1)`;
    const ce = `(${cs}*${cs}*${cs}*(${cs}*(6*${cs}-15)+10))`;
    fc += `;[${nc}:v]format=rgba,fade=t=in:st=${cIn}:d=0.15:alpha=1,fade=t=out:st=${(cClick + 0.9).toFixed(2)}:d=0.25:alpha=1[cur]` +
          `;[${last}][cur]overlay=x='1210+150*(1-${ce})':y='470+95*(1-${ce})':enable='between(t,${cIn},${(cClick + 1.2).toFixed(2)})'[vc]` +
          `;[${nr}:v]format=rgba,fade=t=in:st=${cClick}:d=0.03:alpha=1,fade=t=out:st=${(cClick + 0.05).toFixed(2)}:d=0.18:alpha=1[rip]` +
          `;[vc][rip]overlay=x=1178:y=430:enable='between(t,${cClick},${(cClick + 0.28).toFixed(2)})'[vr]`;
    last = 'vr';
  }
  if (b.id === 'close') {
    const rIn = +(RAIL_AT - b.start).toFixed(2);
    const n = plates.length + 1;
    inputs.push('-loop', '1', '-i', `${OUT}/plates/rail.png`);
    const rs = `clip((t-${rIn})/0.4,0,1)`;
    const re = `(${rs}*${rs}*${rs}*(${rs}*(6*${rs}-15)+10))`;
    // scale rail to a fixed on-frame width so it sits fully inside the frame,
    // then slide in from the right edge to rest at x=1150 (right ~40%).
    fc += `;[${n}:v]scale=740:-1,format=rgba,fade=t=in:st=${rIn}:d=0.3:alpha=1[rl]` +
          `;[${last}][rl]overlay=x='1150+770*(1-${re})':y=150:enable='gte(t,${rIn})'[vr2]`;
    last = 'vr2';
  }
  const out = `${TMP}/${seg}.mp4`;
  ff([...inputs, '-filter_complex', fc, '-map', `[${last}]`, '-t', b.dur.toFixed(2),
    '-r', '60', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-an', out]);
  console.log('beat composed:', seg, b.dur + 's', plates.map(p => p.id).join(','));
  return out;
}

// ---------- MAIN ----------
const mode = process.argv[2] || '';
if (mode !== '--beats-only' && mode !== '--mix-only') await renderPlates();
if (mode === '--plates-only') process.exit(0);

if (mode !== '--mix-only') {
  const pieces = beats.map(buildBeat);
  writeFileSync(`${TMP}/concat.txt`, pieces.map(p => `file '${p.split('/').pop()}'`).join('\n') + '\n');
  ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/concat.txt`, '-vf', 'fps=60,setpts=N/60/TB', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-an', `${TMP}/video.mp4`]);
}

// Blind-review v3 fix: the mix was truncated at the 128.22s boundary mid-decay.
// Freeze-hold the final frame +1.4s (an end-card read on the receipt rail, <2s so
// it never reads as a dead stretch) so the closing audio can resolve to true
// silence past the last spoken word.
const END = 129.62; // 128.22 + 1.4
ff(['-i', `${TMP}/video.mp4`, '-vf', 'tpad=stop_mode=clone:stop_duration=1.4',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-an', `${TMP}/video_held.mp4`]);
// one graph: voice padded to END, bed trimmed+faded+ducked, amix, then a master
// fade-out (128.6→END) that lands the whole mix at silence on the boundary.
const filter =
  `[1:a]apad=whole_dur=${END}[voice];` +
  `[2:a]atrim=0:${END},afade=t=out:st=126.4:d=3.0,volume=0.26[bed];` +
  `[voice][bed]amix=inputs=2:duration=longest:normalize=0,afade=t=out:st=128.6:d=1.0[a]`;
ff(['-i', `${TMP}/video_held.mp4`, '-i', `${OUT}/narration.mp3`, '-i', `${OUT}/bed.mp3`,
  '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', `${TMP}/mix.mp4`]);
// TP target -2.0 + alimiter 0.80 → true peak comfortably under -1.5 dBTP.
const p1 = spawnSync('ffmpeg', ['-y', '-i', `${TMP}/mix.mp4`, '-af', 'loudnorm=I=-16.5:TP=-2.0:LRA=11:print_format=json', '-f', 'null', '/dev/null'], { encoding: 'utf8' });
const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
ff(['-i', `${TMP}/mix.mp4`, '-af',
  `loudnorm=I=-16.5:TP=-2.0:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,alimiter=limit=0.72:level=false`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${V}/career-ops-demo-v3.mp4`]);
console.log(`DONE → ${V}/career-ops-demo-v3.mp4 (measured ${m.input_i} LUFS → -16.5, held to ${END}s)`);
