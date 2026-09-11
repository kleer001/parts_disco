# DECISIONS JOURNAL — parts disco

The dated corpus behind `DECISIONS.md`. That file holds the verdict; this holds the
deliberation — the pressure that forced the call, the alternatives weighed, and where in
the code the call is enforced.

**Write an entry when a decision has a rejected alternative** — when something was
weighed, lost, and a later session could reasonably re-propose the loser. Not for every
choice: a call with no loser has no provenance worth keeping, and a journal padded with
those is one nobody reads.

**Append-only, never pruned.** When a ruling changes, the old entry stays and the new one
goes under it. The superseded reasoning is the value: it is the only record of how the
thinking moved, and a session that cannot see the losing argument re-runs it from
scratch.

<!-- ENTRY CONTRACT — newest at the bottom, dated:

       ### [YYYY-MM-DD] Short title
       **Decision:** the call.
       **Why:** the pressure or evidence that drove it.
       **Rejected:** the alternatives weighed, one clause why each lost.
       **Threaded:** where the decision is enforced in code or data — file and symbol,
       e.g. `src/<module>.js` `<function>()`, or the key in the data file that carries it.

     `Threaded:` names a code site, not another document. It is where a future session
     looks to check the decision is still true — the same job a comment's *why* does, for
     a decision too big to fit on the line above it. -->

---

## Decisions

### [2026-09-06] Patent PDFs come from Google's mirror
**Decision:** `harvest.py` resolves each patent's PDF from the `citation_pdf_url` meta
tag on `patents.google.com/patent/US<number>/en`, and downloads it from there.
**Why:** USPTO's `image-ppubs` endpoint does answer to a bare patent number, but its
grant PDFs are page scans. `pdftotext` returns seven bytes from US4137884 — form feeds
and nothing else — so every patent screened out at zero named parts. The mirror carries
the same pages with an OCR text layer, verified back to a 1946 grant, which also puts
pre-1976 patents outside USPTO's full-text window in reach.
**Rejected:** USPTO's endpoint — no text layer, so no part names. Guessing the mirror's
flat `pdfs/US<number>.pdf` path — it answers for some patents, but the canonical path is
content-hashed and the flat one is not a documented alias to rely on.
**Threaded:** `src`-side nothing; `tools/patent_harvest/harvest.py` `download_pdf()`.

### [2026-09-06] Patent text is read one column at a time
**Decision:** `pdf_text()` crops each half of the page and extracts it separately, then
drops a line-end run of multiples of five that climbs the page, and only the detailed
description reaches `labels.py`.
**Why:** a patent page is two columns with line numbers printed every fifth line down the
gutter. Read whole-page, the columns interleave — a numeral draws its name from the other
column's prose — and every margin number enters the table as a part that does not exist.
US4137884 named "310", a classification code off the front page, ahead of half its real
parts. Cropping raised flywheel from 0.32 confidence to 0.54 and brought rivets in at all.
**Rejected:** `pdftotext -raw` — it gets the reading order right and drops the margin
numbers for free, but loses inter-word spaces, and "firstside ring" and
"magneto incorporatingtheinventio" cost more than the margin numbers it saves.
**Threaded:** `tools/patent_harvest/harvest.py` `pdf_text()`, `strip_margin_numbers()`,
`description_only()`.

### [2026-09-06] The pile is outlines, and each part drifts alone
**Decision:** parts are stroked, never filled, and every part gets its own speed on each
axis.
**Why:** the source art is line work, and twenty filled parts bury each other; outlines
overlap without hiding anything. Motion is what separates them — differently-moving
outlines segment by common fate, so a pile stays readable where a static one would not.
**Rejected:** filled silhouettes — they would make occlusion a difficulty knob, at the
cost of a board a player cannot read at all. Moving layers as groups — parts sharing a
heading read as one object, which is the opposite of what the search needs.
**Threaded:** `src/layers.js` `createPartsLayer()`, `src/board.js` `createBoard()`.

### [2026-09-06] Position is solved from t
**Decision:** `driftAt(body, t, field)` folds `x + vx * t` back and forth between the
bounds; no frame-to-frame state.
**Why:** a closed form lets the whole bounce cycle be sampled offline, so a board can be
checked for "is every part reachable at some point in the loop" before it ships. Nudging
a layer at runtime to make a buried part reachable would read as the world cheating.
**Rejected:** integrating velocity each frame — it accumulates float drift, so two runs
of one seed diverge, and there is nothing to sample without running the simulation.
**Threaded:** `src/drift.js` `fold()`, `driftAt()`.

### [2026-09-06] The mirror is addressed by its flat path, not through its patent pages
**Decision:** `harvest.py` fetches `patentimages.storage.googleapis.com/pdfs/US<number>.pdf`
directly, one hop, with no HTML parsed.
**Why:** resolving the content-hashed path meant asking `patents.google.com` for each
patent page first. That host rate-limits hard and then answers 503 to everything for a
while — including the patent pages themselves, which took the art pipeline down entirely
while the PDF CDN stayed up and serving. The flat path was checked against grants from
1936 to 1977 and answered for all of them.
**Rejected:** the `citation_pdf_url` route — it is the advertised path and it is exact,
but it costs a request to a host that blocks, to learn something the flat path does not
need. Keeping both as a primary and a fallback was rejected too: a fallback would have
hidden the block behind a slow path rather than showing it.
**Cost of the flat path:** it is not documented as an alias, and it carries the pre-1980
filename shape — a modern grant's file has its kind code in the name
(`US6318332B1.pdf`), so a run reaching into recent patents would fail loudly on the
first one and want the shape widened.
**Threaded:** `tools/patent_harvest/harvest.py` `PDF_URL`, `download_pdf()`.

### [2026-09-06] Figures are traced at half the rendered page
**Decision:** `segment.py` halves a sheet before thresholding, and the drawings are taken
from page 2 on.
**Why:** sheets render at print resolution, an order of magnitude more detail than a
figure drawn a couple of hundred pixels wide can show. Halving took 44% off the path data
with nothing visible lost. Page 1 of a grant is the front page: its only original marks
are lines of type, which segmentation read as a figure captioned "15 Claims, 8 Drawing
Figures", and the figure it does carry repeats off a drawing sheet.
**Rejected:** loosening potrace's `opttolerance` instead — measured across 0.35 to 1.5 it
moved the file size by 5%, so it buys nothing and only costs fidelity. Going below half
scale — at a third, two of the five figures on a test sheet merged into one.
**Threaded:** `tools/figure_trace/segment.py` `PAGE_SCALE`, `tools/figure_trace/trace.py`
`FIRST_DRAWING_PAGE`.

### [2026-09-06] A refused host ends the run
**Decision:** `fetch.py` is the only way the harvester talks to a host. It holds the
six-second per-host gap, waits out a 429 or 503 on a widening delay honouring
`Retry-After`, and raises `HostRefusing` when the host keeps refusing — which no
per-item handler catches, so the run stops with what it already has.
**Why:** `urllib`'s `HTTPError` subclasses `URLError`, so the harvester's per-patent
handler caught a 503 as that patent's failure and moved to the next number. Measured
against a host that always refuses: the old loop made one request per number — eight
for eight, and a hundred for a hundred — while the new one makes four and stops. The
pacing was never the bug; every request was six seconds apart. Continuing through a
refusal is what extends it, and it cost access to a whole host mid-run rather than to
the one endpoint that started it.
**Rejected:** raising the gap instead — the requests were already correctly spaced, so
a wider gap would only have made the same walk slower. Retrying the failed numbers at
the end of the run — same knocks, later. Catching `HostRefusing` per patent to record
it in the manifest — it would read as eight failures rather than one, and the manifest
is not worth another request to the host.
**Cost:** an exit code of 2 and an incomplete run to re-issue by hand, where before the
run always finished. That is the point: an incomplete run says the host refused, where
a full one of nothing but failures looks like a bad list of numbers.
**Threaded:** `tools/patent_harvest/fetch.py` `Fetcher.get()`, `HostRefusing`;
`tools/patent_harvest/harvest.py` `main()`.

