# DECISIONS — parts disco

The anti-canon. The code says what the game *is*; this says what was **ruled** and what
was **rejected**, so a settled call is not re-opened and a killed idea is not re-proposed
by a session that never heard the argument.

Terse on purpose: one line-pair per ruling, grouped by area, never dated. The reasoning
lives in `DECISIONS-JOURNAL.md` — this file is the index into it. **Read it before any
structural proposal.**

A ruling here binds sessions, not the owner. It records that an argument was had and how
it went; it is never a reason to refuse a change he asks for.

<!-- ENTRY CONTRACT

     - One ruling per line-pair, under the area it belongs to:
       - **[Ruling]** — the call. REJECTED: [alternative] — [one-clause why].
     - The rejected alternative is the payload. A ruling with nothing rejected has
       nothing to defend and does not belong here.
     - No dates, no supersession chains. When a ruling changes, OVERWRITE the line and
       append a dated entry to DECISIONS-JOURNAL.md. Git history is the process record.
     - Prune: delete a resolved open question, and a ruling the game no longer has a
       shape for. Split, don't kill — what leaves this file lands in the journal, never
       in nothing.
     - Add and drop area headings as the game needs them. -->

## Rules

- **A prompt names a part; any part carrying that name answers it.** REJECTED: asking
  for a callout numeral ("click part 42") — leader lines run from the numeral to the
  part, so it degrades into a text search and reads as easier, not harder.

## Losing

- **The meter is a fixed ten units wide and a wrong vehicle costs less the further
  down the path it is.** REJECTED: a fixed cost and a capacity that grows with the
  stage — a bar whose length changes cannot be read as progress at a glance, and
  reading it at a glance is the only reason to draw one instead of printing a count.
- **Only a wrong vehicle costs. A click on bare ground is free.** REJECTED: charging
  for both, which is what the old miss counter did — a click on paper is a slip or a
  look, and only a vehicle named wrongly is a wrong answer.
- **Damage carries across stages and is never given back by playing well.** REJECTED:
  credit for clearing a board — clearing buys progress, not patience, and two numbers
  moving at once makes the balance impossible to read while it is being tuned.
- **A death empties the meter and deals the same stage again.** REJECTED: keeping the
  meter full through a death — the player respawns and dies to the next wrong click,
  which is not a retry. REJECTED: sending the run back to the first stage — what a
  death costs is the board you were partway through, not your place on the path.
- **A retry deals a different yard from the same stage numbers.** REJECTED: repeating
  the identical board — the retry then rewards recall rather than the search the stage
  is asking for. The run still reproduces, because the attempt is counted and not
  rolled.

## Feel

- **Parts are drawn as outlines, nothing filled.** REJECTED: filled silhouettes — a
  pile of twenty filled parts buries the lower ones, and outlines are what the source
  art actually is; the cost is that occlusion cannot be a difficulty knob until some
  layers are filled.
- **Every part drifts on its own heading.** REJECTED: moving layers as groups — parts
  that move together read as one object, and it is differing motion that lets a player
  pull one outline out of a pile.
- **A level is taken off the screen by a wipe over a picture of it.** REJECTED:
  keeping the finished level's state alive and rendering both boards at once — every
  layer would then need to know which of two rounds it was drawing, to animate a
  handover that is over in well under a second.
- **The wipe leaves on the grid the *arriving* level rules, not the departing one.**
  REJECTED: the outgoing level's grid — the transition is then a goodbye, and the
  denser beat of a harder stage is the one thing the wipe can say before the board is
  playable.
- **A cell opens as the front reaches it, and its square grows in place.** REJECTED:
  a travelling edge with squares appearing behind it — the two ran on different clocks,
  so a cell went from nearly gone back to 88% covered the moment it became a square.
  Measured at 13% of the screen reappearing in one frame.
- **The wait on each grid line is what is left of a tread after the square has
  grown.** REJECTED: a pause added on top of the travel — the treads then no longer
  fill the lane's time, and a fine grid asks for eight seconds of pauses inside a
  750ms wipe. REJECTED: a fixed 50ms — it is a target, taken as a share of the tread
  and capped, so a coarse grid rests and a fine one hesitates.
- **A grid finer than `wipeCells` is read every kth line rather than every line.**
  REJECTED: honouring every ruled line — two hundred waits and twenty-five thousand
  squares nobody can see. The cost is that the last stages all wipe at the same beat.
