#!/usr/bin/env bash
# master — loudness-match a Strudel render to the loop it covers, in post.
#
#   ./master.sh <in.wav> <out.ogg> <target_LUFS> [true_peak_dB]
#   ./master.sh render.wav techno-ish.ogg -26.5 -1.5
#
# Strudel renders dry and hot — layered voices sum past 0 dBFS and hard-clip, and each source
# sits at its own level. Fix clipping at the SOURCE first (halve the patch gains, re-render);
# this only matches loudness/dynamics. Two-pass ffmpeg loudnorm hits the target LUFS exactly
# and limits the true peak, preserving the render's dynamics (linear=true). Read the target
# LUFS off the original with `compare.py` — every loop differs (techno-ish lives at -26.5).
set -euo pipefail
IN="$1"; OUT="$2"; I="$3"; TP="${4:--1.5}"

# pass 1 — measure
read -r MI MTP MLRA MTH < <(
  ffmpeg -hide_banner -i "$IN" -af "loudnorm=I=$I:LRA=1:TP=$TP:print_format=json" -f null - 2>&1 \
  | grep -oE '"input_(i|tp|lra|thresh)"[^,]*' | grep -oE '\-?[0-9.]+' | paste -sd' ' -
)
echo "measured: I=$MI TP=$MTP LRA=$MLRA thresh=$MTH  ->  target I=$I TP=$TP"

# pass 2 — apply (linear: one gain + true-peak limit, dynamics preserved)
ffmpeg -y -v error -i "$IN" \
  -af "loudnorm=I=$I:LRA=1:TP=$TP:measured_I=$MI:measured_TP=$MTP:measured_LRA=$MLRA:measured_thresh=$MTH:linear=true" \
  -ar 48000 -c:a libvorbis -q:a 6 "$OUT"
echo "wrote $OUT"
