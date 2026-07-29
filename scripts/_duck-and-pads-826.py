#!/usr/bin/env python3
"""Duck + comprehension pads for the $8.26 takes (round-1 punch list).

Same surgery style as build_v12_audio.py: (1) zero the caller-supplied duck
regions (false-start sibilants) with 5ms edge fades, in TREATED-take coords;
(2) insert silence pads last-to-first with edge fades; (3) soften the onset
after each pad with the v12 -20ms/+60ms ramp; (4) shift the words JSON.

Usage:
  _duck-and-pads-826.py <narr_t.mp3> <words_t.json> <narr_out.mp3> <words_out.json>
                        '<pads-json [[t,gap],...]>' '<ducks-json [[t0,t1],...]>'
"""
import json, subprocess, array, math, sys

narr_in, words_in, narr_out, words_out, pads_json, ducks_json = sys.argv[1:7]
PADS = [(float(t), float(g)) for t, g in json.loads(pads_json)]
DUCKS = [(float(a), float(b)) for a, b in json.loads(ducks_json)]

SR = 44100
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', narr_in,
                      '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                     capture_output=True, check=True).stdout
pcm = array.array('h')
pcm.frombytes(raw)
N = len(pcm)
S = lambda t: int(round(t * SR))
print(f'decoded: {N/SR:.3f}s')

# ---- ducks (pre-pad coords) ----
for t0, t1 in DUCKS:
    a, b = S(t0), S(t1)
    fw = int(0.005 * SR)
    for k in range(fw):
        pcm[a - fw + k] = int(pcm[a - fw + k] * (1 - k / fw))
        pcm[b + k] = int(pcm[b + k] * (k / fw))
    for i in range(a, b):
        pcm[i] = 0
    print(f'ducked [{t0:.3f},{t1:.3f}]')

# ---- pads, last-to-first ----
for t, g in sorted(PADS, reverse=True):
    c = S(t)
    fw = int(0.005 * SR)
    for k in range(fw):
        pcm[c - fw + k] = int(pcm[c - fw + k] * (1 - k / fw))
        pcm[c + k] = int(pcm[c + k] * (k / fw))
    pcm = pcm[:c] + array.array('h', bytes(2 * int(g * SR))) + pcm[c:]
    print(f'pad @{t:.3f} +{g}s')
N2 = len(pcm)
shift = lambda t: t + sum(g for c, g in PADS if t >= c)
print(f'padded: {N2/SR:.3f}s (added {(N2-N)/SR:.3f}s)')

# ---- onset ramps after each pad ----
w1 = int(0.001 * SR)
def r(a):
    s = 0
    for v in pcm[a:a + w1]:
        s += v * v
    return math.sqrt(s / w1) / 32768.0

for t, g in PADS:
    i = S(shift(t) + g)
    limit = min(len(pcm) - w1, i + S(1.0))
    while i < limit and r(i) < 0.003:
        i += w1
    o = i / SR
    a, b = max(0, S(o - 0.02)), S(o + 0.06)
    for k in range(a, b):
        pcm[k] = int(pcm[k] * ((k - a) / (b - a)))
    print(f'ramp after pad @{t:.3f}: onset {o:.3f}')

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
print(f'done: {narr_out}')