### [2026-09-06] A 503 is "not now", not "no" — correcting the vocabulary
**Decision:** the fetcher keeps the behaviour it had and drops the language it was
written in. `HostRefusing` becomes `HostUnavailable`, `REFUSAL_STATUS` becomes
`RETRYABLE_STATUS`, and the comments no longer say a 429 or 503 means a host is
refusing.
**Why:** the earlier entry described both codes as a host refusing, which is wrong for
503. RFC 9110 defines it as "a temporary overload or scheduled maintenance, which will
likely be alleviated after some delay" — a hiccup, and retrying after a wait is exactly
what it asks for. Rate limiting is 429, RFC 6585: "the user has sent too many requests
in a given amount of time." The generalisation came from one vendor: Google serves its
anti-automation block as 503, and that vendor convention got written down as what the
status means.
**What survives:** the defect being fixed was never about which code it was. Catching
either one per item and taking the next number is wrong under both readings — it
abandons a document a busy host would have served, *and* it re-asks a shedding host the
same question with a different name in it. The behaviour that came out of the wrong
reasoning was already right; only the words were carrying the error, and words are what
the next session reads.
**Rejected:** treating 503 as ordinary and retrying it indefinitely — a 503 that
persists across widening backoff and covers every path on a host is not the transient
overload the status describes, and there is no way to tell the two apart except by
having waited. Splitting 429 and 503 into separate paths — they call for the same move,
and two paths would only encode the distinction twice.
**Threaded:** `tools/patent_harvest/fetch.py` `RETRYABLE_STATUS`, `HostUnavailable`.

### [2026-09-08] The blink gave way to a pulse over the board

**Decision:** A found vehicle is answered by a `find` layer drawn over the board — a
scale overshoot, a shake and a colour strobe — and the board layer no longer blinks or
repaints anything per vehicle. The box-repaint machinery added the day before
(`repaint(box)`, `missesBox`, the clipped stroke) is deleted.

**Why:** Two answers over the same pixels fight. Once the pulse existed, the blink was
a second, quieter statement of the same event, and the pulse won on every count: it can
leave the vehicle's bounds, which a box repaint by definition cannot, and it leaves the
kept board untouched so the hold survives the frame. The box repaint was a good answer
to the question "how do we repaint one moving vehicle cheaply"; the pulse removes the
question.

**Rejected:** Keeping both and suppressing one — that is a flag deciding which of two
implementations of one idea runs. Keeping the blink and letting the pulse scale within
the box — the overshoot is most of the effect and the box would clip it.

**What it costs:** the still frame is unchanged, but a frame with a vehicle at the peak
of its pulse fills and strokes that vehicle at up to 2.25× its size. Measured at the
densest stage, 120 vehicles: 0.22ms still, 5.8ms at the peak.

**Threaded:** `src/layers.js` `createBoardLayer`, `createFindLayer`; `src/juice.js`
`findPulse`.

### [2026-09-08] Meaning is coloured off the board

**Decision:** The panel carries a five-role semantic ramp (`SEMANTIC` in
`src/juice.js`); no board ink means anything.

**Why:** `paint.js` assigns inks by graph colouring so that no two touching regions
share one. Every ink is therefore spoken for by the puzzle, and an ink that also meant
"found" would either force a clash or be read as another vehicle. Every `loud` in the
ramp was solved to sit at least 0.074 from the nearest board ink in OKLab for that
second reason.

**Rejected:** Reserving one board ink for feedback — it costs the colouring a colour
at exactly the stages where the ink count is the difficulty. Marking a found vehicle
with a symbol instead of a colour — a mark sits on top of the board, and what a find
changes is the board.

**Threaded:** `src/juice.js` `SEMANTIC`; `research/semantic_ramp.py`.

### [2026-09-08] Lightness carries the valence, hue only confirms it

**Decision:** The semantic roles are separated in lightness first. `found` is a bright
green at OKLCH L 0.62; `miss` is a dark red at L 0.38.

**Why:** The obvious ramp — five roles at one lightness, told apart by hue — was built
and measured, and it fails: `found` and `miss` land 0.021 apart in OKLab under
simulated deuteranopia, which is the same colour to roughly one man in twelve. Splitting
them in lightness takes that to 0.231, and to 0.384 under protanopia.

**Rejected:** Equal-lightness roles distinguished by hue. Also rejected: red as the
"bad" colour on the strength of genre convention — in the games surveyed red is
usually the multiplier, the most wanted number on the screen, so red was kept for the
error counter only, which is a different register.

**What it costs:** `found` and `last` still sit 0.056 apart under protanopia, where
green and amber converge. They are never the same kind of element and `last` also
grows, but that pair reads by position for a protanope.

**Threaded:** `src/juice.js` `SEMANTIC`; `research/semantic_ramp.py`, which prints
every figure above.

### [2026-09-08] Tuning is a module constant, not a data file

**Decision:** `TUNING` in `src/juice.js` is a plain exported object. The bench
(`dev/juice.html`) drives the same layers with a live settings function and prints the
block to paste back.

**Why:** `levels.js` already holds the difficulty path as a module constant, so this is
the shape the project already uses for tuning. Nothing in this game fetches data at
runtime, and adding a fetch would put a round trip on the critical path to buy an edit
loop the bench's copy-out already gives.

**Rejected:** A `data/juice.json` the bench writes and the game loads — it makes the
first frame wait on a network round trip, and introduces a second failure mode
(missing or malformed file) for a value that cannot vary at runtime.

**Threaded:** `src/juice.js` `TUNING`; every layer factory's `settings = () => TUNING`.

### [2026-09-08] A found vehicle rests in one grey, not in another board ink

**Decision:** A found vehicle comes to rest in `SETTLED` (`#4c4c4c`), the same neutral
grey for every vehicle on every board. It is not one of the eight board inks, and it is
a constant rather than a fact worked out per region, so nothing has to be planned or
carried on the board plan to know it.

**Why:** The resting colour is the only record that a vehicle was found. Drawn from the
board's own palette it is a colour some unfound vehicle is also wearing, so a solved
vehicle stays inside the puzzle's alphabet and reads as one more thing to sort through.
A colour no other vehicle can hold takes it out of the puzzle at a glance.

The grey is neutral at the luminance of the darkest board ink (`#3f4a58`), which is what
keeps the black linework reading over it exactly as it reads over the rest of the board.

**Rejected:** Rotating the region's ink five steps and stepping off any colour a
neighbour wears — the outgoing rule. It landed back on the region's own ink one time in
eight, and every colour it could land on was in use elsewhere on the board.

**What it costs:** Found vehicles no longer differ from each other, so a pile of them is
one grey mass rather than several distinguishable solved cars.

**Threaded:** `src/layers.js` `SETTLED`; the board layer's `restingOf` and the find
layer's off beat, which read the one constant so the pulse ends on the colour the board
keeps.

### [2026-09-08] One level leaves under a hard wipe, drawn from a snapshot

**Decision:** When a round ends, the loop keeps the canvas as it stands -- the win's
last frame -- and hands it to a wipe layer on top of the stack. The next level is dealt
and drawn in full from the first frame after that, and the wipe lays the old picture
back over the part of the screen a hard edge has not crossed yet. 750ms
(`TUNING.wipeMs`), from one of the four sides to its opposite, drawn off the incoming
level's seed.

**Why:** The transition is then a fact about pixels, not about the game. Nothing else in
the stack learns that a handover is happening, and the old level's round, plan and
layout are released the moment it ends.

**Rejected:** Holding the finished round alive and compositing two boards. Every layer
would have to be told which round it was drawing, and the board layer's kept picture --
one canvas, rebuilt when the map changes -- would have to become two, all to animate a
handover that is over in three quarters of a second.

**What it costs:** The old screen is frozen, so nothing on it can move during the wipe.
It also cannot survive a change of canvas shape: a wipe in flight when the phone turns
stops, because the screen it was taken from no longer exists.

**Threaded:** `src/layers.js` `createWipeLayer`, `wipeFrom` and the `WIPES` table;
`src/main.js`, which takes the picture in the same breath as it deals the next level.

### [2026-09-09] A wrong click washes the vehicle it hit, and the wash fades

