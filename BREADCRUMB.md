fresh

## Summary

The game changed subject: it was outlined nonsense words, it is now vehicles. A board
of overlapping cars drawn as outlines and painted so no two touching regions share a
colour; a panel shows one of them rendered solid at an angle the board does not hold;
find every copy of it.

It plays end to end. Sixteen stages over four levels, click to find, a two-second win
that clears the losers and flashes the winners, then the next stage. What it does not
yet have is anything around the loop: no menu, no score, no sound, no end, no way in
or out. That is what "make it an actual game" means from here.

## Todos

### Parallel

- [ ] #1 Cache the composed board between frames. The layer still repaints all
  800x800 pixels and restrokes every car every frame; measured 36fps headless. The
  plan is already cached — what is missing is a snapshot blitted when nothing is
  animating. Invalidate on: a find, a blink still running, and the win.
- [ ] #2 Sound. The win was specced as "we'll add winning sounds later"; also wants a
  click, a wrong-click, and a find. No audio module exists yet.
- [ ] #3 A title screen and an end. The game starts mid-board on load and holds the
  last stage forever. Needs a way in, and something at stage 16.
- [ ] #4 Score or timer. Question 8 was answered "a for now" — find them all, next
  prompt, no clock. Revisit once it has been played.
- [ ] #5 Play the difficulty path start to finish and check the ramp. The numbers in
  src/levels.js were reasoned, not felt. Especially: is the jump at stage 9 (twins
  arrive) too steep, and is stage 16 at one ink actually playable.
- [ ] #6 Decide what to do about view-preview.html now restating most of src/. The
  reuse review flagged dart-throwing, region labelling, DSATUR and picking all
  duplicated. Either it imports from src/, or it is retired, or the duplication is
  accepted on purpose and written down.

### Sequential

- [ ] #7 Decide whether the board drifts. DECISIONS.md rules that every part drifts on
  its own heading and board drift is currently zero. Everything built assumes a still
  board.
- [ ] #8 (needs: #7) If it drifts, move to the WebGL renderer. Canvas2D is 14fps for a
  moving board at this density; the spike is 0.06ms/frame. gl-spike.html is complete
  and verified, research/WEBGL-RENDERER.md has every number.
- [ ] #9 (needs: #7) If it drifts, decide about line shimmer. Measured: a quarter-pixel
  move relocates 28% of the ink, because a 1px unantialiased line cannot move a third
  of a pixel. Options are pixel-snapping, accepting it, or giving up the hard edge.
- [ ] #10 Write the new rulings into DECISIONS.md and DECISIONS-JOURNAL.md. Several
  calls were made this session and none are written down: poisson over relaxation,
  colour as a difficulty dial, ground regions sharing the car palette, the fleet tiers.

## Context

**Where things live.** `src/` is the game: `views.js` loads the fleet, `board.js` deals
and throws, `paint.js` colours the map, `game.js` holds the round, `levels.js` is the
difficulty path as data, `layers.js` draws, `main.js` wires it. `assets/views/` holds
96 views (12 models x 8 angles) at 2.3MB — strokes, silhouette, and a 1-bit shaded
render each. `tools/model_views/` makes them from a GLB.

**The fleet is Kenney's Car Kit, CC0.** Four bodies share a shell — sedan,
sedan-sports, taxi, police — and that is the whole difficulty. `src/levels.js` groups
the fleet into loud / plain / twins and the path walks through them.

**Three things in the art pipeline that fail silently**, all in
`tools/model_views/README.md`: Blender's Grease Pencil SVG exporter does not agree
with the camera; a Line Art bake walks the whole frame range and returns 250 copies of
one view; and welding a glTF closes the UV seams, which costs every windscreen,
headlight, grille and tyre tread. The seams are most of the drawing — 1,592 of them
against 375 creases on a sedan.

**Why five inks and not four.** Cars and ground are one flat map, but four colours only
suffice when every region is in one piece, and a car in front cuts the one behind into
two halves that must share a colour. 17 of 70 are cut like that on a full board.
Measured: 3 inks forces 39 clashes, 4 forces 3, 5 forces none.

**Layout is dart-throwing, not relaxation.** Bridson with a radius per car. The
separation is searched for rather than set, because throwing covers only the ground its
separation reaches — so the car count is the only density control, and burying deeper
means dealing more. Nearest-neighbour spread 0.09 against relaxation's 0.24.

**The WebGL spike is done and parked.** `gl-spike.html` plus
`tools/model_views/export_mesh.py`. Geometry for the whole fleet is ~260KB against
2,548KB baked, and it does not grow when angles are added. Crease edges alone are not
enough — both adjacent face normals ride on each edge and the vertex shader decides
contour per frame.

**Verification habit worth keeping.** Nearly every finding this session came from
measuring rather than looking: the diff of two renders found the missing UV seams, a
sub-pixel nudge quantified the shimmer, and clicking the revealed answers proved
picking. The bench (`view-preview.html`) and the spike both exist to be measured.

## Next Step

#5 — play the sixteen stages through and see whether the ramp is a ramp. Everything
else on this list is machinery around a loop whose difficulty curve has never been
felt, and #3, #4 and #7 all get easier to answer once it has been.

/home/menser/Dropbox/ai/code/parts_disco
