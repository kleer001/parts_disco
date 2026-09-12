// What can play under the board.
//
// Each track is a Strudel re-scoring of one of the four CC0 loops the game grew up on:
// the original was deconstructed by FFT (tempo, drum grid, bass motion, harmony), then
// rebuilt from that measurement with a new instrument palette and rendered offline. The
// patch each one came from is in `research/strudel-covers/`, beside the deconstruction
// and the CC0 originals it descends from.
//
// The numbers are measured, not chosen. A render is cut to a whole number of bars, so
// `startSec` is 0 and `endSec` is the loop length; the render carries a few tens of
// milliseconds of the next bar past `endSec`, which is what the loop crossfade in
// `audio.js` blends the head against. `gain` brings each track to a common bed
// (-18 LUFS), so one does not leave the board shouting while the next buries it.
//
// Rights: Strudel the engine is AGPL, but a rendered recording is not a derivative of
// it. The gate is the built-in samples each patch uses (drum machines, GM soundfont) --
// pure synth voices carry no sample question. `research/strudel-covers/PROVENANCE.md`
// accounts for every sound and is the thing to settle before a store page.

/** Where the loops live, relative to the page -- the same rule the views follow. */
export const MUSIC_ROOT = 'assets/music';

/**
 * `master` says the file is the published master. These renders are masters -- offline,
 * deterministic, cut to the bar -- not the account-free previews the originals were.
 */
export const TRACKS = [
  { name: 'Funky', file: 'funky.ogg',
    startSec: 0.0, endSec: 13.0957, gain: 0.9441,
    bpm: 109.96, bars: 6,
    by: 'Strudel re-scoring of Fupi (CC0)', licence: 'see strudel-covers/PROVENANCE.md',
    source: 'research/strudel-covers/funky.strudel',
    master: true },
  { name: 'Techno-ish', file: 'techno-ish.ogg',
    startSec: 0.0, endSec: 7.988, gain: 2.6002,
    bpm: 120.18, bars: 4,
    by: 'Strudel re-scoring of deleted_user_9051603 (CC0)', licence: 'see strudel-covers/PROVENANCE.md',
    source: 'research/strudel-covers/techno-ish.strudel',
    master: true },
  { name: 'Disco', file: 'disco.ogg',
    startSec: 0.0, endSec: 7.988, gain: 0.4898,
    bpm: 120.18, bars: 4,
    by: 'Strudel re-scoring of josefpres (CC0)', licence: 'see strudel-covers/PROVENANCE.md',
    source: 'research/strudel-covers/disco.strudel',
    master: true },
  { name: 'Piano', file: 'piano.ogg',
    startSec: 0.0, endSec: 7.9874, gain: 0.6918,
    bpm: 120.19, bars: 4,
    by: 'Strudel re-scoring of bassimat (CC0)', licence: 'see strudel-covers/PROVENANCE.md',
    source: 'research/strudel-covers/piano.strudel',
    master: true },
];
