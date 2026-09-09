# disco loops — candidates and how they were found

A shortlist of **CC0** disco and funk loops for the game to play under a board, with
what each one measures and a page to judge them on by ear.

Everything here is public domain. No attribution is owed for any of it. Provenance is
still recorded per candidate, because a file with no licence trail is one nobody can
answer for later.

## Using it

```sh
./run.sh                      # from the repo root
# open /research/disco-loops/index.html
```

The page needs the audio, which is not in the repository — it is a couple of hundred
megabytes of other people's music. Fetch it:

```sh
python3 research/disco-loops/harvest.py     # OpenGameArt entry pages
python3 research/disco-loops/download.py    # one audio file per entry
python3 research/disco-loops/freesound.py   # Freesound search, licences and previews
python3 research/disco-loops/build.py       # measures everything, writes loops.json
```

Each script caches to `tmp/loops/` and skips what is already there, so a re-run costs
only what is missing. Every request to a host is six seconds after the last one.

## What the two hosts hold

**Freesound** has loops: cut to a bar, usually with a bpm in the name. Its cards play
that site's `-lq` preview, because the master needs an account. That is fine to judge
by and CC0 puts no condition on using it, but fetch the master before shipping one.

**OpenGameArt**'s funk catalogue is mostly songs. They open cold, fade out and trail
up to four seconds of silence — looped as they stand, they tick once a bar forever.
Several are good grooves, so the page lets a region be looped out of the middle of one.

## What is measured, and what it is worth

Three things break a seamless loop, and all three can be counted:

| | |
|---|---|
| `headPadMs`, `tailPadMs` | Silence at either end. This is what makes a loop tick. |
| `tailOverHead` | The tail's level against the head's. Far below 1 is a fade-out — a track with an ending, not a loop. |
| `spliceStep` | The level step across the join, against the track's own peak, which is what is heard as a click. |

`spliceStep` is the weakest of the three and reads a single sample. A loop can step
hard and still sound right when the join lands on a downbeat, and a quiet join can
still click. It sorts the list; it does not decide anything.

The page is where it is decided, and it is built so the ear gets a fair hearing:
playback is Web Audio with `loop = true`, which is sample-accurate. An HTML `<audio
loop>` inserts a gap of its own in some browsers, which would make every candidate
sound broken.

## Where it stands

Of the candidates gathered, twelve loop as they stand — the rest carry at least one of
the three faults. `loops.json` holds the lot with its measurements, and the page's
filters cut to the clean ones, the short ones, or the ones named for the genre.