**Decision:** clicking a vehicle that is not the one being asked for washes it in a
light grey (`REFUSED`, `#c9c9c9`) at up to 0.8 alpha, drawn over the board and gone in
`TUNING.refuseMs` (620ms). The linework is redrawn at the wash's own alpha, so the
vehicle keeps its edge and the wash reads as the colour draining out of it. The layer
sits under the find pulse.

**Pressure:** a wrong click was silent. Every other outcome on the board answers — a
find pulses, the panel flinches, a win wipes — and the one outcome a player gets most
often did nothing but move a number in the corner of the panel.

**Rejected: leaving the wash on for the rest of the round.** A vehicle permanently
greyed out is a candidate crossed off, and crossing candidates off is the search the
game is asking the player to do in their head. That is the difficulty dial, not the
legibility one, and the two are separate on purpose: softening the search spends the
moment the player solves it. A fading wash answers the click and remembers nothing.
The change is one number if the call goes the other way — `refuseMs` to something
longer than a round.

**Rejected: shaking or strobing it, the way a find does.** A find is the board
answering and a wrong click is the board going quiet. Giving both motion would leave
colour as the only thing telling them apart, and the two would read as one event at
different volumes.

**Threaded:** `refuseWash` and the three `refuse*` numbers in `src/juice.js`;
`REFUSED` and `createRefuseLayer` in `src/layers.js`; `round.refused` in
`src/game.js`, which is the only place a refusal is recorded.

### [2026-09-09] The board gets a voice: three beeps from a table, one recorded win

**Decision:** `src/audio.js` holds a `VOICES` table with a row per outcome of
`round.choose` — a click on nothing, a click on an already-found car, a refusal, and a
find. Each row is a wave, a start and end frequency, a length and a gain, played
through one oscillator and one gain. The win is `assets/sfx/win-chime.mp3`, decoded
once. The find climbs in pitch with its rank, capped at `TUNING.rampCap`, which is the
same escalation the find pulse runs on.

**Pressure:** the game was silent. The engine and the chime were both already written
in the sibling repo `treasure_trash`, which is where this pattern comes from.

**Rejected: recording all four.** A beep that is a row in a table is retuned by editing
the table; a recorded one needs a tool and a round trip. Four samples is also four
downloads for three sounds nobody will notice the timbre of.

**Rejected: synthesising the win as well.** A chord is not something two oscillators do
convincingly, and the win is the one moment in the game worth a download.

**Rejected: opening the audio context on the first click, as `treasure_trash` does.**
A context may be constructed before any gesture — it starts suspended — and decoding
into a suspended context works. Building it up front and decoding the chime alongside
the fleet removes the race where a level won in a single click wins before its sound
has been decoded, and with it the null check that race would otherwise need. The first
click resumes the context; that is all the gesture is needed for.

**Rejected: the find beep sounding under the chime on the winning find.** The win is
the louder statement and the beep says nothing the chime does not.

**Open:** the chime's provenance is not recorded anywhere in `treasure_trash` — no
licence, no source, no credit in its README or git history. It is fine to develop
against and is a question to settle before a store page.

**Threaded:** `src/audio.js` in full; `src/main.js`, where the pointer handler asks for
one sound per outcome and hands the chime the find that ends the round.

### [2026-09-09] The find climbs on a Shepard tone, and the win waits its turn

**Supersedes the capped climb** in the entry above it. That entry stands as written;
this is what replaced it.

**Decision:** a find is three sine partials an octave apart, moving up together by
1/6 of an octave per find, under a raised-cosine loudness window fixed in pitch rather
than carried with them. A partial climbing towards the top of the window fades out; one
entering at the bottom fades in. After six finds the three partials stand exactly where
they started, so the seventh find is spectrally the first and still reads as higher
than the sixth. The find that wins the round sounds in full, and the chime starts
`WIN_PAUSE` (250ms) after that blip ends.

**Pressure:** the escalation shipped as a fixed ratio per find capped at
`TUNING.rampCap`, on the reasoning that past a point more intensity stops reading as
more. That reasoning is sound for the pulse's amplitude and wrong for pitch: a capped
pitch does not read as "loud enough", it reads as the sound having stopped answering.
Measured against the shipped seed, 11 of the 16 stages ask for more than six of the
target — stage 15 asks for 33 — so most of the game was played past the cap, and stage
15 would have rung 27 identical blips in a row.

**Rejected: raising the cap, or making the step smaller.** Both push the dead spot
further out without removing it, and a smaller step makes each rise less legible on
the way. There is no ceiling that is high enough for 33 and still audible as a climb
across 3.

**Rejected: sliding the partials during the blip, as a Risset glissando does.** The
rise lives between one find and the next, which is where the escalation is. A slide
inside a 150ms blip would be heard as a chirp rather than as a step, and the two
readings fight.

**Rejected: the chime replacing the winning find's blip,** which is what shipped
first. The blip is what earned the win and the chime is what the win says back; laying
them end to end is two statements, and playing only one of them loses the first. The
gap is booked on the audio clock rather than the frame loop, so a stalled frame cannot
smear it.

**Measured, by tapping the graph the game actually builds:** ranks 1..6 walk the bottom
partial 440 → 493.88 → 554.37 → 622.25 → 698.46 → 783.99 Hz, each 2^(1/6) above the
last; rank 7 and rank 13 are identical to rank 1. The window is symmetric — rank 2's
partial gains (0.0017, 0.0486, 0.0323) are rank 6's reversed — and their sum is
constant across every rank, so the chord does not pump as it climbs.

**Threaded:** `FIND`, `WIN_PAUSE` and `gainAt` in `src/audio.js`, and the `find` method
that reads them; `src/main.js`, whose pointer handler now asks the find whether it won
rather than choosing the sound itself.

### [2026-09-09] Losing: a meter that fills, and what a death costs

**Decision:** a run carries a damage meter of ten units that spans stages. Only a
wrong vehicle charges it, and what one costs falls geometrically along the path — a
whole unit at the first stage, a quarter at the last, so ten mistakes end the first
stage and forty end the sixteenth. Filling it stops the board, frosts the yard and
offers the same stage again; taking that offer empties the meter and deals a different
yard from the same numbers. Nothing else ever empties it.

**Pressure:** the game had no way to lose. It ran stages forever and a wrong click
moved a red number that did nothing.

**Rejected: a fixed cost with a capacity that grows by stage.** The arithmetic is
nearly the same and the display is much worse: a bar whose length changes cannot be
read as progress at a glance, and reading it at a glance is the only reason to draw a
meter rather than print a count. Holding the ladder still and moving the price keeps
one picture meaning one thing for the whole run.

**Rejected: charging for a click on bare ground,** which is what the old counter did —
it incremented on both the `!hit` branch and the wrong-model branch. Once the count
decides a death those two stop being the same event: a click on paper is a slip or a
look, and only a vehicle named wrongly is a wrong answer. `round.misses` is gone
rather than kept alongside the meter, because two tallies of the same idea drift.

**Rejected: giving damage back for clearing a board.** Clearing buys progress, not
patience. It is the obvious first dial if playtesting says the meter is too harsh, and
it is deliberately not turned yet: two numbers moving at once makes a balance
impossible to read while it is still being found.

**Rejected: keeping the meter full through a death.** The player would respawn and die
to the next wrong click. Death has to be the thing that empties it, which makes the
meter a life rather than a run-long budget.

**Rejected: sending a death back to the first stage.** What a death costs is the board
you were partway through — on a stage asking for thirty-three, that is real work — and
not your place on the path.

**Rejected: dealing the identical board on a retry.** The stage's numbers come back;
the yard does not. Replaying a memorised board rewards recall rather than the search
the stage is asking for. `RETRY_STRIDE` moves the deal by the attempt, so a run is
still reproducible from its seed and the attempt count.

**Open, and needing play rather than argument:** ten units and a quarter-price floor
are guesses. The asymmetry most likely to bite is that a stage's target count swings
from two to thirty-three, so two stages at the same point on the path can ask for very
different numbers of clicks while charging the same. Dividing the cost by the stage's
target count is the first thing to try if one stage turns into a wall.

