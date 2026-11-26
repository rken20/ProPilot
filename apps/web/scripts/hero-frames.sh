#!/usr/bin/env bash
# Turns a clip into the frames the home page plays on scroll (app/_home/scroll-hero.tsx).
#
#   scripts/hero-frames.sh <clip.mp4 | frames/%03d.png> <version> [frames=121] [crop=W:H:X:Y]
#
# Writes public/hero-seq/<version>/d (computer, 1000x900) and /m (phone, every
# second frame, 640x576). The crop keeps the middle of a 16:9 clip at 10:9; pass
# one when the house sits elsewhere. Afterwards set dir, the counts and bg in
# app/_home/hero-sequence.ts. Needs ffmpeg with libwebp.
set -euo pipefail
src="$1"; ver="$2"; n="${3:-121}"; crop="${4:-ih*10/9:ih:(iw-ih*10/9)/2:0}"
out="$(dirname "$0")/../public/hero-seq/$ver"
rm -rf "$out"; mkdir -p "$out/d" "$out/m"

if [[ "$src" == *%* ]]; then
  input=(-start_number 0 -i "$src"); pick="null"
else
  # Spread n frames evenly over the whole clip, first and last included.
  total=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$src")
  (( total >= n )) || { echo "The clip has only $total frames; ask for at most that many." >&2; exit 1; }
  a=$((n - 1)); b=$((total - 1))
  input=(-i "$src"); pick="select='eq(n\,round(round(n*$a/$b)*$b/$a))'"
fi
ffmpeg -hide_banner -loglevel error "${input[@]}" -an -vf "$pick,crop=$crop,scale=1000:900:flags=lanczos" -fps_mode vfr -frames:v "$n" -c:v libwebp -quality 74 -compression_level 6 -start_number 0 "$out/d/%03d.webp"
ffmpeg -hide_banner -loglevel error -start_number 0 -i "$out/d/%03d.webp" -vf "select='not(mod(n\,2))',scale=640:576:flags=lanczos" -fps_mode vfr -c:v libwebp -quality 72 -compression_level 6 -start_number 0 "$out/m/%03d.webp"
echo "computer: $(ls "$out/d" | wc -l) frames, $(du -sh "$out/d" | cut -f1)   phone: $(ls "$out/m" | wc -l) frames, $(du -sh "$out/m" | cut -f1)"
