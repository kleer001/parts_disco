#!/usr/bin/env python3
"""Pull patents by number, keep the ones dense enough to be a board, name their parts.

    ./harvest.py 4530318 5052355            # numbers on the command line
    ./harvest.py --from numbers.txt         # one number per line, # comments allowed

For each patent this writes, under --out (default ./harvested/US<number>/):

    US<number>.pdf          the grant document as filed
    US<number>.txt          its extracted text
    labels.json            {numeral: {name, votes, mentions, confidence}}
    page-NN.png            rendered pages, for cropping the figure by eye

and a run-level manifest.json listing what was kept, what was rejected and why.

Finding the numbers is still a manual step -- see research/PATENT-METHOD.md for the
Patent Public Search query strings. Automating that against an API whose response
shape has not been confirmed would only add guesses to the pipeline.

Stdlib only; shells out to poppler's pdftotext and pdftoppm. Offline tooling:
nothing here ships with the game.
"""

import argparse
import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from labels import extract_labels, screen

# Seen in live search-result URLs; never called from the authoring session.
PDF_URL = "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/{number}"
USER_AGENT = "trace_rom_studio-parts_disco/0.1 (https://github.com/kleer001/trace_rom_studio)"
RENDER_DPI = 200


def require(tool):
    if shutil.which(tool) is None:
        sys.exit(f"{tool} not found. Install poppler-utils and re-run.")


def read_numbers(args):
    numbers = list(args.numbers)
    if args.from_file:
        for line in Path(args.from_file).read_text().splitlines():
            line = line.split("#", 1)[0].strip()
            if line:
                numbers.append(line)
    cleaned = [n.upper().lstrip("US").lstrip(",").replace(",", "") for n in numbers]
    if not cleaned:
        sys.exit("No patent numbers given. Pass them as arguments or with --from.")
    return list(dict.fromkeys(cleaned))


def download_pdf(number, dest):
    request = urllib.request.Request(
        PDF_URL.format(number=number), headers={"User-Agent": USER_AGENT}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
    # A politely-worded HTML error page is still a failure; catch it here rather than
    # letting pdftotext produce an empty extraction three steps later.
    if not body.startswith(b"%PDF"):
        raise ValueError(f"response for {number} is not a PDF ({len(body)} bytes)")
    dest.write_bytes(body)


def harvest_one(number, out_root, render):
    target = out_root / f"US{number}"
    target.mkdir(parents=True, exist_ok=True)
    pdf = target / f"US{number}.pdf"
    txt = target / f"US{number}.txt"

    download_pdf(number, pdf)
    subprocess.run(["pdftotext", "-layout", str(pdf), str(txt)], check=True)

    labels = extract_labels(txt.read_text(errors="replace"))
    kept, reason = screen(labels)
    (target / "labels.json").write_text(json.dumps(labels, indent=2) + "\n")

    if kept and render:
        subprocess.run(
            ["pdftoppm", "-png", "-r", str(RENDER_DPI), str(pdf), str(target / "page")],
            check=True,
        )
    return {"number": number, "kept": kept, "reason": reason, "parts": len(labels),
            "dir": str(target)}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("numbers", nargs="*", help="US patent numbers")
    parser.add_argument("--from", dest="from_file", help="file of patent numbers, one per line")
    parser.add_argument("--out", default="harvested", help="output directory")
    parser.add_argument("--no-render", action="store_true", help="skip page PNGs")
    args = parser.parse_args()

    require("pdftotext")
    if not args.no_render:
        require("pdftoppm")

    numbers = read_numbers(args)
    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)

    results = []
    for number in numbers:
        try:
            result = harvest_one(number, out_root, render=not args.no_render)
        except (urllib.error.URLError, ValueError, subprocess.CalledProcessError) as error:
            result = {"number": number, "kept": False, "reason": f"{type(error).__name__}: {error}",
                      "parts": 0, "dir": None}
        results.append(result)
        mark = "keep" if result["kept"] else "drop"
        print(f"  {mark}  US{number}  {result['reason']}")

    (out_root / "manifest.json").write_text(json.dumps(results, indent=2) + "\n")
    kept = sum(1 for r in results if r["kept"])
    print(f"\n{kept}/{len(results)} kept. Manifest: {out_root / 'manifest.json'}")
    return 0 if kept else 1


if __name__ == "__main__":
    sys.exit(main())
