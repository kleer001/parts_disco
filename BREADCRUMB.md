stale

## Summary

The game got a voice, a way to lose, a wipe with character, paper under its panel,
music behind a switch, and a panel that remembers.

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
faders and four CC0 loops, music off until it is asked for and kept once it has been.

`src/run.js` holds a run — the stage, the attempt, the meter, the dealt board and its
colouring. The game and `dev/juice.html` both drive it, so the bench tunes against the
board that ships.

Live at **https://kleer001.github.io/parts_disco/**.

## Todos

### Parallel

- [ ] #18 Swap the three Freesound previews for their masters. `music.js` records which
  is which as `master: false` — `Techno-ish`, `Disco` and `Piano` play the site's `-lq`
  preview because the master needs an account. Fine to judge by, wrong to ship.
- [ ] #15 Record the win chime's licence. `assets/sfx/win-chime.mp3` carries none, and
  it is not recoverable from disk — the archaeology is in `assets/sfx/README.md`. The
  owner knows the source; it needs writing down beside the file and in the same shape
  `music.js` uses for the music: author, licence, URL. Then `assets/sfx/README.md`
  becomes a credit rather than an open question.

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
- [ ] #20 Tabs in the options panel. Deferred deliberately — the body is one scrolling
  column with `Sound` and `Music` headings, so this is splitting it rather than
  rebuilding it.
- [ ] #3 A title screen and a real end. Game over exists; the game still starts
  mid-board on load.
- [ ] #4 Score or timer. Losing exists now; winning is unscored and unclocked.
- [ ] #5 Play the sixteen stages start to finish and feel the ramp. Especially whether
  stage 9's jump (twins arrive) is too steep and whether stage 16 at one ink is
  playable.

## Context

**Where things live.** `src/`: `views.js` loads the fleet, `board.js` deals and throws,
`paint.js` colours the map, `game.js` holds the round, `levels.js` is the difficulty
path as data, `meter.js` is the run's damage, `juice.js` is the tuning and envelopes,
`run.js` is a run and what it dealt,
`audio.js` is the voice *and* the desk, `music.js` is the track table, `layout.js` says
where things sit, `layers.js` draws, `options.js` is the panel, `main.js` wires it.
Benches: `dev/juice.html` (effects), `dev/panel.html` (the panel's paper),
`research/disco-loops/` (loops, ratings, the desk). `ARCHITECTURE.md` explains the lot.

**The board holds still.** Settled, not assumed: the cached bitmap in
`createBoardLayer` and the Canvas2D renderer both survive on it, and
`research/WEBGL-RENDERER.md` keeps the numbers in case the question reopens.

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

**#15 is waiting on you** — the win chime's source, so its licence and credit can be
recorded the way `music.js` records the music's.

Everything else left wants someone playing it: #5, #17, #16 and #12 are all judgements
made by watching, not by reading. #13 (more vehicle models) is the one piece of open
work that can be done at a keyboard.

/home/menser/Dropbox/ai/code/parts_disco
