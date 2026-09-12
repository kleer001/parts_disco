# strudel-covers — sound provenance and rights

The four tracks under the board are Strudel re-scorings of the CC0 loops the game grew
up on. Strudel the engine is AGPL-3.0, but a rendered recording is not a derivative of
the engine, the same way a document is not a derivative of the word processor. The gate
for a shipped recording is the **samples** each patch draws on. This file accounts for
every sound and says which are settled and which are not.

## What each track uses

| Track | Drums | Melodic / bass | Pure synth |
|---|---|---|---|
| Disco | `RolandTR909` kick, open-hat, clap | `gm_synth_strings_1`, `gm_synth_bass_1` | — |
| Piano | `RolandTR909` kick | `gm_epiano1`, `gm_synth_bass_1` | — |
| Funky | `RolandTR808` kick, snare, hats | `gm_clavinet`, `gm_synth_bass_1` | — |
| Techno-ish | `RolandTR909` kick, hats, open-hat | `gm_pad_metallic` | `sawtooth` bass |

## The three sources, and where each stands

**Pure synth (`sawtooth`).** A WebAudio oscillator. No sample, no recording, no licence
question. The Techno-ish bass is the only fully-synth voice here.

**GM soundfont (`gm_*`).** Strudel's General MIDI voices derive from two soundfonts:
FluidR3_GM (Frank Wen, MIT) and GeneralUser GS (S. Christian Collins, the GeneralUser GS
licence). Both permit use of the *rendered sound* freely, including in a commercial
release; the GeneralUser licence restricts reselling the soundfont file itself, which
this project does not do. Rendering audio through them and shipping that audio is inside
both licences.
- FluidR3_GM: https://member.keymusician.com/Member/FluidR3_GM/index.html (MIT)
- GeneralUser GS: https://schristiancollins.com/generaluser.php

**Drum machines (`RolandTR909`, `RolandTR808`).** From ritchse/tidal-drum-machines, the
library Strudel loads for drum banks. The repository states no licence for these banks,
and the samples are one-shot recordings of Roland hardware. This is the unsettled item:
single percussive one-shots are widely treated as not copyrightable as such, and these
packs are redistributed across the whole TidalCycles/Strudel ecosystem, but there is no
licence file to point at.
- https://github.com/ritchse/tidal-drum-machines

## Bottom line

Three of the four tracks depend on drum-machine one-shots whose licence nobody can point
at. For a free game that is the same footing the wider live-coding ecosystem stands on.
For a paid store page it is the one thing to settle first.

Two ways to settle it, either of which clears the gate:

1. **Confirm the drum-machine terms** with the tidal-drum-machines maintainer, or swap in
   a drum pack whose licence is written down (VCSL percussion is CC0, for example).
2. **Render the drums from pure synth** instead of the TR banks — a synth kick, a noise
   snare, a filtered-noise hat — which removes every sample question at the cost of the
   vintage-machine character. The patches in this folder are where that change is made.

The melodic and bass voices (GM soundfont) and the one synth bass carry no such question
and need no action.
