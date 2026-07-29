#!/usr/bin/env python3
"""Build narration-v12 + beats-v12 + words-v12 from the v11 chain.

Ops (in order, per Mitchell's 2026-07-14 approvals):
 1. duck the orphaned tick at ~48.93 (residue before "Step three")
 2. splice-repair the chopped "resolution" onset at ~66.8: rejoin the
    stranded first ~60ms of the /r/ with the word, move the 0.7s pad
    earlier so the word keeps its natural attack (total length unchanged)
 3. insert six approved comprehension pads (applied last-to-first):
      31.83 +0.40  before "Take the flagship"
      55.74 +0.35  before "That's how a 53-second film"
      59.95 +0.50  before "And the same gates"
      63.32 +0.30  before "voice scoring,"
      68.18 +0.40  before "Public, dated, zero open flags."
      84.51 +0.50  before "So look around"
 4. soften three hard post-pad onsets with 80ms volume ramps:
      "It runs" ~21.30, "I'm Mitchell" ~76.95, "If you're hiring" ~78.97
      (positions auto-shifted by the pads)
 5. rewrite beats/words with the shifts; encode narration-v12.mp3
"""
import json, subprocess, array, math, sys

SR = 44100
E = 'output/takes/e2'
raw = subprocess.run(['ffmpeg','-v','error','-i',f'{E}/narration-v11.mp3',
                      '-ac','1','-ar',str(SR),'-f','s16le','-'],
                     capture_output=True, check=True).stdout
pcm = array.array('h'); pcm.frombytes(raw)
N = len(pcm)
print(f'v11 decoded: {N} samples = {N/SR:.3f}s')

def rms(a, b):
    a = max(0, a); b = min(N, b)
    s = 0
    for v in pcm[a:b]: s += v*v
    return math.sqrt(s/max(1, b-a))/32768.0

S = lambda t: int(round(t*SR))

# ---- 1. tick duck (values <= -39dB residue, sits in dead silence) ----
d0, d1 = S(48.918), S(48.962)
for i in range(d0, d1): pcm[i] = 0
print(f'tick ducked [{d0/SR:.3f},{d1/SR:.3f}] post-RMS={rms(d0,d1):.6f}')

# ---- 2. splice repair at "resolution" ----
# find the long near-zero run between 66.0 and 67.0
win = int(0.005*SR)
i = S(66.0); zs = ze = None
while i < S(67.0):
    if rms(i, i+win) < 0.0002:
        j = i
        while j < S(67.0) and rms(j, j+win) < 0.0002: j += win
        if (j-i)/SR > 0.3: zs, ze = i, j; break
        i = j
    else: i += win
assert zs, 'zero run not found'
# fragment start: walk back from zs while audio present, then 15ms margin
k = zs
while k > S(65.5) and rms(k-win, k) >= 0.0012: k -= win
cut_a = k - int(0.015*SR)
frag_len = zs - cut_a
print(f'repair: zeros [{zs/SR:.3f},{ze/SR:.3f}] ({(ze-zs)/SR:.3f}s), '
      f'fragment [{cut_a/SR:.3f},{zs/SR:.3f}] ({frag_len/SR*1000:.0f}ms)')
# the old cut eroded both edges to zero; trim the dead samples and butt-join
# at zero crossings so the /r/ onset is continuous (no notch)
bt = zs
while bt > cut_a and abs(pcm[bt-1]) < 40: bt -= 1          # B's live tail
while bt > cut_a and not (pcm[bt-1] <= 0 <= pcm[bt] or pcm[bt] <= 0 <= pcm[bt-1]): bt -= 1
ch = ze
while ch < N and abs(pcm[ch]) < 40: ch += 1                # C's live head
while ch < N-1 and not (pcm[ch] <= 0 <= pcm[ch+1] or pcm[ch+1] <= 0 <= pcm[ch]): ch += 1
trimmed = (zs - bt) + (ch - ze)
print(f'  trimmed dead edges: B tail {(zs-bt)/SR*1000:.1f}ms, C head {(ch-ze)/SR*1000:.1f}ms')
new = pcm[:cut_a] + array.array('h', bytes(2*((ze-zs) + trimmed))) + pcm[cut_a:bt] + pcm[ch:]
assert len(new) == N, (len(new), N)
pcm = new
res_delta = (bt - cut_a)/SR  # "resolution" onset now starts this much earlier

