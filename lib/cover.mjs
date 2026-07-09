// lib/cover.mjs: bring-your-own-piece helpers. The user's audio is the master
// timeline: extract it, transcribe it (word timestamps), split it into beat
// segments at sentence boundaries, and build word-timed captions.

import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);

// Normalize any piece (audio or video) to one mp3 the rest of the flow uses.
export function extractPieceAudio(piecePath, outDir) {
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'piece.mp3');
  const isVideo = VIDEO_EXTS.has(extname(piecePath).toLowerCase());
  run('ffmpeg', ['-y', '-i', piecePath, ...(isVideo ? ['-vn'] : []), '-ac', '2', '-ar', '44100', '-b:a', '192k', out]);
  return out;
}

// Split word timestamps into beats of ~targetSec, preferring sentence ends
// (word text ending . ! ?), never shorter than minSec or longer than maxSec.
// The last beat extends to the full piece duration.
export function segmentWords(words, pieceDur, { targetSec = 7, minSec = 4, maxSec = 9 } = {}) {
  const ws = (words || []).filter((w) => w.type !== 'spacing');
  const segs = [];
  let start = 0, text = [], lastEnd = 0;
  const flush = (end) => {
    if (!text.length) return;
    segs.push({ text: text.join(' ').replace(/\s+/g, ' ').trim(), start, seconds: end - start });
    start = end; text = [];
  };
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    text.push(w.text);
    lastEnd = w.end;
    const len = w.end - start;
    const sentenceEnd = /[.!?]$/.test(w.text.trim());
    if ((sentenceEnd && len >= minSec) || len >= maxSec) flush(w.end);
    else if (sentenceEnd && len < minSec && len >= targetSec) flush(w.end);
  }
  flush(lastEnd);
  if (segs.length) {
    const last = segs[segs.length - 1];
    last.seconds = Math.max(last.seconds, pieceDur - last.start); // absorb the tail
  }
  return segs;
}

// Word-timed captions: chunk at sentence ends, long pauses, or ~40 chars.
export function buildWordSrt(words, outPath) {
  const tc = (sec) => {
    const ms = Math.round(sec * 1000);
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
  };
  const ws = (words || []).filter((w) => w.type !== 'spacing');
  const cues = [];
  let text = [], start = null, prevEnd = null;
  const flush = (end) => {
    if (!text.length) return;
    cues.push({ start, end, text: text.join(' ').replace(/\s+/g, ' ').trim() });
    text = []; start = null;
  };
  for (const w of ws) {
    if (start === null) start = w.start;
    if (prevEnd !== null && w.start - prevEnd > 0.8) { const e = prevEnd; const keep = w; flush(e); start = keep.start; }
    text.push(w.text);
    prevEnd = w.end;
    const chars = text.join(' ').length;
    if (/[.!?]$/.test(w.text.trim()) || chars > 40) flush(w.end);
  }
  flush(prevEnd ?? 0);
  const srt = cues.map((c, i) => `${i + 1}\n${tc(c.start)} --> ${tc(c.end)}\n${c.text}\n`).join('\n');
  writeFileSync(outPath, srt);
  return outPath;
}

// Lay the original piece audio under the assembled visual track (video copied,
// captions muxed soft, faststart for dumb static servers).
export function muxPieceAudio(videoPath, audioPath, srtPath, outPath) {
  run('ffmpeg', [
    '-y', '-i', videoPath, '-i', audioPath, ...(srtPath ? ['-i', srtPath] : []),
    '-map', '0:v', '-map', '1:a', ...(srtPath ? ['-map', '2:0'] : []),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    ...(srtPath ? ['-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng'] : []),
    '-movflags', '+faststart', '-shortest',
    outPath,
  ]);
  return outPath;
}
