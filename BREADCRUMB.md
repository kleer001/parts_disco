fresh

## Summary

The game got a voice, a way to lose, a wipe with character, paper under its panel, and
music behind a switch.

`src/audio.js` is now a small desk: a music bus and an effects bus into a master, with
the music ducking out of the way of every effect. The five board sounds are balanced
against each other and anchored absolutely — a declared table, gains solved to hit it,
and a panel that re-measures. A find climbs a Shepard tone and never runs out of
ladder; the win sounds its blip, waits 250ms, then rings.

A run can be lost. Ten units of damage carry across stages, only a wrong vehicle
charges them, and the price falls from a whole unit at stage 1 to a quarter at stage 16.
Filling it frosts the yard and offers the same stage again as a different deal.

A level now leaves on the grid the *arriving* level rules, so the wipe announces the
next stage's density. The panel is printed on two papers with its blocks pressed into
one sheet. An options panel — the game's only HTML — sits bottom right with the sound
faders and four CC0 loops, music off by default.

Live at **https://kleer001.github.io/parts_disco/**.

## Todos

### Parallel

- [ ] #21 The music has no crossfade at its loop point, and two of the four tracks
  need one. `Piano`'s wrap is a sharper transient than 99.9% of anything inside it and
  `Disco`'s is sharper than 90.7% — both will tick once a bar in the game.
  `research/disco-loops/shortlist.html` has a working 12ms equal-power crossfade to
  copy; `setMusic` in `src/audio.js` just sets `loopStart`/`loopEnd`. `Funky` (46.5%)
  and `Techno-ish` (10.4%) are fine as they are.
- [ ] #18 Swap the three Freesound previews for their masters. `music.js` records which
  is which as `master: false` — `Techno-ish`, `Disco` and `Piano` play the site's `-lq`
  preview because the master needs an account. Fine to judge by, wrong to ship.
- [ ] #15 Settle the win chime's provenance. `assets/sfx/win-chime.mp3` came from
  `treasure_trash`, which records no licence, source or credit for it anywhere. The
  music now has a provenance standard the chime does not meet.
- [ ] #17 Playtest the meter and settle its two guesses: ten units of capacity, and a
  wrong vehicle falling from a whole unit to a quarter across the path. The asymmetry
  to watch is that a stage's target count swings from 2 to 33, so two stages at the
  same point charge the same for very different numbers of clicks — dividing the cost
  by the target count is the first thing to try if one stage is a wall. Credit for
  clearing a board is the dial if it is simply too harsh.
- [ ] #16 Tune the wrong-click wash and the wipe on `dev/juice.html`, which now carries
  only the three unsettled groups. The wash's three numbers and the wipe's stagger
  (0.34) and lead size (0.35) were chosen by reasoning, not by watching.
- [ ] #12 Design tweaks, round two, on `dev/panel.html`. The two papers are settled;
  what wants another pass is the panel's composition — the tall panel still has dead
  space under the dials.
- [ ] #13 Research more vehicle models. The fleet is twelve of Kenney's Car Kit (CC0).
  Near-twins are worth more than loud ones — the twins tier is where the difficulty
  lives. `tools/model_views/` is the pipeline from GLB to strokes, silhouette and
  1-bit render.
- [ ] #19 Remember the options across a reload. Offered and not taken; it is a few
  lines of `localStorage` in `src/options.js`.
- [ ] #20 Tabs in the options panel. Deferred deliberately — the body is one scrolling
  column with `Sound` and `Music` headings, so this is splitting it rather than
  rebuilding it.
- [ ] #3 A title screen and a real end. Game over exists; the game still starts
  mid-board on load.
- [ ] #4 Score or timer. Losing exists now; winning is unscored and unclocked.
- [ ] #5 Play the sixteen stages start to finish and feel the ramp. Especially whether
  stage 9's jump (twins arrive) is too steep and whether stage 16 at one ink is
  playable.
- [ ] #14 Pull the run driver out of `main.js` so `dev/juice.html` stops carrying its
  own copy. ~60 near-identical lines. The bench is the instrument the tuning is chosen
  on, so a bench that has drifted from the game produces wrong numbers with nothing to
  catch it.
- [ ] #6 Decide what to do about `view-preview.html`, and the other root clutter a
  visitor sees: `board-default.png` (847KB), `board.txt` (134KB), `gl-spike.html`,
  `word-preview.html`.

### Sequential

- [ ] #7 Decide whether the board drifts. Everything built assumes a still board, and
  that assumption is load-bearing: the board layer keeps a cached bitmap and blits it,
  and every effect draws over the top rather than into it.
- [ ] #8 (needs: #7) If it drifts, move to the WebGL renderer. Canvas2D is 14fps for a
  moving board at this density; the spike is 0.06ms/frame. `gl-spike.html` is complete
  and verified, `research/WEBGL-RENDERER.md` has every number.
