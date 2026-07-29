#!/usr/bin/env python3
"""Fine acoustic onset scan. For each line boundary:
 - locate the true silence span before the line (RMS<thresh at 5ms res)
 - measure the attack: time from silence -> 50% of peak-of-first-200ms
 - detect 'instant from zero' starts (chop signature) vs natural ramps
"""
import json, subprocess, array, math

SR = 16000
AUDIO = 'output/takes/e2/narration-v11.mp3'
WORDS = 'output/takes/e2/narration-words-v11.json'
raw = subprocess.run(['ffmpeg','-v','error','-i',AUDIO,'-ac','1','-ar',str(SR),
                      '-f','s16le','-'], capture_output=True, check=True).stdout
pcm = array.array('h'); pcm.frombytes(raw); N = len(pcm)

W = int(0.005*SR)  # 5ms windows
nw = N // W
env = []
for i in range(nw):
    s = 0
    for v in pcm[i*W:(i+1)*W]: s += v*v
    env.append(math.sqrt(s/W)/32768.0)

SIL = 0.004  # silence threshold

d = json.load(open(WORDS))
ws = [w for w in d['words'] if w.get('type')=='word']
lines = []; cur=[ws[0]]
for prev,w in zip(ws,ws[1:]):
    if prev['text'].rstrip().endswith(('.','!','?',';')):
        lines.append(cur); cur=[w]
    else: cur.append(w)
lines.append(cur)

def analyze(t_nom, label):
    # search widened window for the acoustic onset preceding/near nominal start
    i_nom = int(t_nom/0.005)
    # walk back from nominal+40ms to find last silence window
    j = min(i_nom+8, nw-1)
    # find the silence span that precedes this line: walk back until in silence,
    # then measure it
    k = j
    while k > 0 and env[k] > SIL: k -= 1          # k = last silent win before voice
    sil_end = k
    k2 = k
    while k2 > 0 and env[k2] <= SIL: k2 -= 1      # k2 = end of previous speech
    sil_len = (sil_end - k2) * 0.005
    onset = (sil_end+1) * 0.005
    # attack profile: first 40 windows (200ms) after onset
    seg = env[sil_end+1: sil_end+41]
    pk = max(seg) if seg else 0
    # windows to reach 50% of peak
    t50 = next((n for n,e in enumerate(seg) if e >= 0.5*pk), None)
    first = seg[0] if seg else 0
    instant = first >= 0.5*pk  # voice at >=50% peak in the very first 5ms window
    print(f"{label:<28} nom={t_nom:7.2f} onset={onset:7.2f} sil={sil_len:5.2f}s "
          f"first5ms={first*1000:4.0f} peak={pk*1000:4.0f} t50={'{:3d}ms'.format(t50*5) if t50 is not None else '  ?'} "
          f"{'<< INSTANT-FROM-ZERO' if instant else ''}")

print('== line onsets ==')
for i, ln in enumerate(lines):
    if ln[0]['text'] == '.': continue
    analyze(ln[0]['start'], f"L{i:02d} {' '.join(w['text'] for w in ln)[:24]}")

print()
print('== mid-line pad points (gate items, v10 beats) ==')
for txt in ('code','resolution'):
    w = next(w for w in ws if w['start'] > 63 and w['text'].lower().startswith(txt))
    analyze(w['start'], f"mid {w['text']}")
print()
print('== pure digital-zero runs > 0.15s (inserted pads) ==')
i = 0
while i < nw:
    if env[i] < 0.0002:
        j = i
        while j < nw and env[j] < 0.0002: j += 1
        if (j-i)*0.005 >= 0.15:
            print(f"  zeros {i*0.005:7.2f} -> {j*0.005:7.2f}  ({(j-i)*0.005:4.2f}s)")
        i = j
    else: i += 1
