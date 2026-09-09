"""Cache each candidate's entry page, then its audio, six seconds apart.

Everything is cached on disk, so re-parsing costs nothing and a re-run only fetches
what is missing. Both pages and audio live on the one host, so the delay applies
across the lot.
"""
import re, time, json, os, sys, urllib.request, html

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
PAGES = os.path.join(HERE, "pages")
AUDIO = os.path.join(HERE, "audio")
os.makedirs(PAGES, exist_ok=True)
os.makedirs(AUDIO, exist_ok=True)

PATHS = """
/content/funky-disco-beats-to-boogiewoogie-to
/content/funked-up
/content/raspberry-jam
/content/rhythm-factory
/content/rhythm-garden
/content/midnight-cruiser
/content/wednesday-night-funk-fusion
/content/funky-house
/content/8-bit-disco-loop
/content/disco-bits
/content/funky-victory-loop
/content/loop-remembering-the-time-at-the-disco
/content/funky-menu-loop
/content/detour
/content/barriers
/content/empty-stretch
/content/danza-d-bots-ii
/content/fat-groove-drums
/content/moms-workout-cd
/content/nokia-funk-day-1
/content/funky-hip-hop-lofi-jam
/content/the-groove
""".split()

last = [0.0]
def polite_get(url, binary=False):
    wait = 6.0 - (time.time() - last[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    last[0] = time.time()
    return data if binary else data.decode("utf-8", "replace")

# ---- pages ---------------------------------------------------------------
for path in PATHS:
    at = os.path.join(PAGES, path.rsplit("/", 1)[-1] + ".html")
    if os.path.exists(at):
        continue
    try:
        open(at, "w", encoding="utf-8").write(polite_get("https://opengameart.org" + path))
        print("page", path, file=sys.stderr)
    except Exception as e:
        print("!! page", path, e, file=sys.stderr)

# ---- parse ---------------------------------------------------------------
strip = lambda s: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

def after_tag(h, cls, span=600):
    """Text of the field block whose class contains `cls`, from past its opening tag."""
    m = re.search(rf'class="[^"]*{cls}[^"]*"[^>]*>(.{{0,{span}}})', h, re.S)
    return strip(m.group(1)) if m else ""

entries = []
for path in PATHS:
    at = os.path.join(PAGES, path.rsplit("/", 1)[-1] + ".html")
    if not os.path.exists(at):
        continue
    h = open(at, encoding="utf-8", errors="replace").read()
    m = re.search(r'property="og:title" content="([^"]*)"', h)
    title = html.unescape(m.group(1)).strip() if m else path

    lic = after_tag(h, "field-name-field-art-licenses", 400)
    lic = re.sub(r"^License\(s\):\s*", "", lic).split("Collections")[0].strip()
    m = re.search(r"Author:\s*(?:&nbsp;)?\s*([^<]{1,60})", h)
    author = html.unescape(m.group(1)).strip() if m else ""

    files = sorted(set(re.findall(
        r'href="(https://opengameart\.org/sites/default/files/[^"]+\.(?:ogg|mp3|wav|flac))"', h, re.I)))
    blurb = re.sub(r"^Description:\s*", "", after_tag(h, "field-name-field-art-description", 900))
    hay = f"{title} {blurb}"
    entries.append({
        "path": path, "url": "https://opengameart.org" + path, "title": title,
        "author": author, "licence": lic, "files": files, "blurb": blurb[:280],
        "saysLoop": bool(re.search(r"\bloop|\bseamless", hay, re.I)),
    })

json.dump(entries, open(os.path.join(HERE, "oga-details.json"), "w"), indent=1)
for e in entries:
    print(f"{e['title'][:40]:42s} {e['author'][:16]:18s} {e['licence'][:26]:28s} loop={e['saysLoop']}")
