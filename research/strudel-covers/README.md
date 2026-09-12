# strudel-covers — the board music, re-scored

The four loops that play under the board are Strudel re-scorings of the four CC0 loops
the game was shipped with. Each was deconstructed by FFT — tempo, drum grid, bass motion,
harmony — and rebuilt from that measurement with a new instrument palette, then rendered
offline to a seamless loop. The aim was fidelity, not reinterpretation: same key, same
tempo, same groove, new sounds.

## What is here

```
disco.strudel  piano.strudel  funky.strudel  techno-ish.strudel   the patches
rendered/      the .ogg each patch renders to (copied into assets/music/)
originals/     the CC0 source loops, kept for A/B and for the analysis to read
analysis/      the deconstruction toolkit — loopscope, compare, master, deconstruct
PROVENANCE.md  every sound, its source, and the sample-licence gate for shipping
```

## Original → cover

| Track | Source (CC0) | Measured | New palette |
|---|---|---|---|
| Disco | josefpres, fs-572397 | 120.18 BPM, 4-on-floor, offbeat open-hats, bass B with a C#-G-D turnaround | TR-909 kit, synth strings, synth bass |
| Piano | bassimat, fs-832693 | 120.19 BPM, C major, **C-G-Am-Dm**, syncopated 16th comp | electric piano, synth bass, TR-909 kick |
| Funky | Fupi (OpenGameArt) | 109.96 BPM, **Am↔F** vamp, A-pedal walking bass, backbeat | synth clavinet, synth bass, TR-808 kit |
| Techno-ish | fs-447576 | 120.18 BPM, a drum kit only — no pitch; a 4-bar phrase: kick run + backbeat clap + bright hats + a turnaround clap fill | TR-909 kit, mastered to the source loudness |

The originals are Freesound previews and one OpenGameArt song; `research/disco-loops/`
is where they were gathered and measured, and where the game's original `music.js`
numbers came from.

## Hear one

Open [strudel.cc](https://strudel.cc), paste a `.strudel` file, hit play. One cycle is
one bar. The tempo, the notes, and the grid are the measured values, written in the
comments at the top of each patch.

## How these were made

Each cover was deconstructed, transcribed, rendered, verified and mastered with the
**strudel-cover** skill — that skill holds the method, the headless-render mechanics and the
lessons. The tools it uses are vendored in `analysis/` so this repo can regenerate its own
numbers without the skill:

```sh
cd analysis
python3 loopscope.py ../originals/techno-ish.ogg --bpm 120.18 --bars 4 --out /tmp  # read a loop
python3 compare.py ../originals/techno-ish.ogg render.wav --bpm 120.18 --bars 4    # score a render
./master.sh render.wav techno-ish.ogg -26.5 -1.5                                    # match loudness
python3 deconstruct.py                                                              # batch: the 4 here
```

Per-track loop lengths and gains are in `src/music.js`; `gain` is solved so every track sits
at the same −18 LUFS bed.

## Before shipping

The covers use Strudel's built-in drum-machine samples, whose licence is unsettled. See
`PROVENANCE.md` — it is the one thing to clear before a paid release, and it names the two
ways to clear it.
