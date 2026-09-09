// What can play under the board.
//
// Every track is CC0 -- public domain, nothing owed -- and the provenance is kept
// anyway, because a file whose licence nobody can point at is one nobody can answer
// for later.
//
// The numbers are measured, not chosen. `startSec` and `endSec` are the bar-aligned
// trim: none of these was published cut to a whole bar, and coming round a few tens
// of milliseconds early drags the pulse forward on every repeat. `gain` brings the
// track to the same bed as the others -- as published they sit nearly thirteen
// decibels apart, so without it one leaves the board shouting and the next buries it.
//
// `research/disco-loops/` is where all of that was measured and where a new candidate
// would be put through the same mill.

/** Where the loops live, relative to the page -- the same rule the views follow. */
export const MUSIC_ROOT = 'assets/music';

/**
 * `master` says the file is the published master. False means it is a preview, which
 * is what a Freesound account-free download gives you: good enough to play and to
 * choose by, and the thing to replace before a store page.
 */
export const TRACKS = [
  { name: 'Funky', file: 'funky.ogg',
    startSec: 0.0, endSec: 130.961, gain: 0.8035,
    bpm: 110.0, bars: 60,
    by: 'Fupi', licence: 'CC0', source: 'https://opengameart.org/content/funky-disco-beats-to-boogiewoogie-to',
    master: true },
  { name: 'Techno-ish', file: 'techno-ish.ogg',
    startSec: 0.0, endSec: 7.988, gain: 2.6607,
    bpm: 120.2, bars: 4,
    by: 'deleted_user_9051603', licence: 'CC0', source: 'https://freesound.org/s/447576/',
    master: false },
  { name: 'Disco', file: 'disco.ogg',
    startSec: 0.004, endSec: 31.955, gain: 1.0471,
    bpm: 120.2, bars: 16,
    by: 'josefpres', licence: 'CC0', source: 'https://freesound.org/s/572397/',
    master: false },
  { name: 'Piano', file: 'piano.ogg',
    startSec: 0.006, endSec: 15.981, gain: 0.6166,
    bpm: 120.2, bars: 8,
    by: 'bassimat', licence: 'CC0', source: 'https://freesound.org/s/832693/',
    master: false },
];
