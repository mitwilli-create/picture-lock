#!/usr/bin/env python3
"""Onset + gap scan for narration-v11.
For every sentence/line start:
  - gap before it (end of previous word -> onset) from the words file
  - RMS envelope of the first 300ms in 20ms windows (chopped onset = jump
    from silence to high RMS in one window)
  - RMS of the 80ms window BEFORE the onset (nonzero = cut landed inside audio)
"""
import json, subprocess, array, math, sys

SR = 16000
WIN = int(0.02 * SR)  # 20ms
AUDIO = 'output/takes/e2/narration-v11.mp3'
WORDS = 'output/takes/e2/narration-words-v11.json'

raw = subprocess.run(
    ['ffmpeg', '-v', 'error', '-i', AUDIO, '-ac', '1', '-ar', str(SR),
     '-f', 's16le', '-'],
    capture_output=True, check=True).stdout
pcm = array.array('h')
pcm.frombytes(raw)
N = len(pcm)

def rms(t0, t1):
    a = max(0, int(t0 * SR)); b = min(N, int(t1 * SR))
    if b <= a: return 0.0
    s = 0
    for v in pcm[a:b]: s += v * v
    return math.sqrt(s / (b - a)) / 32768.0

d = json.load(open(WORDS))
ws = [w for w in d['words'] if w.get('type') == 'word']

# line starts = first word, or word following sentence-ending punctuation
lines = []
cur = [ws[0]]
for prev, w in zip(ws, ws[1:]):
    if prev['text'].rstrip().endswith(('.', '!', '?', ';')):
        lines.append(cur); cur = [w]
    else:
        cur.append(w)
lines.append(cur)

print(f"{'#':>2} {'t':>7} {'gap':>6} | pre80ms |  env20ms x15 (first 300ms) | line")
for i, ln in enumerate(lines):
    w0 = ln[0]
    t = w0['start']
    prev_end = None
    for w in ws:
        if w['end'] <= t + 1e-6 and (prev_end is None or w['end'] > prev_end):
            if w is not w0: prev_end = w['end']
    gap = (t - prev_end) if prev_end is not None else t
    pre = rms(t - 0.08, t)
    env = [rms(t + k * 0.02, t + (k + 1) * 0.02) for k in range(15)]
    envs = ' '.join(f"{e*1000:4.0f}" for e in env)
    text = ' '.join(w['text'] for w in ln)[:52]
    print(f"{i:>2} {t:7.2f} {gap:6.2f} | {pre*1000:7.0f} | {envs} | {text}")