# ---- 3. pads, last-to-first ----
PADS = [(31.83, 0.40), (55.74, 0.35), (59.95, 0.50),
        (63.32, 0.30), (68.18, 0.40), (84.51, 0.50)]
for t, g in sorted(PADS, reverse=True):
    c = S(t)
    print(f'pad @{t} +{g}s  cut-region RMS(40ms around)={rms(c-int(0.02*SR), c+int(0.02*SR)):.5f}')
    # 5ms edge fades into/out of the inserted silence
    fw = int(0.005*SR)
    for k in range(fw):
        pcm[c-fw+k] = int(pcm[c-fw+k] * (1 - k/fw))   # fade out left edge
        pcm[c+k]   = int(pcm[c+k] * (k/fw))            # fade in right edge
    pcm = pcm[:c] + array.array('h', bytes(2*int(g*SR))) + pcm[c:]
N2 = len(pcm)
shift = lambda t: t + sum(g for c, g in PADS if t >= c)
print(f'v12 pcm: {N2/SR:.3f}s (added {(N2-N)/SR:.3f}s)')

# ---- 4. onset ramps at final positions ----
def detect_onset(t_approx):
    w1 = int(0.001*SR)
    i = S(t_approx) - int(0.05*SR)
    def r(a):
        s = 0
        for v in pcm[a:a+w1]: s += v*v
        return math.sqrt(s/w1)/32768.0
    while r(i) >= 0.003: i -= w1           # ensure we start in silence
    while r(i) < 0.003: i += w1
    return i / SR

for t11 in (21.30, 76.95, 78.97):
    tf = shift(t11)
    o = detect_onset(tf)
    t0, t1 = o - 0.02, o + 0.06
    a, b = S(t0), S(t1)
    for k in range(a, b):
        f = (k - a) / (b - a)
        pcm[k] = int(pcm[k] * f)
    print(f'ramp: v11~{t11} -> onset {o:.3f}, ramped [{t0:.3f},{t1:.3f}]')

# ---- 5. encode + rewrite beats/words ----
p = subprocess.run(['ffmpeg','-y','-v','error','-f','s16le','-ar',str(SR),'-ac','1',
                    '-i','-','-c:a','libmp3lame','-b:a','192k', f'{E}/narration-v12.mp3'],
                   input=pcm.tobytes())
assert p.returncode == 0

B = json.load(open(f'{E}/beats-v11.json'))
for b in B['beats']:
    b['start'] = round(shift(b['start']), 3)
B['total'] = round(B['total'] + sum(g for _, g in PADS), 2)
B['v12'] = {'pads': PADS, 'resolution_repair_delta': round(res_delta, 3),
            'tick_duck': [48.918, 48.962], 'onset_ramps_v11_coords': [21.30, 76.95, 78.97]}
json.dump(B, open(f'{E}/beats-v12.json','w'), indent=1)

W = json.load(open(f'{E}/narration-words-v11.json'))
fixed = 0
for w in W['words']:
    if w.get('text') == 'resolution' and abs(w.get('start',0) - 66.85) < 0.2:
        w['start'] = round(w['start'] - res_delta, 3); fixed += 1
    # shift: whole word moves only if its start is at/after a cut
    if 'start' in w:
        ns = shift(w['start'])
        if 'end' in w:
            w['end'] = round(w['end'] + (ns - w['start']), 3)
        w['start'] = round(ns, 3)
json.dump(W, open(f'{E}/narration-words-v12.json','w'), indent=1)
print(f'beats-v12 total={B["total"]}  words shifted (resolution fixed: {fixed})')
print('END =', B['total'] + 3.5)
