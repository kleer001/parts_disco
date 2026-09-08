fresh

## Summary

The game got its juice, its public face, and a phone layout, and all of it is live.

A found vehicle now answers with a pulse drawn over the board — grow, shake, green
strobe — instead of the board blinking itself. The panel is set in VT323 with every
number on a slab tinted by what it means, the asked-for vehicle sits on a card that
flinches when the board answers, and the ground carries a ruled grid that tightens
across the sixteen stages. `dev/juice.html` is the bench all of it was tuned on, and
`src/juice.js` holds the numbers that were chosen.

The board and the panel now turn ninety degrees against each other: on a phone the
board takes the top and the panel runs full width beneath it. The canvas takes the
viewport's shape and the screen's device pixels rather than a fixed 1100x800.

It is public and playable at **https://kleer001.github.io/parts_disco/**, with a
player-facing README.

## Todos

### Parallel

- [ ] #12 Design tweaks, round two. The juice is in and tuned; what wants another
  pass is the panel's composition rather than its numbers — the tall panel still has
  dead space under the dials, and the wide one squeezes two columns into whatever the
  card leaves. Drive it from `dev/juice.html`.
- [ ] #13 Research more vehicle models. The fleet is twelve of Kenney's Car Kit
  (CC0). More models widen the "kinds" dial, and more *near-twins* are worth more than
  more loud ones — the twins tier is where the difficulty actually lives. Look at what
  else Kenney ships and at other CC0 vehicle kits; `tools/model_views/` is the pipeline
  that turns a GLB into the strokes, silhouette and 1-bit render the board needs.
- [ ] #2 Sound. No audio module exists. Wants a click, a wrong-click, a find, and a
  win. The find already has a shape to hang a sound on — the pulse envelope.
- [ ] #3 A title screen and an end. The game starts mid-board on load and holds the
  last stage forever.
- [ ] #4 Score or timer. Still "find them all, next prompt, no clock". Misses are
  counted and shown in red but do nothing.
- [ ] #5 Play the sixteen stages start to finish and feel the ramp. Never actually
  done. Especially: is the jump at stage 9 (twins arrive) too steep, and is stage 16
  at one ink playable.
- [ ] #14 Pull the run driver out of `main.js` so `dev/juice.html` stops carrying its
  own copy. ~60 near-identical lines: `proxyFor`, the scratch and held canvases,
  `replan`, `nextLevel`, the pointer handler and the frame loop. The bench is the
  instrument the tuning is chosen on, so a bench that has silently drifted from the
  game produces wrong numbers with nothing to catch it.
- [ ] #6 Decide what to do about `view-preview.html`. `dev/juice.html` now supersedes
  it and it still restates most of `src/`. Retire it, make it import from `src/`, or
  write down that the duplication is deliberate. Same call covers the other root
  clutter a visitor sees: `board-default.png` (847KB), `board.txt` (134KB),
  `gl-spike.html`, `word-preview.html` (from the nonsense-words era).

### Sequential

- [ ] #7 Decide whether the board drifts. Everything built assumes a still board, and
  that assumption is now load-bearing: the board layer keeps a cached bitmap and blits
  it, and every effect draws over the top rather than into it.
- [ ] #8 (needs: #7) If it drifts, move to the WebGL renderer. Canvas2D is 14fps for a
  moving board at this density; the spike is 0.06ms/frame. `gl-spike.html` is complete
  and verified, `research/WEBGL-RENDERER.md` has every number.
- [ ] #9 (needs: #7) If it drifts, decide about line shimmer. Measured: a quarter-pixel
  move relocates 28% of the ink, because a 1px unantialiased line cannot move a third
  of a pixel. Options are pixel-snapping, accepting it, or giving up the hard edge.
- [ ] #11 (needs: #7) If it drifts, the held board is dead — every frame is a different
  picture and the keeping is a copy paid for nothing. `createBoardLayer` requires its
  cache now, so this is a real change and not a flag.

## Context

**Where things live.** `src/` is the game: `views.js` loads the fleet, `board.js` deals
and throws, `paint.js` colours the map, `game.js` holds the round, `levels.js` is the
difficulty path as data, `juice.js` is the tuning and the envelopes, `layout.js` says
where the board and panel sit, `layers.js` draws, `main.js` wires it. `dev/juice.html`
is the tuning bench. `ARCHITECTURE.md` explains the lot; `README.md` is for players.

**Read `DECISIONS.md` before proposing anything structural.** Four rulings were written
this session, and one of them reverses the commit before it: the board's blink was
deleted in favour of a pulse drawn over the board. The box-repaint machinery it removed
looks like an obvious optimisation from the code alone.

**The tuning is in `src/juice.js` as `TUNING`.** Chosen on the bench, not reasoned
about. `dev/juice.html`'s **shipped** preset reads it, so the bench always opens on
what the game is doing. Every layer factory takes `settings = () => TUNING`, which is
how the bench overrides them live.

**The panel's colours are solved, not picked.** `research/semantic_ramp.py` prints
every figure. Lightness carries the valence and hue only confirms it, because five
roles at one lightness put found and miss 0.021 apart in OKLab under simulated
deuteranopia — the same colour. Re-run the script if a role moves.

**The prompt renders are 512x512 and one bit deep.** Every grey is a halftone. Scaling
one by a non-integer factor beats the dot grid against the pixel grid and puts white
diamonds across it, so the card halves the render down to 128 first. Anything new that
draws these has the same problem.

**Cost.** The board is repainted a pixel at a time, which is what `PIXEL_BUDGET` in
`layout.js` caps. Measured: 1.6ms over 0.64M pixels, 2.4ms over 0.96M. A still frame
is a blit at 0.22ms; one vehicle at the peak of its pulse was 5.8ms on an 800x800
field.

**Do not trust frames per second measured in a headless browser.** It throttles
animation frames — a frame-counted wait can span tens of real seconds. Time the
operations directly, and use wall-clock sleeps when driving the page.

**Publishing.** Pages serves `main` at root; every path in the game is relative so it
runs from the project subpath unchanged. `.nojekyll` is there. Verify a deploy by
hashing the served files against local, not by looking at the browser — a page loaded
mid-deploy leaves a mixed cache that reads like a broken build.

**The bench publishes too.** `python3 dev/build_artifact.py` bakes `dev/juice.html`
into one self-contained file (modules, all 96 views, the renders, the font) for
checking remotely. Its module list is hand-maintained — a new file in `src/` that the
bench imports has to be added to it. Live at
https://claude.ai/code/artifact/5dbf3d8f-9696-4098-87a3-cc9ba31bd0ce

**Copy decisions are recorded.** `.claude/skills/copy/plain/terms.md` holds the
plain-language calls for the README's reader, so the next run starts quiet. The player
half of the README says *yard*; *board* is developer vocabulary.

## Next Step

#5 — play the sixteen stages through and feel the ramp. It is the oldest open item,
everything about difficulty is still reasoned rather than felt, and #12's design tweaks
and #13's fleet research both get sharper once someone has actually played to the end.

/home/menser/Dropbox/ai/code/parts_disco
