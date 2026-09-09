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
