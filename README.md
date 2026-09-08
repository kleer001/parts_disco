# parts disco

A yard full of vehicles, drawn as outlines and painted so that no two touching
things share a colour. A panel shows you one of them, solid, from an angle the yard
does not contain. Find every copy of it.

The catch is the fleet. Four of the twelve bodies are the same shell with different
trim — a sedan, a sports sedan, a taxi and a police car — and from the front they
differ by a roof sign and nothing else. So the work is never seeing the vehicles;
it is telling them apart.

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

- `src/views.js` — the fleet. A view is one vehicle from one angle: outline strokes,
  a silhouette, and a solid render of the same angle for the panel to ask with.
- `src/board.js` — deals a board and throws it onto the field.
- `src/paint.js` — the colouring, as a map: which regions exist, which share a
  border, and which ink each one takes.
- `src/game.js` — what is being asked for, what a click did about it, and how far
  through the win the board is.
- `src/levels.js` — the difficulty path. Data only.
- `src/geometry.js` — polygon containment, for hit-testing.
- `src/layers.js`, `src/compositor.js` — ordered draw passes over one canvas.
- `src/main.js` — the only file with a DOM in it. Loads the fleet, wires the loop.
- `view-preview.html` — the bench: the same board with every dial exposed, for
  tuning the look and the difficulty without editing constants.

**The board is thrown, not arranged.** Each vehicle stands in for itself as a circle
no wider than the short edge of its ink, and cars are thrown into the rings around
cars already down until every one has a place. The circle is far smaller than the
vehicle on purpose: two cars whose circles have just stopped touching are already
deep into one another, which is the board this game wants. The separation is
searched for rather than set, because throwing covers only the ground its separation
reaches — so the count is what sets density, and burying the cars deeper means
dealing more of them.

**The colours are a map, not a palette.** Cars and the bare ground between them are
one flat subdivision, so they are coloured as one: no two regions sharing a border
get the same ink. Four inks colour any flat map whose every region is in one piece,
and a car here need not be — a vehicle in front cuts the one behind into two halves
that still have to carry one colour. On a full board seventeen of seventy are cut
like that, which is why five inks is where it stops arguing. Below five the board
runs out and regions are forced to share, and that is the hardest thing the
difficulty path does.

## The difficulty path

Sixteen stages, four to a level. A level is one idea about what is hard; within a
level the numbers tighten. Four dials move: which vehicles are in play, how many,
how big, and how many inks the board may use. `src/levels.js` is the whole of it,
and the panel shows every dial against its range.

Which vehicles matters most by a distance. A tractor is found instantly however many
cars surround it; a taxi is hard on an empty board.

## `tools/` and `research/`

- `tools/model_views` — turns a 3D model into what the board needs: outline strokes
  traced from Blender's Line Art, a silhouette taken from the render's own alpha, and
  a 1-bit shaded view for the panel. Its README carries the three things that fail
  silently, including the one that costs you every windscreen, headlight and grille.
- `tools/model_views/export_mesh.py` — the same models as raw geometry, for a
  renderer that draws them live rather than from baked angles.
- `tools/patent_harvest`, `tools/figure_trace` — the pipeline this game began with,
  when the board was made of traced patent figures. Kept, and not read by the game.
- `research/` — where the art can come from, and what was measured about drawing the
  board in WebGL instead of baking it.

Both tool sets are offline and Python; nothing they produce ships except the views in
`assets/`.

## What is written down

- `DECISIONS.md` — what was ruled and what was rejected, terse and undated.
- `DECISIONS-JOURNAL.md` — the dated reasoning behind each, append-only.
- `.trace_rom_studio.toml` — the studio version this game descends from.
- `LICENSE` — MIT. The vehicles are Kenney's [Car Kit](https://kenney.nl/assets/car-kit), CC0.

## Where it is

Prototype. It plays: sixteen stages, a board a round, a win that clears the yard and
deals the next one. Nobody but its author has played it. Open questions are whether
the board should drift rather than hold still, whether the difficulty path climbs at
the right rate, and whether the near-twins are a good puzzle or an unfair one.