**Threaded:** `src/meter.js` in full; `meterKick` and the three `meter*` numbers in
`src/juice.js`; `meterBar`, `zoneOf` and `createOverLayer` in `src/layers.js`;
`RETRY_STRIDE` and the death branch of the pointer handler in `src/main.js`;
`tests/meter.test.js`.

### [2026-09-09] The wipe leaves on the arriving level's grid

**Decision:** the old screen no longer slides off in one piece. It leaves in the cells
of the grid the *incoming* level rules. Each lane — a column for a wipe that falls or
rises, a row for one that crosses — opens at its own moment and they all finish
together. Within a lane the cells open one at a time along the grid, and each square
grows into its cell from `wipeLead` to full, so a square is smallest at the front and
full a cell or two back. A square finishes growing before the next cell opens, and that
gap is the wait on the line.

**Pressure:** the wipe was one hard edge and had no character. The grid is already the
clearest signal of how hard a stage is, and the transition was the one moment it could
be said before the board is playable.

**Rejected: the departing level's grid.** Same effect, opposite meaning — a wipe on
the outgoing grid is a goodbye, one on the incoming grid is an announcement. `take` is
handed the arriving stage's `along` for exactly this.

**Rejected: a travelling front with squares appearing behind it,** which is how this
was first built. The front advanced continuously and a cell only became a growing
square once the front had fully crossed it, so the cell went from a vanishing sliver
of old screen back to 88% covered in a single frame. Measured by counting pixels rather
than reasoning about rectangles: 13% of the screen reappearing at the coarsest grid,
falling to a fraction of a percent at the finest, which is why it was invisible in the
fine case and obvious in the coarse one. Cells now open as the front reaches them, so
the two are one clock and the old screen only ever shrinks.

**Rejected: a pause added on top of the travel.** A tread has to be the lane's whole
share of a cell, or the treads stop filling the lane's time. The wait is therefore
taken *out* of the tread: `rest = min(wipeDwellMs, tread * wipeDwellMax)` and the
square grows in what is left. The asked-for 50ms is a target, not a promise — at the
last stage a tread is 19ms, so the rest saturates at its cap and the lane hesitates
rather than pauses.

**Rejected: honouring every ruled line.** The last stage rules a five-pixel grid, which
is two hundred waits and more squares than anyone can see leave. `wipeCells` caps how
many the wipe shows along the long edge, and above that it opens every kth ruled cell —
still exactly on the grid, just a coarser beat of it. What the cap costs is that the
last stages all wipe at the same beat, because past that point the grid is finer than
the wipe can show anyway.

**Also settled here:** the grid rules a cell that is not quite the one `gridCellAt`
asks for, because the tile is eight cells wide and has to be whole pixels. The wipe
steps on the ruled cell and not the asked-for one, or it would drift off the lines
across the screen. Both now read it from `cellOf`.

**Measured:** across three stages and all four sides, 120 frames each, the old screen
never grows back and every wipe ends completely clear. The whole effect is one clip and
one blit per frame — 33 to 119 rectangles depending on the grid, 0.04ms mean and 0.3ms
worst on a 1174x1192 canvas.

**Threaded:** `SIDES`, `cellOf` and `createWipeLayer` in `src/layers.js`; the six
`wipe*` numbers in `src/juice.js`; the `wipe.take` call in `src/main.js`, which hands
it the arriving stage.

### [2026-09-09] The panel gets paper

**Decision:** the panel is printed on two sheets of the same ruled, speckled paper the
board's ground uses. The card lies on one, the readout sits sunk into the other, and
each has its own ink, rule weight, noise, margin and inset. `ruledTile` in
`src/layers.js` makes all three papers; `dev/panel.html` is the bench the two panel
sheets are chosen on.

**Pressure:** the board is a printed thing on ruled paper and the panel beside it was
a plain white rectangle with type on it. Nothing tied them together.

**Rejected: one sheet behind the whole panel.** The card and the readout are different
objects — one is the question and the other is the state of the answer — and a single
wash behind both flattens them into a tinted background instead of two things lying on
a desk.

**Rejected: giving the panel its own texture code.** The ground's tile builder already
did the work and was sitting inside `createGridLayer`'s closure. It is now
`ruledTile(cell, alpha, noise, noiseScale, ink)` at module scope, and the ground asks
it for black paper while the panel asks for grey. The lift keeps the ground's ink at
pure black rather than `PALETTE.ink`, because that is what it always drew and this was
a lift and not a retint.

**A layout fact worth writing down:** a desktop panel is 374x900 and a phone panel is
786x443, so the *desktop* takes the panel's tall branch and the *phone* takes its wide
one. The bench asks `layoutFor` for both rather than inventing rectangles, which is
what caught the two being the opposite way round from the obvious guess. In the tall
branch the card sits inside the readout's sheet, because the readout's items are split
above and below it and two separate sheets there read as an accident.

**Cost:** 0.20ms to paint the whole panel including both sheets, because a tile is
built only when a knob moves and every frame after is a pattern fill.

**Threaded:** `ruledTile`, `mat`, `sunkFrame` and the two `paperFor` caches in
`src/layers.js`; the twelve `cardMat*` and `readMat*` numbers in `src/juice.js`;
`dev/panel.html`.

### [2026-09-09] The panel's paper is one sheet, and the vehicle stands on it

**Supersedes the entry above it**, which gave the card and the readout a patch of
paper each. That entry stands as written; this is what replaced it.

**Decision:** one sheet of ruled paper lies under the whole panel, and the card, the
readout and the dials are pressed into it — a partial wash of their own colour under a
sunk edge, so the rules run on behind all three. The card is printed on a second sheet
inside its own rounded edge, and the render is multiplied onto that sheet rather than
drawn over it.

**Pressure:** paper under each block separately makes the rules stop at every edge.
The blocks then read as cards lying on a white page, which is the opposite of the
recesses they are meant to be. One continuous sheet with things pressed into it is the
picture; the patches were the same idea drawn inside out.

**Rejected: an opaque wash under a pressed block.** A block that paints over the rules
hides the sheet it is supposed to be cut into. `blockTint` is how far it lightens
instead: at 0 only the sunk edge says a block is there, at 1 the sheet stops at its
edge. The choice is on the bench rather than settled here.

**Rejected: drawing the prompt render onto the card unchanged,** which is what it had
always done. The renders carry an opaque white ground, so a card printed on paper kept
its rules only in the six-pixel margin around the render — the paper was around the
vehicle and not behind it, which is the one place it was asked for. Multiplying lets
the render's white leave the rules alone and its greys print over them. Verified by
forcing the card's paper to loud red and counting: 79% of the pixels over the vehicle
carry the paper's ink, where before it was none of them.

**Threaded:** `paper`, `pressed` and `sunkFrame` in `src/layers.js`, the two
`paperFor` caches, and the `multiply` in `bakeCard`; the eleven `cardPaper*`,
`panelPaper*`, `blockTint`, `readRecess` and `readPad` numbers in `src/juice.js`;
`dev/panel.html`.

### [2026-09-09] Behind the vehicle means the vehicle hides it

**Amends the entry above it**, which multiplied the render onto the card's paper. The
paper is still the card's own sheet; what changed is how the render meets it.

**Decision:** the render's ground is flooded away from the border inward and the
result is drawn normally, so the paper shows around the vehicle and the vehicle covers
it. `GROUND_AT` is the lightness a pixel has to clear to count as ground.

**Pressure:** multiplying put the rules straight through the vehicle. That is paper in
front of it, not behind it.

**Rejected: masking with the view's silhouette,** which is the obvious tool and the
wrong one. It is a simplified hull — a tractor's is 27 points — built for deciding
whether a click landed on a vehicle, where being a little loose costs nothing. Masking
a render with it clips whatever detail stands outside the hull.

**Why the flood is safe:** it only takes ground it can reach from the border. A white
window inside a vehicle is not reachable and stays opaque, and the dark outline every
render carries is what the flood stops at. Verified by forcing the card's paper to
loud red: 0% of the pixels over the vehicle's body carry the paper's ink, against 10%
on the blank card beside it, where the rules are.

