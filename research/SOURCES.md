# Art sources — public-domain and CC schematic drawings

Candidate sources for the game's part art: exploded, cutaway and assembly line
drawings that are free to trace, cut up and ship.

Status of every link below: **retrieved via search, landing page not opened from this
session** — the container's egress proxy denies every host outside GitHub and the
package registries, so nothing here has been fetched or eyeballed. Titles, counts and
licence statements come from the search index, not from the page itself. Confirm each
before an asset ships.

Ranked by fit for this game, not by size.

---

## 1. US utility patent drawings — best fit

Black ink line on white, exploded assemblies, numbered leader lines, and a
specification that names every number. Target geometry, hotspot and label, already
authored.

- Patent Public Search — <https://www.uspto.gov/patents/search/patent-public-search>
- Open Data Portal, document download API — <https://data.uspto.gov/apis/patent-file-wrapper/documents>
- PatentsView API — <https://search.patentsview.org/docs/> (whether it needs a key is unconfirmed; sources conflict)
- Google Patents Public Datasets (BigQuery; bibliographic + full text, not bulk images) — <https://cloud.google.com/blog/topics/public-datasets/google-patents-public-datasets-connecting-public-paid-and-private-patent-data>
- USPTO bulk downloads — <https://www.google.com/googlebooks/uspto.html>

**Licence.** The USPTO's Official Gazette notice on drawings in patents and published
applications is the primary document: <https://www.uspto.gov/web/offices/com/sol/og/2001/week03/patdrws.htm>.
General rule is no copyright restriction; the exception is a drawing carrying an
explicit copyright notice, which the regulations permit an applicant to add. Rare, but
it is a per-figure check, not a blanket clearance. Site terms: <https://www.uspto.gov/terms-use-uspto-websites>.

**DeepPatent** — 350k+ pre-cropped USPTO drawings, described as public domain:
<https://github.com/GoFigure-LANL/DeepPatent-dataset>. Built from *design* patents
(2018–2019), so ornamental surface views, frequently stippled and shaded. Wrong
register for a schematic game; noted so nobody re-finds it and gets excited.

## 2. Pre-1930 automotive encyclopedias (Internet Archive)

Period automotive cutaway and exploded work — actual cars, not generic machinery.
Public domain in the US by age; LoC records no copyright restrictions.

- Dyke's Automobile and Gasoline Engine Encyclopedia, 6th ed. (advertised as 492
  charts) — <https://archive.org/details/dykesautomobileg00dyke>
- Another Dyke's scan — <https://archive.org/details/dykesautomobileg00dyke_0>
- Google-digitised copy — <https://archive.org/details/dykesautomobile00dykegoog>
- LoC catalogue record — <https://www.loc.gov/item/21000210/>
- PDF on Commons — <https://commons.wikimedia.org/wiki/File:Dyke%27s_automobile_and_gasoline_engine_encyclopedia_(IA_dykesautomobileg00dyke_0).pdf>

## 3. US military technical manuals — cleanest licence

Works of the federal government, so public domain outright with no per-item notice
check. Parts catalogues are wall-to-wall exploded illustrations with numbered callouts
and a facing parts list, drawn to one house standard.

- LoC resource guide and inventory — <https://guides.loc.gov/us-army-technical-manuals>
- Obtaining copies — <https://guides.loc.gov/us-army-technical-manuals/obtaining-copies>
- Example item on Archive.org — <https://archive.org/details/milmanual-tm-9-1005-319-23-m16a2-maintenance--repair-manual>

## 4. HAER measured drawings (Library of Congress)

Large, obsessively detailed ink delineations of industrial machinery and engines.
~4,500 drawings as of Aug 2004. Available to the public without restriction.

- Collection record — <https://www.loc.gov/pictures/item/99472552/>
- HABS/HAER/HALS digital collection — <https://www.loc.gov/collections/historic-american-buildings-landscapes-and-engineering-records/>
- About / rights — <https://www.loc.gov/static/collections/historic-american-buildings-landscapes-and-engineering-records/about-this-collection/overview.html>
- NPS Heritage Documentation FAQ — <https://home.nps.gov/subjects/heritagedocumentation/faqs.htm>

