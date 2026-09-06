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

## Talking to hosts

- **A 429 or 503 stops the whole run; a 404 stops only that item.** REJECTED: catching
  a refusal per item and taking the next one — every following request is the same
  refusal knocked on again, it scales with the length of the list rather than with the
  problem, and it is what turns a short block into a long one.

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

## Open questions

<!-- Live only. Each one is deleted the day it is answered: the answer becomes a ruling
     above and an entry in the journal. -->
