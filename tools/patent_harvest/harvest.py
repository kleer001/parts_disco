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
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from fetch import Fetcher, HostRefusing
from labels import extract_labels, screen

# USPTO's own grant PDFs are page scans with no text layer -- pdftotext returns a
# handful of form feeds from them, so labels.py has nothing to vote on. Google's
# mirror carries the same pages plus an OCR text layer, back through the 1930s.
#
# This flat path is one hop and needs no HTML parsed. The mirror also serves each
# PDF under a content-hashed path that patents.google.com advertises in a
# citation_pdf_url meta tag, but that host rate-limits hard and answers 503 for a
# while once it does, and the hashed path cannot be derived without asking it.
# Checked against grants from 1936 to 1977; a modern grant carries its kind code in
# the filename (US6318332B1.pdf), so this shape is the pre-1980 one.
PDF_URL = "https://patentimages.storage.googleapis.com/pdfs/US{number}.pdf"
USER_AGENT = "trace_rom_studio-parts_disco/0.1 (https://github.com/kleer001/trace_rom_studio)"
RENDER_DPI = 200

# A patent page is two columns with printed line numbers running down the gutter.
# Read whole-page and the columns interleave: a phrase ends up beside a numeral it
# has nothing to do with, and every fifth line donates its margin number to the
# table. Each column is extracted on its own instead, from its half of the page.
COLUMNS = 2

# Line numbers are printed every fifth line, counting down a column, so a column's
# worth of them is an ascending run of multiples of five. Nothing shorter than this
# is taken for one, and a patent column does not run past this many lines.
MIN_MARGIN_RUN = 3
MAX_MARGIN_NUMBER = 70

PAGE_SIZE = re.compile(r"Page size:\s+([\d.]+) x ([\d.]+)")
PAGE_COUNT = re.compile(r"Pages:\s+(\d+)")
TRAILING_NUMBER = re.compile(r"\s(\d{1,2})\s*$")

# The detailed description is the part that names parts in the open. The front page
# contributes classification codes and cited patent numbers, the claims contribute
# claim numbers, and both read as reference numerals.
DESCRIPTION_START = re.compile(r"DE(?:TAILED|SCRIPTION OF THE)[^\n]*", re.IGNORECASE)
CLAIMS_START = re.compile(r"\n\s*(?:What is claimed|We claim|I claim|The invention claimed)",
                          re.IGNORECASE)


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


def download_pdf(fetcher, number, dest):
    body = fetcher.get(PDF_URL.format(number=number))
    # A politely-worded HTML error page is still a failure; catch it here rather than
    # letting pdftotext produce an empty extraction three steps later.
    if not body.startswith(b"%PDF"):
        raise ValueError(f"response for {number} is not a PDF ({len(body)} bytes)")
    dest.write_bytes(body)


def strip_margin_numbers(column):
    """Drop the printed line numbers from one column of a patent page."""
    lines = column.splitlines()
    marked = [(index, int(match.group(1)))
              for index, line in enumerate(lines)
              if (match := TRAILING_NUMBER.search(line)) and int(match.group(1)) % 5 == 0]
    values = [value for _, value in marked]
    # A real reference numeral can also end a line, and it repeats in no order. Only
    # strip these when they climb the page the way a printed line-number column does.
    if (len(marked) < MIN_MARGIN_RUN
            or max(values) > MAX_MARGIN_NUMBER
            or any(later <= earlier for earlier, later in zip(values, values[1:]))):
        return column
    for index, _ in marked:
        lines[index] = TRAILING_NUMBER.sub("", lines[index])
    return "\n".join(lines)


def pdf_text(pdf):
    """Extract the PDF a column at a time, in reading order."""
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True,
                          check=True).stdout
    width, height = (float(value) for value in PAGE_SIZE.search(info).groups())
    pages = int(PAGE_COUNT.search(info).group(1))
    span = width / COLUMNS

    out = []
    for page in range(1, pages + 1):
        for column in range(COLUMNS):
            text = subprocess.run(
                ["pdftotext", "-layout", "-f", str(page), "-l", str(page),
                 "-x", str(int(column * span)), "-y", "0",
                 "-W", str(int(span)), "-H", str(int(height)), str(pdf), "-"],
                capture_output=True, text=True, check=True).stdout
            out.append(strip_margin_numbers(text))
    return "\n".join(out)


def description_only(text):
    """The slice of the specification that names parts beside their numerals."""
    start = DESCRIPTION_START.search(text)
    text = text[start.end():] if start else text
    end = CLAIMS_START.search(text)
    return text[:end.start()] if end else text


def harvest_one(fetcher, number, out_root, render):
    target = out_root / f"US{number}"
    target.mkdir(parents=True, exist_ok=True)
    pdf = target / f"US{number}.pdf"
    txt = target / f"US{number}.txt"

    download_pdf(fetcher, number, pdf)
    text = pdf_text(pdf)
    txt.write_text(text)

    labels = extract_labels(description_only(text))
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
    require("pdfinfo")
    if not args.no_render:
        require("pdftoppm")

    numbers = read_numbers(args)
    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)

    fetcher = Fetcher(USER_AGENT)
    results = []
    refused = None
    for number in numbers:
        try:
            result = harvest_one(fetcher, number, out_root, render=not args.no_render)
        # A refusal is the run's problem, not this patent's: taking the next number
        # is the same knock on the same closed door, and it is what turns a short
        # block into a long one. Stop, and keep what was already harvested.
        except HostRefusing as error:
            refused = error
            break
        except (urllib.error.URLError, ValueError, subprocess.CalledProcessError) as error:
            result = {"number": number, "kept": False, "reason": f"{type(error).__name__}: {error}",
                      "parts": 0, "dir": None}
        results.append(result)
        mark = "keep" if result["kept"] else "drop"
        print(f"  {mark}  US{number}  {result['reason']}")

    (out_root / "manifest.json").write_text(json.dumps(results, indent=2) + "\n")
    kept = sum(1 for r in results if r["kept"])
    print(f"\n{kept}/{len(results)} kept. Manifest: {out_root / 'manifest.json'}")
    if refused is not None:
        remaining = len(numbers) - len(results)
        print(f"\nSTOPPED: {refused}", file=sys.stderr)
        print(f"{remaining} number(s) not attempted. Re-run later; what is on disk is kept.",
              file=sys.stderr)
        return 2
    return 0 if kept else 1


if __name__ == "__main__":
    sys.exit(main())
