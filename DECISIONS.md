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

## Feel

- **Parts are drawn as outlines, nothing filled.** REJECTED: filled silhouettes — a
  pile of twenty filled parts buries the lower ones, and outlines are what the source
  art actually is; the cost is that occlusion cannot be a difficulty knob until some
  layers are filled.
- **Every part drifts on its own heading.** REJECTED: moving layers as groups — parts
  that move together read as one object, and it is differing motion that lets a player
  pull one outline out of a pile.
- **A find is answered by a pulse drawn over the board, not by repainting the board.**
  REJECTED: blinking the vehicle in the board's own pixels and repainting its box —
  the answer then cannot leave the vehicle's bounds, and the board rebuilds on the one
  frame the hit stop exists to make crisp.
- **Meaning is coloured off the board.** REJECTED: giving "found" or "wrong" a board
  ink — the map spends every ink on the puzzle, so a semantic ink would either break
  the colouring or be mistaken for a vehicle.
- **The panel's colours are separated by lightness, not hue.** REJECTED: an
  equal-lightness ramp with hue carrying the meaning — measured, it puts green and red
  0.021 apart in OKLab under simulated deuteranopia, which is the same colour.

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
- **A hit stop belongs to the clock.** REJECTED: each effect holding its own timer —
  a hold has to stop the whole board, and effects that each freeze themselves drift
  apart the moment two overlap.

## Open questions

<!-- Live only. Each one is deleted the day it is answered: the answer becomes a ruling
     above and an entry in the journal. -->