**Cost, measured across all twelve models:** a level change rebakes the card at 6.5ms
mean and 12.1ms worst, against 0.27ms for a steady frame. The bake was already the
expensive one — `shadowBlur` is why it is baked at all — and the flood is a 128x128
walk on top of it. It lands during the wipe, which is the frame the game is already
spending on a transition.

**Threaded:** `cutGround` and `GROUND_AT` in `src/layers.js`, called from `bakeCard`.

### [2026-09-09] A desk, because the music was burying the board

**Decision:** `src/audio.js` grows a mixer. Effects and music each have a fader into a
master, and between the music fader and the master sits a gain every effect presses
down and lets back up. How far each sound presses is a `duck` column in the voice
table: a find and a refusal take the whole duck, a click on bare ground a third of one,
an already-found click a quarter. `MIX` and `DUCK` hold the defaults, `levels()` moves
them live, and `setMusic(url, trim)` puts a loop under the board.

**Pressure:** auditioning loops against the game, the board's own sounds could not be
heard. That is not a level problem: the find blips sit between 220 and 1760Hz and a
disco loop has most of its energy under that, so a music level low enough to leave them
clear is too low to hear. The room has to be made at the moment it is needed.

**Rejected: one bus with the music simply turned down.** It trades one of the two
things away permanently. Ducking gives both — the loop can sit where it belongs and
still get out of the way sixty times a round.

**Rejected: a `DynamicsCompressor` fed from the effects bus,** which is how a sidechain
is usually built. `music_loom`'s master chain records why not: under
`node-web-audio-api` that node does not limit, it inflates towards a constant level, so
a graph leaning on it measures as a lie outside a browser. A dip scheduled on a gain is
exact, reproducible, and legible in a way a compressor's attack and knee are not.

**Rejected: one duck depth for every sound.** A click on bare ground is not worth the
hole a find is worth. Because the depth is a share carried by the voice, the difference
is a number in the table rather than a branch in the code.

**Read off wherever the gain is, not from a remembered value.** Two finds in quick
succession would otherwise have the second ramp up from a level the first had already
left, and the music would surge between them. `cancelScheduledValues` then
`setValueAtTime(gain.value)` is what makes overlapping ducks compose.

**Also settled here:** the chime's path is now a parameter with the old constant as its
default, following `loadViews(root)`. A bench sitting two directories down was
resolving `assets/sfx/...` against itself and getting a 404.

**Measured on the bench, driving the game's own module:** a find takes the music to 35%
and a ground click to 77%, which is `1 - depth × share` for both, and it rides back to
full in the release. `research/disco-loops/mixer.html` is where that is heard rather
than read — it fires the real voices against a real loop through the real bus.

**Threaded:** `MIX`, `DUCK`, the `duck` column in `VOICES` and `FIND`, and the desk
inside `createVoice` in `src/audio.js`; `research/disco-loops/mixer.html`.

### [2026-09-09] The voices are balanced against each other, not chosen one at a time

**Decision:** `BALANCE` in `src/audio.js` declares how loud each sound is meant to be
against a find, in decibels, and the gains are solved to hit it. The find is the
reference because it is what the player is hunting for. Loudness is the loudest 50ms,
K-weighted per ITU-R BS.1770.

**Pressure:** five gains picked by ear are five unrelated numbers. Rendered offline and
measured, the refusal sat 3.8dB *above* the find and the win 10.3dB above — so the
sound that costs you shouted over the sound you were listening for, and the win was
close to twice the perceived loudness of anything else.

**Why the numbers were that far out:** a gain is not a loudness. The three offenders
are exactly the three whose waveform makes gain a bad proxy — a 135Hz square, a stack
of sines, and a recorded sample. The two plain sines, `ground` and `again`, barely
moved when solved, which is the tell.

**Rejected: plain RMS as the measure.** It reads the refusal as quieter than it sounds,
because most of its energy is at 135Hz where the ear is least sensitive. K-weighting —
a high shelf at 1681Hz and a high-pass at 38Hz — is what makes a low square and an
880Hz sine comparable, and it is a standard rather than something invented here.

**Rejected: integrated loudness over each sound's own length.** A 45ms blip and a
two-second chime are not comparable that way: the chime would measure quiet for being
mostly decay. The loudest 50ms asks how loud a thing seems at its loudest, and 50ms is
short enough that the shortest blip nearly fills the window.

**Rejected: leaving the refusal above the find.** There is an argument for it — the
refusal is what costs you the run. But the wash and the meter already say so, and a
buzzer that shouts twenty times a stage is what makes a player reach for the mute. It
sits 2dB under the find, and that is a dial rather than a law.

**What this cost elsewhere:** `buildTone` and `buildFind` came out of `createVoice` to
module scope, so the thing measured is the thing played. A loudness read off a second
copy of the arithmetic measures the copy.

**Measured after solving, twice around:** every voice within 0.03dB of its declared
place. The refusal needed the second pass — a square's loudness is not quite linear in
its gain through the weighting and the decay envelope together.

**Threaded:** `BALANCE` and the solved gains in `src/audio.js`; `buildTone` and
`buildFind`; the balance panel in `research/disco-loops/mixer.html`, which re-measures
the shipped voices against the table.

### [2026-09-09] Balanced is not the same as loud enough

**Amends the entry above it.** The relative balance stands; what it was missing is an
absolute one.

**Decision:** `BALANCE` gains a `findLufs` anchor saying where the whole set sits, and
every music loop carries a measured `normGain` bringing it to a bed of -18 LUFS.
`setMusic` takes that gain alongside the trim.

**Pressure:** the voices were placed correctly against each other and still could not
be heard. Measured against the top-rated loop, a find sat 15.9dB under it open and
6.8dB under it ducked. Two of the five had been made *quieter* by the balancing pass —
so the answer to "the sounds are hard to hear" had been to turn two of them down.

**A relative table cannot catch this, which is the lesson.** Every row read within
0.03dB of its target while the whole set was buried. An offset table has no opinion
about where the set sits, so the panel that checks it grew a row that measures the
find against the loop that is actually playing.

**Rejected: leaving the music fader to do it.** The four candidates measure from -13.8
to -26.5 LUFS — nearly thirteen decibels apart. One fader over that spread leaves the
board shouting over a quiet track and buried under a loud one. The loudness is a
property of the track, so the correction travels with the track.

**Rejected: normalising by peak.** Peak says nothing about how loud a thing sounds; it
is what the loudest single sample happens to be. The bed is set by integrated loudness
per EBU R128, and the peak is checked afterwards only to confirm nothing clips after
the lift -- the worst case is the quietest loop, which needs +8.5dB and still peaks at
-1.2 dBFS.

**Also caught:** the balance panel was carrying its own copy of the win's gain, so it
reported a 10.6dB drift that was its own staleness. `WIN_GAIN` is exported now and the
panel reads it. A checker with a second copy of the thing it checks is not a checker.

**Where it lands:** a find clears a ducked loop by 6.5 to 8.4dB across all four
candidates, against 1.9dB of spread between them. Under an open loop it sits about
level, and the duck is what lifts it clear.

**Threaded:** `BALANCE.findLufs`, the lifted gains and `WIN_GAIN` in `src/audio.js`;
the track gain in `setMusic`; `BED_LUFS`, `integrated()` and `normGain` in
`research/disco-loops/shortlist.py`; the anchor rows in the balance panel.

### [2026-09-09] The game gets an options panel, and it is HTML

**Decision:** a three-line opener sits bottom-right over the canvas and raises a panel
holding the sound and music controls. `src/options.js` builds it, `src/music.js` is the
track table, and `styles.css` carries the look. Music is off until chosen, and the
tracks are named by the first word of their title.

**Rejected: drawing it on the canvas** like everything else in the game. A slider drawn
there is a hundred lines of hit-testing and drag state to arrive at something an
`<input type=range>` already does — with keyboard access, focus, and a screen reader
name thrown in. The board is a picture and this is a form; they are different jobs.

**Rejected: putting it in `index.html`.** It has nothing to say until there is a desk to
move, and building it in `options.js` keeps the markup to the one canvas the game
actually is.

