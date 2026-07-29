#!/usr/bin/env python3
"""Comprehension pads for the $8.26 re-render takes (2026-07-16).

Port of the approved v12 pad surgery (scripts/parked-explainer-session/
build_v12_audio.py) generalized for a fresh take: inserts silence pads at
caller-supplied times, 5ms edge fades into/out of each pad, then softens the
onset that follows each pad with the same -20ms/+60ms volume ramp v12 used,
and shifts the STT words JSON by the inserted gaps.

Usage:
  _apply-pads-826.py <narr_in.mp3> <words_in.json> <narr_out.mp3> <words_out.json> '<pads-json>'
where <pads-json> = [[t_seconds, gap_seconds], ...] (t = insertion point,
already placed inside the silence gap before the padded word).
"""
import json, subprocess, array, math, sys

narr_in, words_in, narr_out, words_out, pads_json = sys.argv[1:6]
PADS = [(float(t), float(g)) for t, g in json.loads(pads_json)]

SR = 44100
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', narr_in,
                      '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                     capture_output=True, check=True).stdout
pcm = array.array('h')
pcm.frombytes(raw)
N = len(pcm)
print(f'decoded: {N} samples = {N/SR:.3f}s')

S = lambda t: int(round(t * SR))

# pads, last-to-first (indices stay valid)
for t, g in sorted(PADS, reverse=True):
    c = S(t)
    fw = int(0.005 * SR)
    for k in range(fw):
        pcm[c - fw + k] = int(pcm[c - fw + k] * (1 - k / fw))  # fade out left edge
        pcm[c + k] = int(pcm[c + k] * (k / fw))                # fade in right edge
    pcm = pcm[:c] + array.array('h', bytes(2 * int(g * SR))) + pcm[c:]
    print(f'pad @{t:.3f} +{g}s')
N2 = len(pcm)
shift = lambda t: t + sum(g for c, g in PADS if t >= c)
print(f'padded pcm: {N2/SR:.3f}s (added {(N2-N)/SR:.3f}s)')

# onset ramps right after each pad (v12 recipe: find first energy after the
# pad, ramp [-20ms, +60ms] around the detected onset)
w1 = int(0.001 * SR)
def r(a):
    s = 0
    for v in pcm[a:a + w1]:
        s += v * v
    return math.sqrt(s / w1) / 32768.0

for t, g in PADS:
    i = S(shift(t) + g)  # end of the inserted silence, post-shift coords
    limit = min(len(pcm) - w1, i + S(1.0))
    while i < limit and r(i) < 0.003:
        i += w1
    o = i / SR
    a, b = S(o - 0.02), S(o + 0.06)
    a = max(0, a)
    for k in range(a, b):
        f = (k - a) / (b - a)
        pcm[k] = int(pcm[k] * f)
    print(f'ramp after pad @{t:.3f}: onset {o:.3f}, ramped [{a/SR:.3f},{b/SR:.3f}]')

p = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1',
                    '-i', '-', '-c:a', 'libmp3lame', '-b:a', '192k', narr_out],
                   input=pcm.tobytes())
assert p.returncode == 0

W = json.load(open(words_in))
for w in W['words']:
    if 'start' in w:
        ns = shift(w['start'])
        if 'end' in w:
            w['end'] = round(w['end'] + (ns - w['start']), 3)
        w['start'] = round(ns, 3)
json.dump(W, open(words_out, 'w'), indent=1)
print(f'done: {narr_out} + {words_out}')
