# figure_trace

Cuts the individual figures out of harvested patent sheets and vectorizes them into
the SVGs the game scatters.

Offline asset tooling, downstream of `../patent_harvest`. Nothing here ships with the
game — the SVGs it writes are the only thing the game ever sees.

## Setup

    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt

`potracer` is a pure-Python port of potrace, so nothing needs to be installed as root.

## Run

    ../patent_harvest/harvest.py --from numbers.txt --out ../../../tmp/raw
    .venv/bin/python trace.py --pages ../../../tmp/raw --out ../../assets/figures

Writes one SVG per figure plus a `manifest.json` recording each figure's size and the
patent and sheet it came off.

## How a sheet is cut up

A drawing sheet carries several numbered figures and one header line naming the
office, the date, the sheet and the patent. A figure is many disconnected marks — an
outline, its callout numerals, the leader lines between them — so `segment.py` grows
the ink until one figure's marks merge into a single blob, then takes that blob's box
back on the original ink. `GROW` is the knob: large enough to span a leader line's
gap, small enough to leave two figures on a sheet separate.

The header is dropped by where it sits and how short it is, not by reading it.

## What the trace produces

`vectorize.py` throws away specks below `MIN_SPECK` — scanner dust — then hands the
ink to potrace, which fits curves and finds corners. The result is a filled path
rather than a stroked one: potrace traces the boundary of the ink, so the line work
arrives as a shape that already has the weight the draftsman gave it.

Two things about potrace's input are measured rather than documented, and both are
silent when wrong. The array must be boolean or 0–255, because the black level is
compared on a 0–255 scale — a 0/1 array reads as one solid background and traces
nothing but the frame. And it is the complement that gets traced: handed the ink mask
directly, potrace fills the paper and leaves the line work as holes.

## Cost

`PRECISION` and `TRACE['opttolerance']` are where file size lives. Coordinates below
a hundredth of a source pixel carry nothing, and the digits are most of the bytes.