- [ ] #9 (needs: #7) If it drifts, decide about line shimmer. Measured: a quarter-pixel
  move relocates 28% of the ink, because a 1px unantialiased line cannot move a third
  of a pixel.
- [ ] #11 (needs: #7) If it drifts, the held board is dead — every frame is a different
  picture and the keeping is a copy paid for nothing.

## Context

**Where things live.** `src/`: `views.js` loads the fleet, `board.js` deals and throws,
`paint.js` colours the map, `game.js` holds the round, `levels.js` is the difficulty
path as data, `meter.js` is the run's damage, `juice.js` is the tuning and envelopes,
`audio.js` is the voice *and* the desk, `music.js` is the track table, `layout.js` says
where things sit, `layers.js` draws, `options.js` is the panel, `main.js` wires it.
Benches: `dev/juice.html` (effects), `dev/panel.html` (the panel's paper),
`research/disco-loops/` (loops, ratings, the desk). `ARCHITECTURE.md` explains the lot.

**Read `DECISIONS.md` before proposing anything structural**, and check
`DECISIONS-JOURNAL.md` for why. Several rulings this session reverse an earlier one,
and the losing option usually looks obvious from the code alone.

**The desk, and why it exists.** The find blips sit between 220 and 1760Hz and a disco
loop has most of its energy under that, so a music level low enough to leave them clear
is too low to hear. The music ducks instead, by an amount each voice carries as a `duck`
column. Not a `DynamicsCompressor`: `music_loom`'s master chain records that under
`node-web-audio-api` it inflates rather than limits, so a graph leaning on it measures
as a lie outside a browser.

**Loudness is declared, not chosen.** `BALANCE` in `audio.js` holds an absolute anchor
(`findLufs`) *and* the relative offsets, because a relative table alone is blind to the
set being buried — which is exactly what happened: every voice within 0.03dB of target
and the lot of them 6.8dB under a ducked loop. Every music loop carries a measured
`normGain` to a -18 LUFS bed; as published the four sit nearly 13dB apart. The balance
panel on `research/disco-loops/mixer.html` re-measures the shipped values, including
where the set sits against the loop that is playing.

**The four loops, best first.** `Funky` (110bpm, 60 bars, 8.4% of its energy in the
board's band — the lowest by a factor of three), `Techno-ish` (4 bars, best join, but
11 repeats in a 75s stage), `Disco` (16 bars, steadiest bed), `Piano` (warmest but
47.8% in the board's band, so it masks the blips). All CC0. Ratings and reasoning live
in `research/disco-loops/ratings.json`, which `shortlist.py` merges rather than owns —
it used to own the whole file and erased them on a re-measure.

**A run is spent, not scored.** `meter.js`: ten units, only a wrong vehicle charges
them, geometric price fall along the path. `round.misses` is gone — it counted bare
ground too, which stops being the same event once a count decides a death. A death
empties the meter and re-deals the same stage from a different draw (`RETRY_STRIDE`),
so the run still reproduces from its seed.

**The wipe leaves on the arriving level's grid.** Lanes open staggered and land
together; cells open along the grid; each square grows into its cell. `cellOf` is
shared with the grid layer or the wipe would drift off the lines it steps on. Built the
wrong way first — a travelling front with squares appearing behind it put the two on
different clocks and 13% of the screen reappeared in a frame.

**Measure pixels, not rectangles.** Three probes that modelled the wipe gave garbage;
painting the old screen red and the new one blue and counting red pixels found the bug
in one pass. The same rule caught the panel's paper (79% of pixels over the vehicle
carried the ink) and the balance work.

**Costs, measured.** Still board 0.22ms; one vehicle at its pulse peak 5.8ms; the whole
panel with both papers 0.20ms; the wipe 0.04ms mean; a level change rebakes the card at
6.5ms mean, 12.1ms worst, which lands under the wipe.

**The prompt renders are 512x512 and one bit deep.** Every grey is a halftone, so a
non-integer scale beats the dot grid against the pixel grid — the card halves down to
128 first. Their white ground is opaque, which is why the card's paper needed the
ground flooding away rather than a multiply.

**Do not trust frames per second in a headless browser.** It throttles animation
frames. Time operations directly and use wall-clock waits.

**Publishing.** Pages serves `main` at root; every path is relative. Verify a deploy by
hashing served files against local, not by looking at the browser. `python3
dev/build_artifact.py` bakes `dev/juice.html` into one file; its module list is
hand-maintained.

**Copy decisions are recorded** in `.claude/skills/copy/plain/terms.md`. The player
half of the README says *yard*; *board* is developer vocabulary.

## Next Step

#21 — the loop crossfade. It is the one thing shipped this session that a player will
hear as a defect: pick `Piano` or `Disco` in the options panel and it ticks once a bar.
The fix already exists and works in `research/disco-loops/shortlist.html`; it needs
moving into `setMusic`.

/home/menser/Dropbox/ai/code/parts_disco
