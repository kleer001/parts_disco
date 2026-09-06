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

Needs `pdftotext` and `pdftoppm` (poppler-utils) on PATH; it exits rather than
producing empty extractions if they are missing.

Finding the numbers is a manual step — the Patent Public Search query strings are in
`../../research/PATENT-METHOD.md`. That stays by hand until someone confirms an API's
response shape; guessing at one would only push slop into the pipeline.

## Test

    python3 -m unittest discover

Covers `labels.py`, which is the part with an algorithm in it. `harvest.py`'s network
path is unexercised — the authoring session's egress proxy blocks uspto.gov, so the
PDF endpoint has never been called.

## How naming works

`labels.py` reads every mention of a reference numeral, takes the noun phrase in front
of it, and lets the mentions vote. Each phrase also supports its own suffixes, so
"ignition distributor cap" backs "distributor cap" and "cap" as well. The winner is the
longest phrase still carried by at least half the mentions — specific enough to be
useful, common enough to be the name the draftsman meant.

Figure references, cited patent numbers and measurements are filtered out before
voting. Each entry carries a confidence, so a hand-check can start with the weakest.
