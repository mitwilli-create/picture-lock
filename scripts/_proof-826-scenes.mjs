// $0 proof render for the $8.26 re-render (2026-07-16): renders the three
// cost-bearing mograph scenes (hook / newsroom / proof) with the edited
// explainer.html template, using the v12 beat map for durations/events.
// No API calls. Usage: node scripts/_proof-826-scenes.mjs
import { execFileSync } from 'child_process';
import { readFileSync, mkdirSync } from 'fs';

const WT = '/private/tmp/claude-501/-Users-mitchellwilliams-Documents-broll-pipeline/31cc60f1-d243-4be3-ad43-68a401d533be/scratchpad/takec';
const { renderMograph } = await import(`${WT}/lib/mograph.mjs`);
const E = 'output/takes/e2';
const OUT = '.cache/proof-826';
mkdirSync(OUT, { recursive: true });

const B = JSON.parse(readFileSync(`${E}/beats-v12.json`, 'utf8'));
const at = id => B.beats.find(b => b.id === id).start;
const words = JSON.parse(readFileSync(`${E}/narration-words-v12.json`, 'utf8')).words
  .filter(w => w.type === 'word' && /[a-z0-9]/i.test(w.text));
const wordAt = (txt, after = 0) => words.find(w => w.start >= after && w.text.toLowerCase().replace(/[^a-z]/g, '') === txt)?.start ?? null;
const lead = 0.45;

const SCENES = [
  { scene: 'hook',     from: 0,                to: at('problem'), ev: { allin: at('allin') - lead, document: at('document') - lead } },
  { scene: 'newsroom', from: at('source') - 0.4, to: at('public'), ev: { source: at('source') - lead, illo: at('illo') - lead } },
  { scene: 'proof',    from: at('proof'),      to: at('voice'), ev: { gates: at('gates') - lead, flags: at('flags') - lead, g1: wordAt('voice', at('gates')), g2: wordAt('code', at('gates')), g3: wordAt('resolution', at('gates')) } },
];
for (const s of SCENES) {
  s.dur = +(s.to - s.from).toFixed(2);
  for (const k of Object.keys(s.ev)) s.ev[k] = +(s.ev[k] - s.from).toFixed(2);
}
for (const s of SCENES) {
  await renderMograph({
    template: 'explainer', seconds: s.dur,
    data: { scene: s.scene, dur: s.dur, ev: s.ev, machine: null, plate: null, noPlate: true },
    outPath: `${OUT}/${s.scene}.mp4`,
    log: m => process.stdout.write('\r' + m + '   '),
  });
  console.log(`\n${s.scene}: ${s.dur}s done`);
}
console.log('proof renders in ' + OUT);
