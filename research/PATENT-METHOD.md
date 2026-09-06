# Finding usable patent figures

How to go from "patents have good drawings" to a named, tagged part in the deck.

Same caveat as `SOURCES.md`: every claim below comes from the search index, not from
opening the page — the session's egress proxy denies uspto.gov. Confirm the syntax
against the USPTO quick-reference guides before building on it.

## The pivot

You are not searching for inventions. You are searching for **figures**. A patent about
a brilliant carburettor with one schematic side view is worthless here; a mediocre one
with a twenty-part exploded plate is exactly what the game wants.

The searchable proxy for "exploded schematic" is the Brief Description of the Drawings.
MPEP 608.01(f) requires a brief description of the several views, and the near-universal
house phrasing is `FIG. 2 is an exploded perspective view of...`. That sentence is in the
full text. Search for the sentence, not the subject.

## Query shape

Patent Public Search advanced syntax, per the USPTO searchable-indexes and operators
pages:

- Field codes are delimited by periods on both sides: `.cpc.`, `.spec.`
- CPC values carry **no spaces**: `F02M19/00.cpc.`, never `F02M 19/00`
- Operator precedence is `ADJ > NEAR > WITH > SAME`

So the shape is a drawing-style phrase ANDed with a classification drawer:

```
"exploded perspective view".spec. AND F02M.cpc.
"exploded view".spec. AND F16H.cpc.
exploded ADJ2 view .spec. AND B60T.cpc.
```

Vary the phrase — `exploded perspective view`, `exploded view`, `exploded assembly
view`, `perspective exploded` — because draftsmen's boilerplate is not uniform.

## The 1976 wall

USPTO full text runs **1976 to present**. For 1790–1975 you get images, patent number
and current classification only — no text to search. Google Patents offers OCR back to
1790, but it is OCR over the USPTO TIFFs and mistakes there return wrong or empty hits.

This forks the method:

- **1976+** — phrase search works, and the specification text is machine-readable, which
  is what makes number→name extraction possible. This is the productive band.
- **Pre-1976** — classification-only browsing, hand-picked. Prettier drafting, but every
  figure costs a human look and the labels have to be typed by hand.

Studio hunch, not a measured finding: the sweet spot is roughly **1976 to the mid-90s** —
late enough for full text, early enough that figures are still ink or pen-plotted rather
than flat CAD. Worth checking on the first spike rather than believing.

## Classification drawers

Verified subclass titles:

| CPC | Covers |
|---|---|
| `F02B` | Internal-combustion piston engines generally |
| `F02F` | Cylinders, pistons or casings for combustion engines; sealings |
| `F02M` | Supplying combustion engines with combustible mixtures — carburettors, injection pumps |
| `F02P` | Ignition (other than compression ignition) for IC engines |
| `F02D` | Controlling combustion engines |
| `F16D` | Couplings for transmitting rotation; clutches; brakes |
| `F16H` | Gearing |
| `B60K` | Arrangement or mounting of propulsion units or transmissions in vehicles |
| `B60T` | Vehicle brake control systems or parts thereof |
| `B62D` | Motor vehicles; trailers |
| `F01L` | Cyclically operating valves for machines or engines |
| `F01M` | Lubricating of machines or engines in general; lubricating internal combustion engines; crankcase ventilating |
| `F16C` | Shafts; flexible shafts; elements or crankshaft mechanisms; rotary bodies other than gearing elements; bearings |

`F01L` and `F01M` are separate drawers — valve-gear and lubrication — read from the CPC
scheme itself. A search result that ran the two together was wrong about it.

## Harvest loop

1. **Query** a phrase × CPC pair, collect patent numbers.
2. **Fetch** the document from Google's patent mirror, not from USPTO. USPTO's endpoint
   `https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/<number>` does serve
   a PDF for a bare patent number, but it is a page scan with no text layer, so there is
   nothing to read numerals out of. The mirror carries the same pages with OCR text, at
   `https://patentimages.storage.googleapis.com/pdfs/US<number>.pdf` — checked against
   grants from 1936 to 1977. `patents.google.com` advertises a content-hashed path for
   the same file, but it rate-limits hard and then answers 503 for a while, so the flat
   path is the one `harvest.py` uses.
3. **Screen** — most hits are junk for our purposes. Cheap automatic rejections:
   fewer than ~12 distinct reference numerals in the figure's description paragraph;
   ink coverage on the traced figure outside a sane band (a flowchart is too sparse, a
   shaded rendering too dense).
