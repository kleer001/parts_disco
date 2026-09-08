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
| `juice.html` | Every visual effect, on a real board, with each knob on a slider. Carries the semantic swatch strip and a settings block to copy out. |
| `build_artifact.py` | Bakes the page into one self-contained file — the modules, all 96 views, the renders and the font inlined. Run it after any change; never edit the baked file. |

The page drives the game's own layers. `src/juice.js` holds the envelopes, the
semantic ramp and `TUNING`; every layer factory in `src/layers.js` takes a settings
function and falls back to `TUNING` when it is not given one, which is how the game
runs them. The **shipped** preset is `TUNING`, so the page always opens on what the
game is doing now.

## What the sandbox holds

**The find pulse.** A found vehicle grows past its size and settles, shakes out of
the same envelope, and strobes between the semantic green and the colour it is about
to keep. One clock drives all three, so the colour cannot finish while the shape is
still moving.

**Escalation.** The nth find of a round is louder than the first, up to a cap. The
cap is the knob that decides where more stops reading as more.

**Hit stop.** The clock can be told to stand still, which stops the whole board
rather than the effect that asked for it.

**The card.** The asked-for vehicle sits on a card with a shadow. The card hangs
straight at rest and flinches when the board answers — a shift, a rotation, and a
decay, over a total time. The named maximum tilt is the angle the find that ends the
round reaches; every other find gets the share its own amplitude asks for.

**The ground.** A ruled grid under a film of noise, baked into a tile and cut to the
ground regions so the vehicles stay clean line drawings. The noise is seeded, so the
paper is the same every run.

The cell tightens across the sixteen stages, so the ground says how deep the board
is. The interpolation is geometric rather than linear, because a size is read as a
ratio: an even ratio per stage is what reads as an even tightening, where even pixel
steps would barely change for most of the path and then collapse over the last few
stages. The curve knob shapes where along the path that ratio is spent.

**Wells.** The board and the panel's dial block sit in recesses rather than lying on
the page.

**The panel.** VT323 throughout, and every number on a slab tinted by what it means.

## Where the effects draw

Each one either draws over the board or replaces the panel. None of them writes board
pixels, so the still-board hold in `src/layers.js` keeps its blit. Measured on stage
4:4 — 120 vehicles, one ink, the densest board the path deals:

| | paint per frame |
|---|---|
| nothing moving | 0.22ms |
| one vehicle at the peak of its pulse | 5.8ms |

The ground costs nothing per frame because the cut tile is kept and blitted; it is
rebuilt when the stage or the plan changes.

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
