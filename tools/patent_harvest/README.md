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

Exit codes: 0 when something was kept, 1 when nothing was, and 2 when a host refused
and the run stopped early. On a 2, the numbers already harvested are on disk and the
rest were not attempted — re-run later with the same list.

## When a host says stop

`fetch.py` is the only way this tool talks to a host. It holds six seconds between
requests to the same host, and it treats two failures differently on purpose. A
document that is not there is that patent's problem: it is recorded and the next
number is tried. A 429 or 503 is the run's problem — the host is refusing, and the
next number is not a fresh attempt at a different document, it is the same refusal
knocked on again. So a refusal is waited out on a widening delay, honouring
`Retry-After` when the server sends one, and if the host keeps refusing the run stops.

Walking a list of numbers through a refusal is what turns a short block into a long
one, and it can cost access to more of the host than the endpoint that started it.

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
