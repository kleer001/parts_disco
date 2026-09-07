#!/usr/bin/env python3
"""Cut the figures out of harvested patent sheets and vectorize them.

    ./trace.py --pages ../../tmp/raw --out ../../assets/figures

Reads the page PNGs `patent_harvest` renders, finds each figure on each sheet, traces
it, and writes one SVG per figure plus a `manifest.json` naming what came from where.

Offline tooling: nothing here ships with the game, and the SVGs it writes are the
only thing the game ever sees. Needs the venv in `requirements.txt`.
"""

import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image

from segment import read_ink, figure_boxes, crop
from vectorize import despeckle, trace_path, svg

PAGE = re.compile(r"page-(\d+)\.png$")

# Page 1 of a US grant is the front page -- bibliographic data, the abstract, and a
# representative figure that repeats off a drawing sheet. Its only original marks are
# lines of type, which segmentation reads as a figure ("15 Claims, 8 Drawing
# Figures"), so the drawings are taken from page 2 on.
FIRST_DRAWING_PAGE = 2

# A traced sheet that comes out this large is a page of body text that segmentation
# read as one figure, not a drawing. Cheaper to drop here than to spot by eye later.
MAX_PATH_BYTES = 220_000


def patent_dirs(root):
    return sorted(d for d in root.iterdir() if d.is_dir() and (d / f"{d.name}.pdf").exists())


def titles_for(root):
    """Patent number -> title, from whatever the harvest run recorded."""
    index = root / "titles.json"
    return json.loads(index.read_text()) if index.exists() else {}


def trace_sheet(png, sheet_id, out_dir, source):
    """Every figure on one sheet, written out. Returns manifest rows."""
    ink = read_ink(Image.open(png))
    rows = []
    for index, box in enumerate(figure_boxes(ink)):
        piece = despeckle(crop(ink, box))
        data = trace_path(piece)
        if not data or len(data) > MAX_PATH_BYTES:
            continue
        height, width = piece.shape
        name = f"{sheet_id}-{index}"
        (out_dir / f"{name}.svg").write_text(svg(data, width, height))
        rows.append({
            "file": f"{name}.svg",
            "width": width,
            "height": height,
            "bytes": len(data),
            **source,
        })
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pages", required=True, help="harvest output directory")
    parser.add_argument("--out", required=True, help="where the SVGs go")
    parser.add_argument("--limit", type=int, help="stop after this many figures")
    args = parser.parse_args()

    root = Path(args.pages)
    if not root.is_dir():
        sys.exit(f"{root} is not a directory")
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    titles = titles_for(root)
    manifest = []
    for patent in patent_dirs(root):
        number = patent.name.lstrip("US")
        source = {"patent": patent.name, "title": titles.get(number, "")}
        for png in sorted(patent.glob("page-*.png"), key=lambda p: int(PAGE.search(p.name).group(1))):
            sheet = int(PAGE.search(png.name).group(1))
            if sheet < FIRST_DRAWING_PAGE:
                continue
            rows = trace_sheet(png, f"{patent.name}-p{sheet:02d}", out_dir, {**source, "sheet": sheet})
            manifest.extend(rows)
            print(f"  {patent.name} sheet {sheet:>2}: {len(rows)} figures")
            if args.limit and len(manifest) >= args.limit:
                manifest = manifest[:args.limit]
                break
        if args.limit and len(manifest) >= args.limit:
            break

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    total = sum(row["bytes"] for row in manifest)
    print(f"\n{len(manifest)} figures, {total / 1024:.0f}KB of path data -> {out_dir}")
    return 0 if manifest else 1


if __name__ == "__main__":
    sys.exit(main())
