# patent_harvest

Turns a list of US patent numbers into candidate boards: the grant PDF, rendered
pages to crop figures from, and a `numeral -> part name` table read out of the
specification text.

Offline asset tooling. Nothing here ships with the game, so it is Python rather than
the house's vanilla JS — it needs regex and text work over PDFs, and this way the
game's runtime keeps zero dependencies.

## Run

    ./harvest.py 4530318 5052355
    ./harvest.py --from numbers.txt --out ../../assets/raw

Needs `pdftotext`, `pdfinfo` and `pdftoppm` (poppler-utils) on PATH; it exits rather
than producing empty extractions if they are missing.

Exit codes: 0 when something was kept, 1 when nothing was, and 2 when a host stopped
serving and the run ended early. On a 2, the numbers already harvested are on disk and
the rest were not attempted — re-run later with the same list.

## When a host says "not now"

`fetch.py` is the only way this tool talks to a host. It holds six seconds between
requests to the same host, and it sorts what comes back into three outcomes.

A document that is not there (404) is that patent's problem: waiting will not change
the answer, so it is recorded and the next number is tried.

A 429 or 503 means *not now*. They mean it for different reasons — 429 is rate
limiting, about what the caller did, while 503 is "a temporary overload or scheduled
maintenance" and is ordinarily nothing to do with the caller at all. Both ask for the
same move: wait, then ask again **for the same document**. That is what a 503 is for.

What neither licenses is skipping to the next number, which is wrong whichever it was.
If the host was briefly busy, a document that would have arrived on a retry has been
abandoned. If the host is shedding this caller, the next number is the same request
with a different name in it, and the knocks scale with the length of the list. So the
retry happens against the same URL on a widening delay, honouring `Retry-After` when
the server sends one, and a host still not serving after several of those ends the run.

Worth knowing when reading a log: some hosts serve an anti-automation block as 503
(Google's "Sorry..." page does), so a 503 that persists across backoff and covers
every path on a host is not the transient overload the status normally describes.

Finding the numbers is a manual step — the Patent Public Search query strings are in
`../../research/PATENT-METHOD.md`. That stays by hand until someone confirms an API's
response shape; guessing at one would only push slop into the pipeline.

## Test

    python3 -m unittest discover

Covers `labels.py`, which is the part with an algorithm in it. `harvest.py`'s network
path is unexercised — the authoring session's egress proxy blocks uspto.gov, so the
PDF endpoint has never been called.

## How the text is read

A patent page is two columns with line numbers printed every fifth line down the
gutter. Read whole-page, the columns interleave and a numeral ends up beside a phrase
from the other column, while every fifth line donates its margin number to the table
as a part that does not exist. So each column is extracted from its own half of the
page, and a run of line-end multiples of five that climbs the page is dropped.

Only the detailed description is fed to `labels.py`. The front page contributes
classification codes and cited patent numbers, the claims contribute claim numbers,
and all of them read as reference numerals.

## How naming works

`labels.py` reads every mention of a reference numeral, takes the noun phrase in front
of it, and lets the mentions vote. Each phrase also supports its own suffixes, so
"ignition distributor cap" backs "distributor cap" and "cap" as well. The winner is the
longest phrase still carried by at least half the mentions — specific enough to be
useful, common enough to be the name the draftsman meant.

Figure references, cited patent numbers and measurements are filtered out before
voting. Each entry carries a confidence, so a hand-check can start with the weakest.
