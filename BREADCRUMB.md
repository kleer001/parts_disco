fresh

## Summary

parts disco is a browser search game — find the asked-for vehicle in a packed,
overlapping board — in vanilla JS, no build step, live at
**https://kleer001.github.io/parts_disco/**.

The fleet has grown from twelve cars into six themed groups (`food-kit`,
`glasses-pack`, `watercraft-kit`, `cute-fish`, `cube-pets`, and the vehicle `fleet`),
dealt down a sixteen-stage path (`levels.js`). The back half of the path repeats the
front half in silhouette; silhouette boards run through a fair-play judge
(`fairness.js`) that trims and re-stacks a deal until every shape reads.

This session's work, all pushed to `main`:
- **Bake camera reframed per model** — `render_views.py frame_camera` projects each
  model's vertices at every bake angle and frames to the widest reach, fixing chunky
  models (cube-pets overran 16%) that clipped in the prompt panel.
- **Prompt centred on its own ink** — `layers.js centreOnInk`, a translate not a resize,
  cached per card.
- **Level selector in the options panel** — a stage grid that jumps the run via
  `run.goTo`, keeps the seed, wipes the damage; hidden in endless (no `goTo`).
- **A found vehicle returns to the ground** — no fill, no lines; the grid layer counts
  its pixels as ground so grid + noise close over the void seamlessly; the find pulse
  dissolves into that ground. Replaces the old neutral-grey settle. See
  `DECISIONS-JOURNAL.md` [2026-09-14].

Earlier era still standing: an audio desk (`audio.js` music + sfx buses, ducking),
four CC0 music loops behind a switch (`music.js`), a run that can be lost
(`meter.js`: ten units, only wrong clicks charge), a title screen (`title.js`), and a
wipe that announces the arriving stage's density.

## Todos

### Parallel

- [ ] #15 Record the win chime's licence. `assets/sfx/win-chime.mp3` carries none, and
  `assets/sfx/README.md` still says none is recoverable. The owner knows the source; it
  needs writing down beside the file in the shape `music.js` uses for the music: author,
  licence, URL. Then that README becomes a credit rather than an open question.
- [ ] #21 Soften the ground-coloured found-voids on dense boards (optional, owner's
  call). Fully-gone found cars read as bare ground, which is seamless next to real
  ground but high-contrast against a saturated pile — a found car pops rather than
  vanishes. The lever is the void's tone: a faint grid-ink tint over the found footprint
  in `createBoardLayer`. Preview it in the sandbox before committing.
- [ ] #22 Decide the tracked `.pyc`. `tools/model_views/__pycache__/render_views.cpython-311.pyc`
  is gitignored bytecode that is nonetheless tracked from before — it shows as modified
  after any bake. Either `git rm --cached` it to stop tracking, or leave it. Not touched
  this session.
- [ ] #17 Playtest the meter and settle its two guesses: ten units of capacity, and a
  wrong vehicle falling from a whole unit to a quarter across the path. The asymmetry to
  watch: a stage's target count swings from 2 to 33, so two stages at the same point
  charge the same for very different numbers of clicks — dividing the cost by target
  count is the first thing to try if a stage is a wall. Credit for clearing a board is
  the dial if it is simply too harsh. (The new level selector jumps straight to any
  stage, which makes this cheaper to test.)
- [ ] #16 Tune the wrong-click wash and the wipe on `dev/juice.html`. The wash's three
  numbers and the wipe's stagger (0.34) and lead size (0.35) were chosen by reasoning,
  not by watching.
- [ ] #12 Design tweaks, round two, on `dev/panel.html`. The two papers are settled;
  what wants another pass is the panel's composition — the tall panel still has dead
  space under the dials.
- [ ] #20 Tabs in the options panel. Deferred deliberately — the body is one scrolling
  column (now `Sound`, `Music`, `Run`, `Level`), so this is splitting it rather than
  rebuilding it. The added level grid makes the column longer, so the case is a touch
  stronger than before.
- [ ] #3 A real end. The title screen now exists (`title.js`, wired in `main.js`), so
  the game no longer starts mid-board — what is still missing is a completion/ending
  when a run is won: the levels loop with nothing that says "you finished."