**Rejected: starting a track on load.** Music under a visual search is a preference and
not a default. A game that begins by playing something at you has decided for the
player, and the first thing many will do is go looking for the switch.

**A fader's travel is squared** rather than straight. On a linear gain scale halfway up
is barely quieter than the top and everything useful is crammed into the last third of
the throw; squaring puts the halfway point around twelve decibels down, which is what a
hand expects halfway to be. The board's fader reaches past unity and the music's does
not: the music's level was measured against a bed, and going past it would undo that.

**What ships with the tracks.** All four are CC0 and the provenance travels with them
in `music.js`, along with a `master` flag saying whether the file is the published
master or a preview — three of the four are Freesound previews, which are fine to play
and to choose by, and are the thing to replace before a store page.

**Caught while doing it:** `shortlist.py` owned the whole of `shortlist.json`, so
re-running the measurements erased the hand-written ratings. The ratings now live in
`ratings.json` and the script merges them in. A script that measures should not own the
file that also holds an argument.

**Threaded:** `src/options.js` and `src/music.js`; the `.opts-*` rules in `styles.css`;
the one `createOptions` call in `src/main.js`; `assets/music/`.

### [2026-09-10] A music loop is rendered once, with its join blended forward
**Decision:** `buildLoop` in `src/audio.js` cuts the bar-aligned trim out of the decoded
file and mixes the loop's head, under an equal-power pair over 12ms, with what the file
does *after* `endSec`. `setMusic` plays that buffer whole; the source carries no loop
points. A trim with less than 12ms of file left after it is refused rather than spliced.
**Why:** `loopStart`/`loopEnd` is a hard splice, and the trim is where the splice lands —
not the end of the file. Measured at the trim as a percentile of each track's own
sample-to-sample movement, the wrap is sharper than 100% of Funky, 100% of Piano, 77% of
Disco and 63% of Techno-ish. Blending forward drops those to 21%, 66%, 51% and 31%, and
the sample-value step across the join falls by roughly 25× on the two worst. The material
after `endSec` is the take carrying on past the bar, which is exactly the sound the wrap
interrupts, and using it leaves the loop its stated length.
**Rejected:** blending the head up from what comes *before* `startSec`, which is what
`research/disco-loops/shortlist.html` did — three of the four trims start at or within
6ms of the file's head, so there is nothing there to blend with and the loop fades in
from silence. It closes no step and digs a hole: Funky lost 2.5dB across the wrap.
Rejected: shortening the loop by the fade and folding its own tail over its head — the
classic, and the best number of the three on two tracks, but it drags the pulse forward
12ms on every repeat, which is the drift the bar-aligned trim exists to prevent.
**Caught while doing it:** `shortlist.py`'s `joinPercentile` measures the *untrimmed*
file's wrap — the end of the download meeting its start — which is a join nothing plays.
It is what said Funky (46.5%) and Techno-ish (10.4%) loop cleanly and only two tracks
needed help. At the trim all four need it. The number is still on the cards, relabelled
as a property of the download; `shortlist.py` still computes the old one.
**Threaded:** `buildLoop` and `LOOP_CROSSFADE_MS` in `src/audio.js`, used by `setMusic`
there and by `research/disco-loops/shortlist.html`; `tests/audio.test.js`.

### [2026-09-10] The run is a module, not a thing each page rebuilds
**Decision:** `src/run.js` holds the run — depth, attempt, the meter, the dealt board,
its colouring, and the object a compositor is handed. `src/main.js` and `dev/juice.html`
both drive it and neither deals a board of its own. It exposes `goTo`, which the game
only ever calls forwards, because the bench steps about the path.
**Why:** the bench is the instrument every tuning number is chosen on. A bench with its
own copy of the deal chooses them against a board the game never shows, and nothing
catches it, because both halves go on working. It had already drifted twice: the bench's
deal had no retry stride in it, so its stage 2 was not the game's stage 2 after a death,
and its readout printed a `round.misses` that was removed when the meter arrived.
**Rejected:** leaving the copy and keeping the two in step by hand — that is the
arrangement that produced the drift. Rejected: having the bench rebuild a whole run to
step backwards through the path — the board layer is handed the run's cache canvas when
the scene is built, so a replaced run leaves the layer drawing into the old one.
**Verified:** both trees instrumented at `deal` and `layout` and driven through the same
click sequence — the same stage, the same seeds across a win and three deaths
(1983, 1984, 1984+7919, +2×7919), the same span and field.
**Threaded:** `src/run.js`; `src/main.js`; the module list in `dev/build_artifact.py`;
the driver half of `dev/juice.html`.

### [2026-09-10] The options panel remembers, and that includes the music
**Decision:** `src/options.js` keeps `{ master, sfx, music, muted, track }` under
`parts-disco/options` in `localStorage`, written whenever a fader moves or a track is
picked, and read once when the panel is built. The track is kept by name and looked up
in `TRACKS`; a name no longer there restores as off. On load the panel calls the same
`choose` a click calls, so a returning player's track is loaded and lit.
**Why:** a player who turns the music on and pulls the board down has said how they
want to play, and a reload that asks again is asking them to say it twice.
**Rejected:** keeping the track's row rather than its name — a track that later leaves
`TRACKS` would restore as a preference for a file that is gone.
**The cost, which is a real one:** the panel's earlier ruling was that music never
starts on load. It still does not start for anyone who has never chosen a track, but a
returning player who did choose one now gets it back, and whether that is heard before
their first click is the browser's autoplay policy rather than anything this game
decides. Under an automation browser with autoplay allowed it plays immediately; under
a normal policy the context stays suspended and the loop waits for the first click. The
alternative is remembering every setting except the one a player is most likely to have
an opinion about.
**Threaded:** `SAVED`, `remember()` and the `choose(track)` at the end of
`createOptions` in `src/options.js`.

### [2026-09-10] The board holds still
**Decision:** vehicles are dealt onto the field and stay where they land. The board
layer goes on caching its bitmap and blitting it, every effect goes on drawing over the
top rather than into it, and the renderer stays Canvas2D.
**Why:** every part of the game already assumes it, and the assumption is load-bearing
rather than incidental — the cached board is the reason a still board costs 0.22ms a
frame at any density. Nothing in the search needs motion: the pile is read by outline,
and the twins tier is where the difficulty lives.
**Rejected:** a drifting board, which was the open question this closes. It would have
cost the cached bitmap outright (every frame a different picture, so the keeping is a
copy paid for nothing), taken Canvas2D with it — measured at 14fps for a moving board
at this density, against 0.06ms a frame for the WebGL spike — and reopened line
shimmer, where a quarter-pixel move relocates 28% of the ink because a 1px
unantialiased line cannot move a third of a pixel.
**What is kept and what is not:** `research/WEBGL-RENDERER.md` stays, because the
payload and speed numbers in it are worth having if the question ever reopens. The
spike it reports on, `gl-spike.html`, is deleted along with the other unreferenced
files at the repository root — `board-default.png`, `board.txt`, `view-preview.html`
and `word-preview.html`. All of it is in the history at `d571920`.
**Threaded:** the cache in `createBoardLayer` in `src/layers.js`; the `held` canvas
owned by `src/run.js`.

