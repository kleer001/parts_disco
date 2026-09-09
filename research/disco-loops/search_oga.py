"""Search OpenGameArt for CC0 music matching disco-ish keywords.

One request per keyword, six seconds apart, because that is the floor for repeated
requests to one host.
"""
import re, time, urllib.parse, urllib.request, json, sys

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
BASE = "https://opengameart.org/art-search-advanced"
KEYWORDS = ["disco", "funk", "funky", "groove", "boogie", "dance floor",
            "seventies", "soul", "bass groove", "party"]

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")

found = {}
for i, kw in enumerate(KEYWORDS):
    q = urllib.parse.urlencode({
        "keys": kw,
        "field_art_type_tid[]": 12,
        "field_art_licenses_tid[]": 4,
        "sort_by": "count",
        "sort_order": "DESC",
    }, doseq=True).replace("field_art_type_tid%5B%5D", "field_art_type_tid[]")
    url = f"{BASE}?{q}"
    try:
        html = fetch(url)
    except Exception as e:
        print(f"!! {kw}: {e}", file=sys.stderr); continue
    hits = re.findall(r'<a href="(/content/[^"]+)"[^>]*>([^<]{2,90})</a>', html)
    for path, title in hits:
        title = re.sub(r"\s+", " ", title).strip()
        if path not in found:
            found[path] = {"title": title, "keywords": []}
        if kw not in found[path]["keywords"]:
            found[path]["keywords"].append(kw)
    print(f"{kw}: {len(hits)} link hits", file=sys.stderr)
    if i < len(KEYWORDS) - 1:
        time.sleep(6.0)

json.dump(found, open("tmp/loops/oga-candidates.json", "w"), indent=1)
print(f"\n{len(found)} distinct CC0 music entries")
for path, d in sorted(found.items(), key=lambda kv: -len(kv[1]["keywords"])):
    print(f"  {d['title'][:60]:62s} {','.join(d['keywords'])[:34]:36s} {path}")
