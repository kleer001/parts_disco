# How parts disco fits together

Everything below the renderer is pure: no module but `main.js` touches the DOM, a
clock or an event, which is what lets the whole board be tested without a browser.

| | |
|---|---|
| `src/views.js` | The fleet. A view is one vehicle from one angle: outline strokes, a silhouette, and a solid render of the same angle for the panel to ask with. |
| `src/board.js` | Deals a board and throws it onto the field. |
| `src/paint.js` | The colouring, as a map: which regions exist, which share a border, and which ink each one takes. |
| `src/game.js` | What is being asked for, what a click did about it, and how far through the win the board is. |
| `src/levels.js` | The difficulty path. Data only. |
| `src/juice.js` | How the board answers: the tuning, the envelopes, and the colours that carry meaning. Pure. |
| `src/geometry.js` | Polygon containment, for hit-testing. |
| `src/layers.js`, `src/compositor.js` | Ordered draw passes over one canvas. |
| `src/rng.js` | `mulberry32`. Every draw in game logic comes from here, so a run reproduces from its seed. |
| `src/main.js` | The only file with a DOM in it. Loads the fleet, wires the loop. |

## The board is thrown, not arranged

Each vehicle stands in for itself as a circle no wider than the short edge of its ink,
and cars are thrown into the rings around cars already down until every one has a
place. The circle is far smaller than the vehicle on purpose: two cars whose circles
have just stopped touching are already deep into one another, which is the board this
game wants. The separation is searched for rather than set, because throwing covers
only the ground its separation reaches — so the count is what sets density, and
burying the cars deeper means dealing more of them.

## The colours are a map, not a palette

Cars and the bare ground between them are one flat subdivision, so they are coloured
as one: no two regions sharing a border get the same ink. Four inks colour any flat
map whose every region is in one piece, and a car here need not be — a vehicle in
front cuts the one behind into two halves that still have to carry one colour. On a
full board seventeen of seventy are cut like that, which is why five inks is where it
stops arguing. Below five the board runs out and regions are forced to share, and that
is the hardest thing the difficulty path does.

This is also why the panel is coloured from a separate ramp. Every ink on the board is
spent on the puzzle, so none of them is free to mean "found" or "wrong". Meaning lives
off the board, in `SEMANTIC` in `src/juice.js`.

## The board is held between frames

Nothing on the board moves under its own steam, so the drawn board is kept and put
back down: most frames are the same picture as the last one. It is rebuilt when the
map changes or a vehicle is found. Everything that does move — the ground texture, the
pulse a found vehicle answers with — draws over the top in its own layer, which is why
the hold survives.

Measured at the densest stage, 120 vehicles: 0.22ms for a still frame, 5.8ms for a
frame with one vehicle at the peak of its pulse.

Do not trust frames per second measured in a headless browser. It throttles animation
frames and will report single digits for a board that is working fine. Time the
operations directly instead.

## The difficulty path

Sixteen stages, four to a level. A level is one idea about what is hard; within a
level the numbers tighten. Four dials move: which vehicles are in play, how many, how
big, and how many inks the board may use. `src/levels.js` is the whole of it, and the
panel shows every dial against its range.

Which vehicles matters most by a distance. A tractor is found instantly however many
cars surround it; a taxi is hard on an empty board.

## The bench

`dev/juice.html` runs a real board with every tuning knob on a slider, and drives the
game's own layers rather than a copy of them. `dev/README.md` covers it. Its **shipped**
preset is `TUNING` from `src/juice.js`, so it always opens on what the game is doing.

`research/semantic_ramp.py` solves the panel's colour ramp and prints the contrast and
colour-vision figures that justify it.

## `tools/` and `research/`

- `tools/model_views` — turns a 3D model into what the board needs: outline strokes
  traced from Blender's Line Art, a silhouette taken from the render's own alpha, and
  a 1-bit shaded view for the panel. Its README carries the three things that fail
  silently, including the one that costs you every windscreen, headlight and grille.
- `tools/model_views/export_mesh.py` — the same models as raw geometry, for a
  renderer that draws them live rather than from baked angles.
- `tools/patent_harvest`, `tools/figure_trace` — the pipeline this game began with,
  when the board was made of traced patent figures. Kept, and not read by the game.
- `research/` — where the art can come from, what was measured about drawing the board
  in WebGL instead of baking it, and how the panel's colours were solved.

Both tool sets are offline and Python; nothing they produce ships except the views in
`assets/`.

## What is written down

- `DECISIONS.md` — what was ruled and what was rejected, terse and undated.
- `DECISIONS-JOURNAL.md` — the dated reasoning behind each, append-only.
- `.trace_rom_studio.toml` — the studio version this game descends from.
