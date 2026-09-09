"""Harvest CC0 disco loops from Freesound.
import urllib.parse

Freesound is where the actual loops are: the OpenGameArt funk catalogue is songs,
which fade out and trail silence. Sounds here are named as loops and carry a bpm.

Two things are worth knowing about what this fetches. The audio is Freesound's own
`-lq` preview, because the master needs an account -- fine for auditioning, and CC0
puts no condition on using it, but the master is the thing to ship. And the licence
is read off each sound's own page rather than trusted from the search facet.

Every request to either host is six seconds after the last.
"""
import re, os, sys, json, time, html, urllib.request

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "..", "..", "tmp", "loops")
PAGES = os.path.join(CACHE, "fs-pages")
AUDIO = os.path.join(CACHE, "audio")
for d in (PAGES, AUDIO):
    os.makedirs(d, exist_ok=True)

QUERIES = ["disco loop", "funk loop", "disco funk", "funky bass loop",
           "disco drum loop", "seventies groove loop"]
CC0 = 'f=license%3A%22Creative+Commons+0%22'

last = [0.0]
def get(url, binary=False):
    wait = 6.0 - (time.time() - last[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    last[0] = time.time()
    return data if binary else data.decode("utf-8", "replace")

# ---- search --------------------------------------------------------------
found = {}
for q in QUERIES:
    url = f"https://freesound.org/search/?q={urllib.parse.quote(q)}&{CC0}&s=score+desc"
    at = os.path.join(PAGES, "search-" + re.sub(r"\W+", "-", q) + ".html")
    h = open(at, encoding="utf-8").read() if os.path.exists(at) else get(url)
    if not os.path.exists(at):
        open(at, "w", encoding="utf-8").write(h)
    for user, sid, title in re.findall(
            r'href="/people/([^/]+)/sounds/(\d+)/[^"]*"[^>]*title="([^"]*)"', h):
        found.setdefault(sid, {"id": sid, "user": user, "title": html.unescape(title)})
    print(f"{q}: {len(found)} so far", file=sys.stderr)

# Loops first: a name that says loop, and a bpm, is a sound cut to a bar.
def score(s):
    t = s["title"].lower()
    return (("loop" in t) * 2 + bool(re.search(r"\d{2,3}\s*bpm", t)))
shortlist = sorted(found.values(), key=score, reverse=True)[:26]

# ---- per sound: its own page, then its preview ---------------------------
out = []
for s in shortlist:
    at = os.path.join(PAGES, f"{s['id']}.html")
    try:
        h = open(at, encoding="utf-8").read() if os.path.exists(at) else \
            get(f"https://freesound.org/people/{s['user']}/sounds/{s['id']}/")
    except Exception as e:
        print("!! page", s["id"], e, file=sys.stderr); continue
    if not os.path.exists(at):
        open(at, "w", encoding="utf-8").write(h)

    flat = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h)))
    lic = ""
    if re.search(r"Creative Commons 0|CC0 1\.0|Public Domain Dedication", flat, re.I):
        lic = "CC0"
    else:
        m = re.search(r"(Attribution[^.|]{0,40}|Sampling\+)", flat)
        lic = m.group(1).strip() if m else "unread"

    prev = sorted(set(re.findall(
        rf'(https://cdn\.freesound\.org/previews/\d+/{s["id"]}_[^"\'\\ ]+\.ogg)', h)))
    if not prev:
        print("!! no preview", s["id"], file=sys.stderr); continue
    if lic != "CC0":
        print(f"!! not CC0, skipped: {s['title'][:40]} -> {lic}", file=sys.stderr); continue

    dst = os.path.join(AUDIO, f"fs-{s['id']}.ogg")
    if not os.path.exists(dst):
        try:
            open(dst, "wb").write(get(prev[0], binary=True))
        except Exception as e:
            print("!! audio", s["id"], e, file=sys.stderr); continue
    out.append({**s, "licence": lic, "preview": prev[0],
                "source": f"https://freesound.org/s/{s['id']}/",
                "local": os.path.relpath(dst, CACHE)})
    print(f"ok {s['title'][:46]:48s} {lic}", file=sys.stderr)

json.dump(out, open(os.path.join(CACHE, "fs-details.json"), "w"), indent=1)
print(f"\n{len(out)} CC0 previews on disk")