### [2026-09-10] The game opens on a title, and the title is the loading screen
**Decision:** `src/title.js` draws a wordmark, the two lines of the pitch, a yard of
seven vehicles and one button. `main.js` paints it before it fetches anything, loads
the fleet, the face and the chime behind it, and waits for PLAY. `hit` answers false
until the fleet has landed, so the screen cannot be clicked past into a game with
nothing to deal.
**Why:** measured, the game pulls 2.2MB across 118 requests before its first frame,
and until then there is no board. That wait was being spent on a blank canvas. The
five games this one was measured against — Balatro, Dicey Dungeons, Hi-Lo, ploink,
Pegs X — have no loading screen between them; Balatro's title screen is the cover, and
its wordmark is built out of a live playing card, the game's own object doing the
typography's job. The yard here is the same move: it is empty while the fleet is in
flight and fills when it arrives, which is the ready signal, and the button goes from
the panel's quiet grey to the green a find wears.
**Rejected:** a progress bar or a percentage — it reports on the machine rather than on
the game, and the content arriving says the same thing in the game's own language.
Rejected: a splash screen that is replaced by the title — two screens where one will
do. Rejected: modes on the title screen, which is what was asked for — none of the five
references has a mode menu, their variation is stakes, seeds and unlockables chosen
behind PLAY, and choosing which of those this game wants is a question for after
someone other than its author has played the sixteen stages.
**Caught while doing it:** `run.pointIn` took a DOM event and called
`getBoundingClientRect`, against both `main.js`'s own header ("the only file that
touches the DOM, the clock or an event") and the rule that core logic never reaches for
the DOM. The conversion is now `pointOf` in `main.js`, which the title and the board
both use, and the run answers `onBoard(point)` instead.
**Threaded:** `src/title.js`; `openOn` and `pointOf` in `src/main.js`; `onBoard` in
`src/run.js`; `ring`, `inkStroke` and `roundRect` exported from `src/layers.js`;
`tests/title.test.js`.

### [2026-09-10] The seed is drawn fresh every launch and shown in the panel
**Decision:** `freshSeed` in `src/run.js` draws six digits from `crypto` at start-up,
`run.reseed` takes a new one and restarts from the first yard, and the options panel
shows it in an editable field beside a "new" button. It is deliberately not saved with
the rest of the panel's settings.
**Why:** the seed was the constant 1983, so every launch dealt the same sixteen yards
in the same order. A search game whose boards are memorised between sittings is not
being searched. Verified: three cold launches gave 414667, 191761 and 762732, and
typing a seed back reproduced its board byte for byte.
**Rejected:** saving the seed with the faders and the chosen track — persistence is
what the rest of that panel is for, and applying it here would restore the fixed-seed
behaviour on the second visit. What the field is for is going back to a run you liked
or handing it to somebody else, which is a thing you do on purpose.
**Threaded:** `freshSeed` and `reseed` in `src/run.js`; the Run section of
`src/options.js`; `.opts-run` and `.opts-seed` in `styles.css`.

### [2026-09-10] The meter's cliff stays where it is
**Decision:** ten units, a whole unit at stage 1 falling to a quarter at stage 16,
carried across the whole run. Unchanged.
**Why:** the panel round measured what the tuning actually costs — one wrong vehicle
per stage clears all sixteen while spending 8.75 of the 10 units, and at 1.6 wrong per
stage the run ends before stage 9, which is where the near-twins arrive. That was put
to the owner as a content gate rather than a difficulty dial, and the owner kept it
knowing the number: the game is meant to be hard, and reaching the twins is meant to
be earned.
**Rejected:** scaling the cost by a stage's target count, raising the capacity, and
flattening the curve. All three remain available if a real player disagrees; none is
blocked by anything but this ruling.
**Threaded:** `CAPACITY`, `COST_FIRST` and `COST_LAST` in `src/meter.js`.

### [2026-09-10] The throw is fair, and there is now a bench that says so
**Decision:** boards go on being thrown rather than composed, and
`dev/reachability.html` measures whether any target is ever unclickable.
**Why:** every ancestor named in `GAME-SHEET.md` — Where's Wally, I Spy, Hidden Folks —
is hand-composed, with a person deciding how hard each target would be. This game is
the first in that line without an author per board, and nothing in the throw guaranteed
the vehicle being asked for was not buried under three others. A board that asks for
something it has covered up is asking for something no amount of looking can give.
**Measured:** `stampRegions` paints each silhouette in its index colour in draw order,
which is the same order `pick` resolves a click in, so the stamp is exactly the map of
what can be clicked. Over 40 seeds × 16 stages = 640 boards and 6,631 targets, nothing
was ever fully covered. The worst case was 376 px² — about a 19-pixel square — at stage
15, and only one target in 6,631 came in under 400 px².
**Rejected:** hand-composing boards, which would answer the fairness question and cost
the seed everything it is worth. Rejected: leaving it unmeasured, since the density is
the one thing most likely to move.
**Threaded:** `dev/reachability.html`; `stampRegions` in `src/layers.js`; `pick` in
`src/game.js`.

### [2026-09-10] A conveyor belt costs what a still board costs
**Decision:** a moving board is drawn by pre-rendering it into a strip and blitting the
strip at a whole-pixel offset, not by redrawing the vehicles each frame. `dev/belt.html`
is the bench the numbers come from and the one to re-run if the approach changes.
**Why:** the sixteen-stage game holds still, and the measurement behind that ruling —
a moving board being unaffordable on Canvas2D — was taken by redrawing every vehicle
every frame. That is one way to move a board and it is the expensive one. Measured with
the pipeline flushed, redrawing costs 12.5ms at 20 vehicles and 110ms at 160, so the
old finding holds for what it actually measured. A strip blit costs 1.31ms and does not
move with density at all, because it is one copy either way. Snapping the offset to
whole pixels takes that to 0.23ms — the same as the still board's 0.22ms — because a
snapped blit is a memory copy and an unsnapped one resamples every pixel.
**What this overturns:** the reading that a moving board needs the WebGL renderer. It
does not; it needs the cache kept rather than thrown away. Rigid motion moves every
vehicle by the same offset, so the cached picture is still the right picture, just
somewhere else. Only independent per-vehicle drift loses the cache, and that is the
thing the still-board ruling is actually about.
**Also settled by the same trick:** line shimmer. A quarter-pixel move relocates 28% of
the ink because a one-pixel unantialiased line cannot move a third of a pixel. A
whole-pixel offset never asks it to.
**Caught while doing it:** the first sweep read 0.00ms for both strip modes. Canvas2D
queues work and returns, so a timer around `drawImage` measures how long it took to
ask. Reading one pixel back forces the drawing to have happened; every figure above is
taken with that flush, and the studio's standing warning about frames per second in a
headless browser is the same mistake wearing a different hat.
**Threaded:** `dev/belt.html`.

### [2026-09-10] Endless: the yard on a conveyor
**Decision:** `src/belt.js` runs a belt in one of four directions drawn from the seed,
in two-minute waves. Speed climbs continuously with the clock; density, size, ink count
and fleet tier step at each wave. Every wrong vehicle costs one unit of the same
ten-unit meter the campaign uses, and it is not wiped between waves, so a run ends on
the tenth mistake whenever it comes. The title screen now offers PLAY or ENDLESS.
**Why the belt is drawn the way it is:** `dev/belt.html` measured redrawing at 78ms for
120 vehicles against 0.23ms for a strip blitted at a whole-pixel offset. Sections are
dealt and rendered once, then blitted. A section is a picture made before any click
landed, so what the player has answered is drawn over the top — and only the answered
ones, so the overlay costs what they have earned rather than what is on screen.
**Rejected:** one loop serving both modes with a flag; constraining a new section's
colouring against the ink already on screen; the campaign's falling price per mistake.
**The known rough edge:** vehicle centres are inset half a span from each section edge
so nothing is clipped by the edge of its own canvas, which leaves a band at every seam
where centre density thins. Art reaches across from both sides so the join is covered,
but the band is visible. Removing it means splitting each section into a ground layer
and a sprite layer that may overhang, and teaching the hit test to follow the overhang.
**Verified:** both modes start clean; the belt moves; ten wrong vehicles end a run and
a dead run stops charging. That last one first read as a bug — thirty-two wrong clicks
counted against a ten-unit meter — and was the test harness clicking through death and
restart three times, not the meter.
**Threaded:** `src/belt.js`; `runEndless` in `src/main.js`; the two buttons and `hit`
returning a mode in `src/title.js`.

