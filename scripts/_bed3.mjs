import 'dotenv/config';
import { music } from '../lib/elevenlabs.mjs';
import { writeFileSync } from 'node:fs';
const buf = await music({
  prompt: 'Quiet cinematic instrumental underscore. Fully composed from the very first second with no intro buildup: warm low strings, felt piano, and a soft analog synth pulse present immediately. Restrained, textural, steady slow motion, prestige film title-sequence mood, dark and elegant. Loop-friendly ending.',
  lengthMs: 75000,
});
writeFileSync('output/motion-groundwork/music/bed-cand3-composed.mp3', Buffer.from(buf));
console.log('written');
