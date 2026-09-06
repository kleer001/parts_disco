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
