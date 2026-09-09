"""Fetch one audio file per candidate, six seconds apart, skipping what is already here.

Preference is ogg, then mp3, then wav: ogg and mp3 both play everywhere a browser
does, and the wavs run to tens of megabytes for the same music.
"""
import json, os, sys, time, urllib.request, urllib.parse

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, "audio")
os.makedirs(AUDIO, exist_ok=True)
RANK = {".ogg": 0, ".mp3": 1, ".wav": 2, ".flac": 3}

entries = json.load(open(os.path.join(HERE, "oga-details.json")))
last = [0.0]
picked = []

for e in entries:
    files = sorted(e["files"], key=lambda f: RANK.get(os.path.splitext(f)[1].lower(), 9))
    if not files:
        print("!! no file:", e["title"], file=sys.stderr); continue
    src = files[0]
    ext = os.path.splitext(src)[1].lower()
    at = os.path.join(AUDIO, e["slug"] + ext)
    e["local"] = os.path.relpath(at, HERE)
    picked.append(e)
    if os.path.exists(at) and os.path.getsize(at) > 0:
        continue
    wait = 6.0 - (time.time() - last[0])
    if wait > 0:
        time.sleep(wait)
    try:
        req = urllib.request.Request(urllib.parse.quote(src, safe=":/"),
                                     headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=180) as r:
            open(at, "wb").write(r.read())
        print(f"got {os.path.basename(at)} {os.path.getsize(at)//1024}kB", file=sys.stderr)
    except Exception as ex:
        print("!! ", e["title"], ex, file=sys.stderr)
    last[0] = time.time()

json.dump(picked, open(os.path.join(HERE, "oga-details.json"), "w"), indent=1)
print(f"{len(picked)} candidates, {len(os.listdir(AUDIO))} files on disk")
