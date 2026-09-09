# dev — tuning instruments

Browser pages that drive the game's own board and rendering code with the knobs
exposed. They are not the game, and nothing in `src/` imports them. They exist so a
value can be chosen by looking at it rather than guessed at.

Serve the repo root and open them — never as a `file://` path, since they import
from `../src/` as ES modules:

```sh
./run.sh
# then open /dev/juice.html
```

| | |
|---|---|
| `juice.html` | The effects that answer a click, on a real board, driven from sliders. Carries the semantic swatch strip and a settings block to copy out. |
| `panel.html` | The panel's two papers, drawn at both shapes the panel takes. No board, no clock. |
| `build_artifact.py` | Bakes `juice.html` into one self-contained file — the modules, all 96 views, the renders and the font inlined. Run it after any change; never edit the baked file. |

A bench carries sliders for what is still being chosen. A knob that has been settled
comes off the page and stays in `TUNING`, where it can be edited or put back on a
bench if the question reopens.

The page drives the game's own layers. `src/juice.js` holds the envelopes, the
semantic ramp and `TUNING`; every layer factory in `src/layers.js` takes a settings
function and falls back to `TUNING` when it is not given one, which is how the game
runs them. The **shipped** preset is `TUNING`, so the page always opens on what the
game is doing now.

## What the juice bench holds

**The wipe.** A level is taken off the screen on the grid the *arriving* level rules,
which is how a stage says how dense it is before it is playable. Lanes open at their
own moments and land together; within a lane the cells open along the grid, each
square growing into its cell; and a square finishes growing before the next opens,
which is the wait on the line. `most squares` caps how many the wipe shows along the
long edge — above that it opens every kth ruled cell, still on the grid, at a coarser
beat.

**The meter.** The needle is thrown past its reading when a wrong vehicle is charged
for, and rings down. A bar that simply becomes longer reads as a number being set.

**The wrong click.** A refused vehicle takes a wash of light grey, on in a snap and
off slowly. It does not move: a find is the board answering and a wrong click is it
going quiet, so the two are told apart by what they do and not only by their colour.

## What the panel bench holds

The panel has two papers, both made by `ruledTile` in `src/layers.js` — the same
function that rules the board's ground.

**One sheet under the whole panel.** The card, the readout and the dials are pressed
into it: a partial wash of their own colour under a sunk edge, so the rules run on
behind all three. `wash` is how far a block lightens the sheet — at 0 only the sunk
edge says a block is there, at 1 the block is solid and the sheet stops at its edge.

**A sheet inside the card.** The asked-for vehicle stands on it. The render is
multiplied onto the card rather than drawn over it, because the renders carry an
opaque white ground — drawn over, the paper survives only in the card's margin and not
behind the vehicle, which is the one place it is wanted.

The two shapes come from `layoutFor`, asked for a desktop and a phone, so the bench
draws the rectangles the game really hands the panel rather than invented ones. A
desktop puts the panel down the right-hand side and the card sits inside the readout's
block; a phone puts it across the bottom and the card sits beside it.

The grain is shared with the ground and is not repeated on this bench — it is
`grain px` on the juice bench.

## Where the effects draw

Each one either draws over the board or replaces the panel. None of them writes board
pixels, so the still-board hold in `src/layers.js` keeps its blit. Measured on stage
4:4 — 120 vehicles, one ink, the densest board the path deals:

| | paint per frame |
|---|---|
| nothing moving | 0.22ms |
| one vehicle at the peak of its pulse | 5.8ms |
| the panel, paper included | 0.20ms |
| the wipe, at any grid | 0.04ms |

The ground costs nothing per frame because the cut tile is kept and blitted; it is
rebuilt when the stage or the plan changes. The panel's papers are the same bargain —
a tile is made when a knob moves, every frame after that is a pattern fill, and the
card's sheet is baked into the card alongside the render. The wipe is one clip and one blit however many squares are in the air.

The pulse figure tracks the grow: it is the cost of filling and stroking one vehicle
at whatever size the envelope has taken it to, and the escalation multiplies that
again for the finds late in a round. It was 0.66ms at a grow of 1.14.

## The semantic ramp

`SEMANTIC` in `juice.js` is solved, not picked. `research/semantic_ramp.py` prints
every figure quoted there and is the thing to re-run when a role moves.

The board's own palette cannot carry meaning — `src/paint.js` assigns inks so that no
two touching regions share one, which spends every ink on the puzzle. So meaning
lives on the panel, and lightness carries it while hue only confirms it. An
equal-lightness ramp puts `found` and `miss` 0.021 apart in OKLab under simulated
deuteranopia, which is the same colour.

One measured limit: `found` and `last` sit 0.056 apart under protanopia. Green and
amber converge there. They are never the same kind of element, and `last` is carried
by scale as well as colour, but that pair is read by position rather than by hue.

## Driving a round from the page

Finding a vehicle by hand every time makes a slider unusable, so the round can be
driven: **find one** adds a single find, **leave one** finds everything but the last
so the big flinch can be watched, and **win it** runs the round out. **panel at
shipped values** draws the panel from `TUNING` instead of the sliders, which is the A
against the B.
