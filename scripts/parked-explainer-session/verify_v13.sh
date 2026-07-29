#!/bin/zsh
# Verification pass for the new cut (Mitchell's "done" bar)
set -e
cd /Users/mitchellwilliams/Documents/broll-pipeline
V=output/takes/picture-lock-explainer.mp4

echo '== duration =='
ffprobe -v error -show_entries format=duration -of csv=p=0 $V

echo '== loudness (expect ~-16.5..-17.0 LUFS, TP ~-1.7..-1.9) =='
ffmpeg -i $V -af loudnorm=I=-16.5:TP=-1.9:LRA=11:print_format=summary -f null /dev/null 2>&1 | grep -A8 'Output Integrated' | head 9

echo '== silencedetect: confirm the six pads landed (final-mix timeline) =='
ffmpeg -i $V -af silencedetect=n=-45dB:d=0.25 -f null /dev/null 2>&1 | grep silence_ | tail -30

echo '== srt sanity =='
grep -c ' --> ' output/takes/picture-lock-explainer.srt
grep -n '\. \.' output/takes/picture-lock-explainer.srt || echo 'no double-periods'