4. **Extract labels** — see below.
5. **Crop, trace, tag** — per the pipeline in `SOURCES.md`.

## Number to name

This is what patents have that a scanned encyclopedia does not, and it is the reason to
prefer them.

The detailed description names each part beside its numeral, in the open: *"the
distributor cap **42** having towers **44**..."*. A regex over the description for a noun
phrase immediately preceding a 1–3 digit numeral yields candidate pairs. Each numeral
recurs many times across a specification, so **frequency-vote** across all its
occurrences and take the most common phrase — that survives the odd sentence where the
grammar puts the wrong words next to the number.

Output is a table of `numeral → part name` for the figure, which is the prompt panel's
content and the answer key in one pass.

The leader lines in the figure connect each numeral to its part, so the numeral positions
also give a first approximation of each part's location — a starting point for the
silhouette and signature-region tagging, not a substitute for it.

## What the hosts tolerate

Six seconds between requests to a host is the studio's floor, and it is enough for the
document hosts: `patentimages` served a run of grants at that pace without complaint,
and `harvest.py` holds to it.

It is not enough for a search endpoint. `patents.google.com`'s query endpoint answered
503 partway through ten queries spaced six seconds apart, and once it starts refusing it
refuses everything on that host — the patent pages too, not just the queries — for a
good while. Continuing at a fixed interval through a 503 only extends it; the answer is
to stop and back off, and the PDF CDN stays up throughout, which is what makes the flat
mirror path worth having.

## Open items

- The PatentsView PatentSearch API is gone. `search.patentsview.org/api` now redirects to
  a USPTO transition guide: PatentsView moved to the Open Data Portal at
  <https://data.uspto.gov>, the search API is interrupted with no announced return date,
  and old API keys do not carry over. Bulk PatentsView tables are on ODP behind an ODP key
  and a USPTO.gov account. So searching by API is not merely unconfirmed, it is
  unavailable — which is why finding numbers stays a manual step.
- What a patent's OCR still costs the label table: a margin line number that does not sit
  at the end of its line survives, and words hyphenated across a line break come back
  split ("lubri cating hole"). Both land as one- or two-mention entries.
- Sub-numerals (`5a`, `5b`, `5c` — the features hanging off part 5) are drawn in the
  figures and named in the description, but the label table only reads bare numerals.

## Sources

- Operators — <https://www.uspto.gov/patents/search/patent-public-search/operators>
- Searchable indexes — <https://www.uspto.gov/patents/search/patent-public-search/searchable-indexes>
- Advanced search QRG — <https://www.uspto.gov/sites/default/files/documents/Advanced-search-overview-QRG-Patent-Public-Search.pdf>
- Search overview QRG — <https://www.uspto.gov/sites/default/files/documents/Patent-Public-Search-Search-overview-QRG.pdf>
- MPEP 608.01(f), Brief Description of Drawings — <https://www.bitlaw.com/source/mpep/608-01-f.html>
- CPC scheme, authoritative — <https://www.cooperativepatentclassification.org/sites/default/files/cpc/scheme/F/scheme-F01L.pdf> and siblings under `/cpc/scheme/<section>/scheme-<subclass>.pdf>`
- PatentsView transition to ODP — <https://data.uspto.gov/support/transition-guide/patentsview>
- CPC schemes and definitions — <https://www.uspto.gov/web/patents/classification/cpc/html/cpc-F02F.html>, <https://www.uspto.gov/web/patents/classification/cpc/html/defF02P.html>, <https://www.uspto.gov/web/patents/classification/cpc/pdf/cpc-scheme-F16H.pdf>, <https://www.uspto.gov/web/patents/classification/cpc/pdf/cpc-scheme-F16D.pdf>, <https://www.uspto.gov/web/patents/classification/cpc/html/defB60K.html>, <https://www.uspto.gov/web/patents/classification/cpc/html/defB60T.html>, <https://www.uspto.gov/web/patents/classification/cpc/html/defB62D.html>
- Full-text coverage dates — <https://libguides.princeton.edu/c.php?g=84225&p=543458>, <https://libguides.nypl.org/patents/historical-patents>

## Owner decisions

Kleer decided: patents are the bulk source, part names in the game are the **real
names** as given, and the callout numerals stay visible in the art as clutter with the
prompt panel keying on name plus silhouette.

Real names carry a research burden, and this source discharges it natively: each name
is read out of the specification that numbers the drawing, so the patent is its own
primary evidence. Recording the patent number beside each part in the deck data keeps
that citation attached to the claim.