- **A find is answered by a pulse drawn over the board, not by repainting the board.**
  REJECTED: blinking the vehicle in the board's own pixels and repainting its box —
  the answer then cannot leave the vehicle's bounds, and the board rebuilds on the one
  frame the hit stop exists to make crisp.
- **Meaning is coloured off the board.** REJECTED: giving "found" or "wrong" a board
  ink — the map spends every ink on the puzzle, so a semantic ink would either break
  the colouring or be mistaken for a vehicle.
- **A found vehicle rests in one neutral grey, off the board's palette.** REJECTED:
  rotating it onto another board ink that its neighbours are not wearing — the resting
  colour is the only record that a vehicle was found, and an ink some unfound vehicle
  is also wearing reads as one more thing to sort through.
- **A wrong click washes the vehicle it hit in light grey, and the wash fades.**
  REJECTED: leaving the wash on for the rest of the round — a permanently greyed
  vehicle is a candidate crossed off the list, which turns the difficulty dial rather
  than answering the click; the owner picks that dial, not the feedback.
- **One sheet of paper lies under the whole panel and every block is pressed into
  it.** REJECTED: leaving the panel plain white — the board is a printed thing and the
  panel beside it read as an empty page. REJECTED: a patch of paper under each block —
  the rules then stop at every edge, so the blocks read as cards lying on a white page
  rather than as recesses cut into one sheet.
- **The card is printed on paper of its own, and the render's ground is flooded away
  so the vehicle stands on the paper and hides it.** REJECTED: drawing the render as
  it is — its opaque white ground covers the paper everywhere but the card's margin.
  REJECTED: multiplying the render onto the paper — the rules then print through the
  vehicle, which is the paper in front of it rather than behind it. REJECTED: masking
  with the view's silhouette — that is a simplified hull for hit-testing, and it clips
  whatever detail stands outside it.
- **The panel's colours are separated by lightness, not hue.** REJECTED: an
  equal-lightness ramp with hue carrying the meaning — measured, it puts green and red
  0.021 apart in OKLab under simulated deuteranopia, which is the same colour.

## The options panel

- **The panel's settings are kept in `localStorage`, the chosen track by name.**
  REJECTED: asking again every visit — a player who turned the music on and the board
  down has said how they want to play, and a reload should not make them say it twice.
  REJECTED: keeping the track's row rather than its name — a track that later leaves
  `TRACKS` would come back as a preference for a file that is gone.
- **The panel is HTML laid over the canvas, not drawn on it.** REJECTED: canvas
  sliders — a hundred lines of hit-testing and drag state to arrive at something the
  browser already does, with the keyboard and the screen reader included.
- **Music is off until a player asks for it, and stays on once they have.** REJECTED:
  starting a track for someone who has never chosen one — music under a search is a
  preference, and a game that begins by playing something at you has made the choice
  for you. A returning player has made it themselves, so their track is put back; when
  it becomes audible is the browser's autoplay policy to decide, not this game's.
- **A fader's travel is squared.** REJECTED: a straight gain scale — halfway up one is
  barely quieter than the top, so every useful position is crowded into the last third
  of the throw.

## Talking to hosts

- **A 429 or 503 is waited out against the same URL; only a host still not serving
  after several backed-off tries ends the run. A 404 skips that item alone.** REJECTED:
  catching either per item and taking the next number — wrong whichever it was, because
  a briefly busy host would have served the document on a retry, and a host shedding
  this caller just gets the same request again under a different name.

## Art pipeline

- **Patent PDFs come from Google's mirror, by its flat `pdfs/US<number>.pdf` path.**
  REJECTED: USPTO's `image-ppubs` endpoint — its pages are scans with no text layer, so
  there is nothing to read part names out of. REJECTED: resolving the mirror's
  content-hashed path from `patents.google.com` — that host rate-limits hard and then
  answers 503 for a while, taking the whole art pipeline down with it.
- **Each patent column is extracted from its own half of the page.** REJECTED:
  `pdftotext -raw` — it gets the reading order right, but drops inter-word spaces, and
  "firstside ring" costs more than the margin numbers it saves.
- **Finding patent numbers stays manual.** REJECTED: automating the search — the
  PatentsView API has moved to USPTO's Open Data Portal with no search endpoint yet, so
  there is nothing to automate against.

