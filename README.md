# parts disco

A hundred outlined nonsense words, stacked until the field is a thicket. A panel
names one. Find it.

The alphabet is `oeasplbqdc`, chosen for how the letters look rather than what they
spell: `b`, `d`, `p` and `q` are the same two strokes rotated, and `o`, `e`, `a`, `c`
are the same ring closed to different degrees. A word built only from these is hard to
tell from its neighbour at a glance, which is the point — the search has to be a read,
not a shape-match.

A browser game raised in [Trace ROM Studio](https://github.com/kleer001/trace_rom_studio).
Vanilla JS, ES modules, no build step, no dependencies.

## Run

```sh
./run.sh          # serves http://localhost:8000, no-cache
./run.sh 9000     # pick a port; it scans upward if that one is busy
npm test          # node --test, no framework
```

Open the URL it prints. Don't open `index.html` from the filesystem — ES modules,
`fetch` and relative paths all behave differently under `file://`.

## How it fits together

Everything below the renderer is pure: no module but `main.js` touches the DOM, a
clock or an event, which is what lets the whole board be tested without a browser.

- `src/words.js` — the vocabulary. Consonant/vowel shapes per length, so the nonsense
  is sayable; seeded, so a seed reproduces it exactly.
- `src/board.js` — places words on a grid, and settles which of them a click can
  actually reach.
- `src/drift.js` — where a word sits at time *t*, solved rather than stepped.
- `src/geometry.js` — polygon containment, for hit-testing.
- `src/game.js` — what is being asked for, and what a click did about it.
- `src/layers.js`, `src/compositor.js` — ordered draw passes over one canvas.
- `src/main.js` — the only file with a DOM in it. Measures the words, wires the loop.
- `word-preview.html` — the field with live controls for font size, stroke weight and
  grid jitter. For tuning the look without editing constants.

Tuning lives in `BOARD_DEFAULTS` (`src/board.js`), not in the logic. Font size is a
fraction of the field, so the board scales with the canvas.

**The board holds still.** Motion is a tuning value rather than a code path: `drift`
is zero, and `drift.js` is still what works out every position, so turning the board
into a moving one is a change to that number.

**Solvability is settled when the board is built.** At this density some words are
buried by later ones and no click can reach them, so the prompt never asks for one and
the tally never counts one. That check runs once, over the placement — lifting a word
to the top when it happens to be asked for would read as the world rearranging itself
to help.

## `tools/` and `research/` — the patent pipeline

The game began as a find-it board made of traced patent figures, and that pipeline
works and is kept, though nothing in the game reads from it now.

- `tools/patent_harvest` — patent number in, page renders and a `numeral -> part name`
  table out, read off the specification's own prose.
- `tools/figure_trace` — cuts the individual figures off a drawing sheet and traces
  them to SVG.
- `research/` — where the art can come from, what the CPC drawers hold, and how the
  sources were checked.

Both tools are offline and Python; nothing they produce ships with the game. Their
READMEs carry the details, including the two measured facts about `potrace`'s input
that fail silently when you get them wrong.

## What is written down

- `DECISIONS.md` — what was ruled and what was rejected, terse and undated.
- `DECISIONS-JOURNAL.md` — the dated reasoning behind each, append-only.
- `.trace_rom_studio.toml` — the studio version this game descends from, and where to
  find that studio.
- `LICENSE` — MIT.

## Where it is

Prototype. The loop runs and the board draws; nobody but its author has played it.
Open questions are whether the search is fun at all, how many words and how large the
type should be — density and findability trade directly against each other — and
whether a drifting board beats a still one.
