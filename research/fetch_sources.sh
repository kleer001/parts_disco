#!/usr/bin/env bash
# Pull four sample schematics from each surveyed source into downloads/.
#
# Enumerates via each host's documented API and picks with a seed, rather than
# hardcoding filenames — so re-running with the same seed gives the same four, and a
# moved or renamed file surfaces as a failure instead of a silent miss.
#
# The HAER block needs a host loc.gov will serve. loc.gov sits behind a bot challenge
# that answers 403 to curl and to a headless browser alike, on the JSON API as well as
# the page, so that block ends the run under set -e.
#
# Usage: ./fetch_sources.sh [seed]

set -euo pipefail

SEED="${1:-1}"
OUT="$(cd "$(dirname "$0")" && pwd)/downloads"
UA="parts_disco-source-survey/0.1 (https://github.com/kleer001/parts_disco)"
PER_SOURCE=4

# Minimum seconds between any two requests this script makes.
MIN_GAP=6

mkdir -p "$OUT"

# Every fetch goes through here, and the gap is enforced inside it rather than at
# the call sites: the downloads happen inside `while read` pipelines, which run in
# subshells, so a delay any caller forgot -- or a shell variable tracking the last
# request -- would be silently lost. The timestamp lives in a file for the same
# reason. The gap is applied across all hosts rather than per host, which is
# stricter than needed and one less thing to get wrong.
STAMP="$(mktemp)"; echo 0 > "$STAMP"
trap 'rm -f "$STAMP"' EXIT

get() {
  local last now gap
  last=$(cat "$STAMP"); now=$(date +%s); gap=$(( now - last ))
  [ "$gap" -lt "$MIN_GAP" ] && sleep "$(( MIN_GAP - gap ))"
  date +%s > "$STAMP"
  curl -fsSL --retry 3 --retry-delay "$MIN_GAP" -A "$UA" "$@"
}

pick() {  # pick N lines from stdin, seeded and stable
  python3 -c '
import random, sys
seed, n = int(sys.argv[1]), int(sys.argv[2])
lines = [l.strip() for l in sys.stdin if l.strip()]
if not lines:
    sys.exit("no candidates to pick from")
random.Random(seed).shuffle(lines)
print("\n".join(lines[:n]))' "$SEED" "$1"
}

# --- 2 & 3: Internet Archive book scans -------------------------------------------
# Page images come from the BookReader path; unverified from the authoring session,
# so a non-image response is a hard failure rather than a saved error page.
ia_pages() {
  local id="$1" label="$2" total
  echo "== $label ($id)"
  total=$(get "https://archive.org/metadata/$id" | jq -r '.metadata.imagecount // empty')
  [ -n "$total" ] || { echo "!! $id: no imagecount in metadata; inspect the item by hand" >&2; return 1; }
  seq 1 "$((total - 1))" | pick "$PER_SOURCE" | while read -r n; do
    local dest="$OUT/${label}_p${n}.jpg"
    get -o "$dest" "https://archive.org/download/$id/page/n${n}_w1200.jpg"
    file "$dest" | grep -qi 'image' || { echo "!! not an image: $dest" >&2; return 1; }
    echo "   $dest"
  done
}

ia_pages dykesautomobileg00dyke dykes
ia_pages milmanual-tm-9-1005-319-23-m16a2-maintenance--repair-manual tm9

# --- 4: HAER measured drawings ------------------------------------------------------
echo "== HAER"
get "https://www.loc.gov/collections/historic-american-buildings-landscapes-and-engineering-records/?q=engine+measured+drawing&fo=json&c=100" \
  | jq -r '.results[] | select(.image_url != null) | .image_url[-1]' \
  | pick "$PER_SOURCE" | while read -r u; do
      case "$u" in http*) ;; *) u="https:$u" ;; esac
      dest="$OUT/haer_$(basename "${u%%\?*}")"
      get -o "$dest" "$u"; echo "   $dest"
    done

# --- 5: Wikimedia Commons -----------------------------------------------------------
# imageinfo carries the licence per file; recorded next to the download.
echo "== Commons"
get "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=Category:Automotive%20diagrams&gcmtype=file&gcmlimit=500&prop=imageinfo&iiprop=url|extmetadata" \
  | jq -r '.query.pages[] | .imageinfo[0] as $i
           | [$i.url, ($i.extmetadata.LicenseShortName.value // "unknown")] | @tsv' \
  | pick "$PER_SOURCE" | while IFS=$'\t' read -r u lic; do
      dest="$OUT/commons_$(basename "$u")"
      get -o "$dest" "$u"
      printf '%s\t%s\n' "$(basename "$dest")" "$lic" >> "$OUT/commons_licences.tsv"
      echo "   $dest  [$lic]"
    done

echo
echo "Done. Files in $OUT (seed $SEED)."
echo "Source 1 (utility patents) has no enumerate-then-download endpoint — pick patent"
echo "numbers by hand from Patent Public Search and check each figure for a copyright notice."