## Simulation

- **A part's position is solved from t, not stepped.** REJECTED: integrating velocity
  each frame — a closed form lets a whole bounce cycle be searched offline for whether
  every part is reachable, and never drifts between two runs of the same seed.

## Content

## Tech

- **Tuning lives as a module constant in `src/juice.js`.** REJECTED: a JSON file the
  bench writes directly — nothing else in this game loads data at runtime, and a fetch
  on the critical path buys an edit round trip the bench's copy-out already covers.
- **Every sound but the win is made from oscillators; the win is a sample.**
  REJECTED: recording them all — a beep that is a row in a table is retuned by editing
  the table, and four samples is four downloads for sounds nobody will notice the
  timbre of. REJECTED: synthesising the win too — a chord of that kind is not
  something three oscillators do convincingly, and the win is the one moment worth a
  download.
- **The find climbs on a Shepard tone: three sine partials an octave apart under a
  loudness window fixed in pitch.** REJECTED: a capped linear climb — a scale cannot
  rise forever, so the cap flatlined the escalation from the seventh find on, and 11
  of the 16 stages ask for more than six.
- **The find that wins sounds, and the chime follows 250ms behind it.** REJECTED: the
  chime replacing that blip — the blip is what earned the win and the chime is what
  the win says back, so they are two statements and not one. REJECTED: timing the gap
  on the frame loop — it is booked on the audio clock, where a stalled frame cannot
  smear it.
- **Music and effects have their own faders, and the music ducks under every
  effect.** REJECTED: one bus and a quiet music level — the find blips sit between 220
  and 1760Hz and a disco loop has most of its energy under that, so a level low enough
  not to bury them is too low to hear. REJECTED: a `DynamicsCompressor` sidechain — a
  scheduled dip on a gain is exact, reproducible and readable, and the compressor
  behaves differently offline than in a browser.
- **The balance table carries an absolute anchor as well as the relative offsets, and
  every music loop is normalised to a bed.** REJECTED: relative placement alone —
  balanced but unanchored, every voice sat correctly against every other and the whole
  set was 6.8dB under a ducked loop. REJECTED: one music fader doing the job —
  published loops vary by more than ten decibels, so the fader means a different thing
  per track.
- **The voices' relative loudness is declared, and their gains are solved to hit
  it.** REJECTED: choosing five gains by ear — a gain is not a loudness. Measured, the
  refusal came out 3.8dB *above* the find it was meant to sit under and the win 10.3dB
  above, because a square, a sine and a recorded sample at the same gain are three
  different loudnesses.
- **How far a sound ducks the music is a column in the voice table.** REJECTED: one
  duck for everything — a click on bare ground is not worth the hole a find is worth,
  and the difference is a number per row rather than a branch.
- **The audio context is built before any gesture and the chime decoded with the
  fleet.** REJECTED: opening it on the first click, as `treasure_trash` does — a
  context may be built suspended and decoded into, so doing it up front removes the
  race in which a one-click level wins before its sound has finished decoding, and
  with it the null check that race would need.
- **A music loop is rendered once with its join blended forward, not played through
  `loopStart`/`loopEnd`.** REJECTED: the source's own loop points — a hard splice, and
  measured at the trim every one of the four shipped tracks is a sharper edge there
  than most of what is inside it, Funky and Piano sharper than all of it. REJECTED:
  blending the head up from what comes *before* `startSec` — at the head of a file
  there is nothing there, so the loop fades in from silence and the tick becomes a
  hole (Funky, -2.5dB across the wrap). REJECTED: shortening the loop by the fade and
  folding its own tail over its head — it drags the pulse forward by the fade on every
  repeat, which is the drift the bar-aligned trim exists to prevent.
- **The run is a module the game and the juice bench both drive.** REJECTED: the bench
  keeping its own copy of the deal — it is the instrument the tuning numbers are chosen
  on, so a copy that drifts picks them against a board the game never shows, and both
  halves keep working while it happens. It had already drifted: the bench dealt without
  the retry stride and printed a `round.misses` that no longer exists.
- **A hit stop belongs to the clock.** REJECTED: each effect holding its own timer —
  a hold has to stop the whole board, and effects that each freeze themselves drift
  apart the moment two overlap.

## Open questions

<!-- Live only. Each one is deleted the day it is answered: the answer becomes a ruling
     above and an entry in the journal. -->
