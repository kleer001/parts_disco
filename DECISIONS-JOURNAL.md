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
