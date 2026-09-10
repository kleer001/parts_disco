# assets/sfx

## win-chime.mp3 — provenance unknown, and a ship blocker

This file carries no licence, source or credit, and none can be recovered.

It came from `treasure_trash`, which added it in one commit
(`cac8071`, 2026-07-31) with no source file, no build script and nothing in the
message about where it came from. The repository records no credits for it, and no
other copy of it exists on this machine.

What the file itself says:

| | |
|---|---|
| encoder | `Lavf60.16.100` / `Lavc60.31` — ffmpeg, so it is a re-encode of something else |
| length | exactly 2.000s, still ringing at -26.8 dBFS when it is cut |
| stereo | left and right correlate at -0.07, so the width is real and not a duplicated mono channel |
| noise floor | -50 dBFS before the first strike |
| shape | seven onsets between 0.17s and 1.46s |
| partials | 5.8k, 6.08k, 10.2k, 13.7k — inharmonic and metallic |

Decorrelated channels, a noise floor, and a played sequence of strikes are what a
recorded instrument leaves behind; a synthesised chime would be mono or perfectly
correlated, would start from digital silence, and would have harmonic partials. So
this is a sample out of a sound library, trimmed and re-encoded — which is the one
kind of asset that cannot ship without knowing which library.

The four music loops in `assets/music/` are CC0 with the source URL, the author and
the licence recorded per track in `src/music.js`. That is the standard this file has
to meet before a store page: either its licence is found, or it is replaced by a
sound that has one.