- [ ] #4 Score or timer. Losing exists; winning is unscored and unclocked.
- [ ] #5 Play the sixteen stages start to finish and feel the ramp — especially whether
  stage 9's jump (twins arrive) is too steep and whether stage 16 at one ink is playable.

## Context

**Concurrent-session constraint.** Another session has been editing `fairness.js`,
`run.js`, and `tests/fairness.test.js` (the fair-play judge). This session scoped its
work away from those three files and committed none of them. Check `git status` before
touching them.

**Where things live.** `src/`: `views.js` loads the fleet, `board.js` deals and throws,
`paint.js` colours the map, `game.js` holds the round, `levels.js` is the difficulty
path as data, `fairness.js` is the silhouette fair-play judge, `groups.js` shuffles which
group each stage deals from, `meter.js` is the run's damage, `juice.js` is tuning and
envelopes, `run.js` is a run and what it dealt, `audio.js` is the voice *and* the desk,
`music.js` is the track table, `layout.js` says where things sit, `layers.js` draws,
`options.js` is the panel, `title.js` is the opening, `belt.js` is the endless mode,
`main.js` wires it. Benches under `dev/`. `ARCHITECTURE.md` explains the lot.

**Read `DECISIONS.md` before proposing anything structural**, and `DECISIONS-JOURNAL.md`
for why — the losing option often looks obvious from the code alone. The found-vehicle
ruling was just reversed there (grey settle → return to the ground).

**Found-vehicle rendering (this session).** Threaded through `layers.js`:
`createBoardLayer` (`restingOf` paints found regions as ground; `solid` draws found cars
with the ground fill and no lines, still in z-order so they occlude), `createGridLayer`
(`buildMask` counts found pixels as ground and rebuilds the cut when the found set grows),
`createFindLayer` (the pulse dissolves). `SETTLED` stays, off the board, as the pulse's
dark beat and the belt's right-tag colour.

**The bake pipeline.** `tools/model_views/` turns a GLB into strokes, silhouette, and a
1-bit render. `frame_camera` measures the frame through the same `world_to_camera_view`
projection the strokes come from, so what fits the measure fits the drawing — a
hand-derived bounding cylinder underran 10% because the elevation tilt and camera roll
both feed the projection. The whole fleet was re-baked under the one rule and committed
(`chore(assets): re-render the traced model views`); slim vehicles come back a hair
tighter but their board size is unmoved (footprint sizing is a share of silhouette area).

**The sandbox.** `tmp/found-fade.html` drives the real game layers (paper, board, grid,
find) against a real dealt board, forces a found-set, and steps stages — used to verify
the found-ground look. Serve the repo root and open it:
`python3 -m http.server <port> --bind 127.0.0.1` then
`http://127.0.0.1:<port>/tmp/found-fade.html`. Disposable (`tmp/` is gitignored).

**The prompt renders are 512x512 and one bit deep.** Every grey is a halftone, so a
non-integer scale beats the dot grid against the pixel grid — the card halves down to
128 first. Their white ground is opaque, which is why the card floods the ground away
rather than multiplying.

**The board holds still.** The cached bitmap in `createBoardLayer` and the Canvas2D
renderer both survive on it; `research/WEBGL-RENDERER.md` keeps the numbers in case the
question reopens.

**Audio, compressed.** `audio.js` is voice + desk: a music bus that ducks under every
effect, loudness declared not chosen (`BALANCE`, absolute `findLufs` anchor plus relative
offsets). Four CC0 loops in `music.js`, each with a measured `normGain` to a -18 LUFS bed;
all now `master: true`. Not a `DynamicsCompressor` — it inflates rather than limits under
`node-web-audio-api`. Ratings/reasoning: `research/disco-loops/`.

**Publishing.** Pages serves `main` at root; every path is relative. Verify a deploy by
hashing served files against local, not by eyeballing the browser. Do **not** trust FPS
in a headless browser — it throttles animation frames; time operations directly.

**Copy decisions** are in `.claude/skills/copy/plain/terms.md`. The player-facing README
says *yard*; *board* is developer vocabulary.

## Next Step

**#15 is waiting on you** — the win chime's source, so its licence and credit can be
recorded the way `music.js` records the music's. It is the one open item that is neither
a playtest judgement (#17, #16, #12, #5) nor optional polish (#21, #22).

/home/menser/Dropbox/ai/code/parts_disco