### [2026-09-10] The belt's ramp is a straight line from 40 to 150
**Decision:** `speedAt` runs the belt from 40px/s to 150px/s across the first wave's
two minutes, in a straight line, and keeps that rate afterwards rather than resetting.
**Why straight rather than eased:** an ease spends its steepest stretch in the middle
of a wave. The belt would visibly lurch at a moment when nothing else changed, and a
player attributes an unexplained change to something they just did. A straight line is
one creep at one rate. The wave boundary is where a step belongs, and the density
already steps there — which keeps the two dials tellable apart, the reason they were
put on different schedules in the first place.
**What the rate means in play**, at a 947px board: 23.7s to cross at the start, 6.3s at
the two-minute mark, 3.6s at four minutes, 1.6s at ten.
**Rejected:** capping the speed at 150, and re-ramping each wave from 40. Both give a
run a ceiling it can settle at, and this mode is supposed to end by beating the player
rather than by being survived.
**Verified** on the moving pixels rather than on the constant: one scanline
cross-correlated against itself a second later put the belt at 41, 43 and 43px/s in a
run's opening seconds, against 40 plus a few seconds of creep.
**Threaded:** `WAVE.speed`, `WAVE.speedAtWaveEnd` and `speedAt` in `src/belt.js`.

### [2026-09-10] Endless runs the campaign's path, and counts two kinds of wrong
**Decision:** a run is two minutes and uses `stageAt(n)` — run one is 1:1, run sixteen
is 4:4, and it holds there. The belt ramps 40 to 150px/s inside each run and resets at
the next; past 4:4 the ceiling rises 20px/s a run. Targets come from a shuffled roster
so every model is asked for before any repeats. Matches, wrong vehicles and escaped
targets are all carried between runs, and twenty wrong vehicles ends the game.
**Why the path rather than a curve of its own:** endless was built first with its own
density, size, ink and fleet schedule. That is two tables for one idea, and they drift:
a number tuned on one mode silently stops being true of the other. Sharing `PATH` means
the arrangement at 2:3 is the arrangement at 2:3 in both.
**Why the ramp resets:** it is what lets the belt be learned. Doing the same thing every
run makes the belt a constant the player comes to know, so the thing that changed
between run four and run five is legibly the arrangement and not the speed.
**Why escapes do not end a run.** Measured, for a player tagging nothing: 33 of the
asked-for vehicle ride past in run one, 82 by 1:4, 128 by 3:4 and 409 at 4:4. Any fixed
carried budget on escapes is spent long before the path is — 20 would end the game
inside the first run. They are counted and shown because letting the right one go past
is a real failure and the player should see it; what ends a run is the twenty wrong
vehicles, which costs the same at every stage.
**Threaded:** `WAVE`, `runOf`, `topSpeedOf`, `speedAt` and the `tally` in
`src/belt.js`.

### [2026-09-11] The belt has no seam
**Decision:** the belt is one continuous yard that happens to be rendered in pieces.
Vehicles carry belt coordinates and every section draws whatever reaches into it; the
belt is dealt a section wider than it is drawn; the bare ground is always one ink; and
a vehicle keeps the ink the first section to actually draw it gave it.
**Why each of those:** the first version had a visible stripe at every join, and it was
four faults compounding.

1. *Vehicles were dealt per section and inset so none straddled a join*, which left a
   band at every join where the crowd thinned.
2. *Two of the four directions were drawn with their belt coordinates running the wrong
   way.* Sections sitting next to each other on screen were two section-lengths apart
   on the belt. Fixed by using one mapping for all four — screen position is always
   belt coordinate minus offset — and letting the direction be only which way the
   offset moves.
3. *Vehicles were pruned on a one-screen window while three sections were live*, so
   sections were rendered from incomplete lists, and vehicles still on screen were
   being counted as having got away.
4. *Each section coloured its own map.* A section sees only its own window, so the
   ground breaks into different regions in each — one region on one side of a join
   against three on the other. A region can only be one colour, so most of the join has
   to disagree. Carrying the neighbour's edge inks as a constraint is the same problem
   wearing a hat. Pinning the ground removes it.

**Measured**, comparing the two canvases that meet at a join, pixel for pixel along the
shared edge. Flat ink disagreements, before and after: left-to-right 103 to 4,
right-to-left 194 to 2, top-to-bottom 94 to 0, bottom-to-top 200 to 0. What is left is
antialiasing on strokes at a canvas edge, one pixel wide.
**Caught while doing it:** pinning the ground exposed a second fault. A vehicle filtered
into a section but falling outside its canvas is a region with no pixels and no
neighbours, and `assignInks` gives such a region the ink it has used least — the
ground's. That ink then stuck, painting the vehicle the colour of the yard in every
section after. A vehicle now only takes an ink from a section that drew some of it.
**Also caught:** a probe that located joins by absolute section index while the belt had
travelled past section ten, so three rounds of "worst join" figures were measuring
ordinary columns. An ordinary vehicle edge scores about 0.4 on that metric, which is
why the numbers looked plausible.
**Threaded:** `renderSection`, `restock`, `screenOf` and `GROUND_INK` in `src/belt.js`;
the `fixed` argument to `assignInks` and `planBoard` in `src/paint.js`; `anchor.span` in
`ring` (`src/layers.js`) and `pick` (`src/game.js`).


### [2026-09-11] Shading a body that has no folds
**Decision:** the tracer writes two more things for every view — the terminator strokes
from a key light, and tone bands traced out of the shaded render as closed rings. A
group picks one of five treatments: flat, line art, terminator, two tone, three tone.
**Why:** line art describes a car and fails on a fish. Measured: with `use_crease` off
entirely, a puffer's line art is unchanged at 328 strokes and 1393 points — the model has
no fold for a crease line to land on, so every interior line it carries is a material
seam. Six fish were rendered every way before the call; two tone with the contour kept
and the interior line art dropped was the treatment that described the body at every
size.
**Rejected:** lowering the crease threshold, and `use_crease_on_smooth` — measured at
75°, 20° and 5°, all three return the same strokes. Rejected: the one-bit ordered screen
the prompt card uses — it reads as a screenprint, but it is pixels, and it cannot scale
with the stage or take a board ink.
**Cost:** a view grows. A fish view was about 20KB and is about 90KB, carrying strokes,
terminator strokes, a silhouette and three band sets. The 96 views the game ships were
not re-traced, so they have no bands yet.
**Threaded:** `tone_bands`, `setup_key_light`, `TONE_CUTS` and `write_view` in
`tools/model_views/render_views.py`; `BANDS` and `drawMember` in `dev/presentation.html`.

### [2026-09-11] The dev server takes one POST
**Decision:** `run.sh` accepts a POST to `/data/presentation.json` and to nothing else.
The presentation bench saves itself there.
**Why:** the bench is where a group's treatment, bearings and preview colour are chosen,
and there are six groups to work through. A page that cannot write its own settings
makes the owner retype them into a file, which is how a bench and a data file drift.
**Rejected:** `localStorage` with an export button — the settings then live in one
browser profile, and the export is a step that gets skipped. Rejected: a second server
for writes — one command starts the dev environment, and that is worth keeping.
**Threaded:** `WRITABLE` and `do_POST` in `run.sh`; `save()` in `dev/presentation.html`.

### [2026-09-11] One card treatment, shared by both panels
**Decision:** `promptCanvas` in `src/layers.js` takes a one-bit render and gives back a
canvas that is ready to scale: the dither averaged into greys, and the white ground cut
away. The campaign panel and the belt panel both use it. The belt does it once, when
the render loads, not once a frame.
**Why:** the belt drew the render straight from the `Image` at whatever size the panel
had room for. The renders are 512 pixels and one bit deep, so every grey in them is a
halftone. A canvas asked to scale that by a non-integer factor beats the dot grid
against the pixel grid, and the vehicle comes out under bright cross hatches. The
campaign already solved this and kept the solution private to its own layer, so the
second panel repeated the fault the first one had been built to avoid.
**Measured**, hatch dots per thousand body pixels, before and after: tractor 15.7 to 0,
firetruck 12.1 to 0, police 15.6 to 0, sedan 22.3 to 0. The live endless panel reads 0
across 8,314 body pixels.
**Caught while doing it:** the first measurement compared unlike things. `cutGround`
makes the ground transparent, and a transparent pixel reads as black through
`getImageData`, so it counted as part of the vehicle and tripled the denominator. Both
pictures are now composited onto white before they are counted.
**Threaded:** `promptCanvas`, `flatten` and `cutGround` at module scope in
`src/layers.js`; `printed` in `drawPanel` in `src/belt.js`.
