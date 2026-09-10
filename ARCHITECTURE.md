# How parts disco fits together

Developer notes. If you came to play it, the game is at
[kleer001.github.io/parts_disco](https://kleer001.github.io/parts_disco/).

## Running it

No build step and no dependencies. Clone it and serve the folder.

```sh
./run.sh          # serves http://localhost:8000
./run.sh 9000     # pick a port; it scans upward if that one is busy
npm test          # node --test, no framework
```

Open the address it prints. Do not double-click `index.html` — ES modules, `fetch`
and relative paths all behave differently under `file://`.

Every draw in game logic comes from `mulberry32`, so a board reproduces exactly from
its seed. `dev/README.md` covers the tuning bench.

## The modules

Everything below the renderer is pure: no module but `main.js` and `options.js`
touches the DOM, a clock or an event, which is what lets the whole board be tested
without a browser.
`layers.js` and `audio.js` are the two boundaries onto a device -- the canvas and the
audio graph -- and neither reads the round; they are handed what to draw and say.

| | |
|---|---|
| `src/views.js` | The fleet. A view is one vehicle from one angle: outline strokes, a silhouette, and a solid render of the same angle for the panel to ask with. |
| `src/board.js` | Deals a board and throws it onto the field. |
| `src/paint.js` | The colouring, as a map: which regions exist, which share a border, and which ink each one takes. |
| `src/game.js` | What is being asked for, what a click did about it, and how far through the win the board is. |
| `src/levels.js` | The difficulty path. Data only. |
| `src/meter.js` | The run's damage: what a wrong vehicle costs where, and when a life is spent. Pure. |
| `src/juice.js` | How the board answers: the tuning, the envelopes, and the colours that carry meaning. Pure. |
| `src/geometry.js` | Polygon containment, for hit-testing. |
| `src/layout.js` | Where the board and the panel sit, given a viewport. Pure. |
| `src/layers.js`, `src/compositor.js` | Ordered draw passes over one canvas. The wipe among them leaves on the grid the arriving level rules. |
| `src/rng.js` | `mulberry32`. Every draw in game logic comes from here, so a run reproduces from its seed. |
| `src/audio.js` | The voice: a table of beeps made from an oscillator, a find that climbs on a Shepard tone, and the one recorded win. Also the desk — a music bus and an effects bus into a master, with the music ducking out of the way of every effect. |
| `src/music.js` | What can play under the board: the loops, their bar-aligned trim, and the gain that brings each to the same bed. Data only. |
| `src/options.js` | The options panel. The one part of the game that is HTML rather than canvas. |
| `src/run.js` | A run: the stage it stands on, the board it dealt, and the damage taken so far. What the game and the juice bench both drive, so the bench tunes against the board that ships. |
| `src/main.js` | Loads the fleet, wires the loop, and raises the options panel. |

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

## The board and the panel turn against each other

`src/layout.js` takes the viewport and returns two rectangles. On a screen taller
than it is wide the board takes the top and the panel runs full width beneath it; on
a wider one the panel goes down the right-hand side. Nothing else in the game knows
which — the panel lays itself out from the rectangle it is handed, in two columns
beside the card when that rectangle is wide and in one column under it when it is
tall.

The canvas takes the screen's own device pixels, capped by a pixel budget, and CSS
scales it the rest of the way. The cap is a repaint cost, not a sharpness choice: the
board is painted a pixel at a time. Asking for fewer pixels than the screen has is
what makes the panel's halftone render break up, because the browser then scales the
canvas up and an upscale sharpens exactly the dither a downscale averages away.

A vehicle's size comes off the field's **short** edge, so it looks the same in a tall
field as a wide one. Turning the phone re-deals the stage rather than stretching it —
the vehicles were thrown into a field of a particular shape, and there is no honest
way to carry that arrangement into a different one.

## The board is held between frames

Nothing on the board moves under its own steam, so the drawn board is kept and put
back down: most frames are the same picture as the last one. It is rebuilt when the
map changes or a vehicle is found. Everything that does move — the ground texture, the
pulse a found vehicle answers with — draws over the top in its own layer, which is why
the hold survives.

Measured at the densest stage, 120 vehicles, on an 800x800 field: 0.22ms for a still
frame, 5.8ms for a frame with one vehicle at the peak of its pulse. Both scale with
the field's pixel count, which the viewport now sets — the per-pixel repaint runs
1.6ms over 0.64M pixels and 2.4ms over 0.96M.

Do not trust frames per second measured in a headless browser. It throttles animation
frames and will report single digits for a board that is working fine. Time the
operations directly instead.

## The difficulty path

Sixteen stages, four to a level. A level is one idea about what is hard; within a
level the numbers tighten. `src/levels.js` is the whole of it, and the panel shows
every dial against its range.

| dial | |
|---|---|
| **which vehicles** | The strongest by a distance. A tractor is found instantly however many cars surround it; a taxi is hard on an empty board. |
| **how many** | Ten at the start, a hundred and twenty at the end. More to look at, and more burying each other. |
| **how big** | Smaller is harder twice over — less of the detail that tells two shells apart, and more of them fitting on the field. |
| **how many inks** | Five is enough for every two touching regions to differ. Below that they are forced to share, and a vehicle begins to merge into whatever it lies on. |

![The first stage: ten large vehicles, six inks, asking for a tractor.](screens/early.png)

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

## Where this came from

Raised in [Trace ROM Studio](https://github.com/kleer001/trace_rom_studio).

## What is written down

- `DECISIONS.md` — what was ruled and what was rejected, terse and undated.
- `DECISIONS-JOURNAL.md` — the dated reasoning behind each, append-only.
- `.trace_rom_studio.toml` — the studio version this game descends from.