Not automotive. Candidate for a single high-complexity board rather than the part deck.

## 5. Wikimedia Commons — thin

Listed for completeness. Category sizes from the search index:
`Exploded views of automobiles` 13 files, `Automotive diagrams` 182,
`Diagrams of automobile engine layouts` 121. Against 20 parts across several difficulty
tiers that is a rounding error, and much of it is modern flat-vector infographic rather
than schematic. Licences are per-file and mixed.

- <https://commons.wikimedia.org/wiki/Category:Exploded_views>
- <https://commons.wikimedia.org/wiki/Category:Exploded_views_of_automobiles>
- <https://commons.wikimedia.org/wiki/Category:Automotive_diagrams>
- <https://commons.wikimedia.org/wiki/Category:Diagrams_of_automobiles>
- <https://commons.wikimedia.org/wiki/Category:Diagrams_of_automobile_engine_layouts>

## 6. Smithsonian Open Access — CC0, unsurveyed

2.8M+ images released CC0 with an API and a GitHub data repo. Not searched for
mechanical drawing density yet; the technical-collections holdings are unknown to this
document.

- FAQ — <https://www.si.edu/openaccess/faq>
- CC announcement — <https://creativecommons.org/2020/02/27/smithsonian-releases-2-8-million-images-data-into-the-public-domain-using-cc0/>

---

## Raster to vector

Every source above is scans. Pipeline is crop → threshold → trace → clean → tag.

- **potrace** — <https://potrace.sourceforge.net/>, GPL-2.0-or-later. Build-time tool;
  the SVGs it emits are data, not a derivative of its code, so it does not reach the
  game's MIT licence.
- **vtracer** — <https://github.com/visioncortex/vtracer>. Licence not checked from this
  session.

Tracing saves the drawing, not the tagging. A traced figure arrives as undifferentiated
stroke soup with no notion of "this is the piston", so silhouettes and signature regions
are hand-authored either way. That cost is the same whichever source wins.

On scan rights: in the US a faithful reproduction of a public-domain 2D work is
generally held not to earn a fresh copyright, so the scan is not a second layer to
clear. Worth confirming per repository's own terms rather than relying on that.

---

## Retrieval

`fetch_sources.sh` pulls four items from each of sources 2–5. It enumerates via each
host's API and picks with a seed rather than hardcoding filenames, so it does not carry
guessed URLs. It has never been run — the egress proxy blocks every host it touches.
Source 1 has no comparable enumerate-then-download endpoint and needs a patent number
chosen by hand.

Downloads land in `downloads/`, which is git-ignored: nothing gets committed until its
licence is confirmed per file.

## What a sample run returned

`fetch_sources.sh` was run end to end; four pages of Dyke's and four Commons files
landed in `downloads/`.

- **Dyke's** pages come down clean at `w1200`, but a page is a page: figures share it
  with two columns of body text on toned stock, and the callouts are letters (A, B, C)
  keyed to the prose, not numerals. A board costs a crop and a background knock-out.
- **Patent sheets** beat it on both counts — a full sheet of line art on white, callout
  numerals with leader lines, and a description that names each numeral. `US4137884`
  sheet 1 carries five figures of one part family.
- **Commons** `Category:Automotive diagrams` holds 185 files, but they are photographs,
  treemaps and signage as often as schematics, and most carry CC BY-SA rather than a
  public-domain mark — attribution per asset, tracked in `downloads/commons_licences.tsv`.
- **TM 9-1005-319-23** has no `imagecount` in its Internet Archive metadata: the item is
  15 files, not a page-image scan, so the BookReader page path does not reach it. Another
  item id or a direct PDF would be needed. It is also a rifle manual, not a car.
- **HAER** did not run. loc.gov answers 403 from a bot challenge, to curl and to a
  headless browser, on the JSON API as well as the page.
