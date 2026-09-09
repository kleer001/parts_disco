"""Measure every candidate and write the manifest the audition page reads.

Three things break a seamless loop and all three are measurable:

  pad     Silence at either end. A loop with a gap ticks once a bar forever.
  fade    A tail much quieter than the head is a track with an ending, not a loop.
  splice  The level step across the join, which is what is heard as a click. Scored
          against the track's own peak, because the same step is inaudible in a loud
          passage and obvious in a quiet one.

None of it decides anything. It sorts the list and labels each card, and the ear
settles it on the page.
"""
import json, os, re, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "..", "..", "tmp", "loops")
AUDIO = os.path.join(CACHE, "audio")
SR = 44100

def decode(path):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le",
                          "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32)

def lead_silence(x, gate):
    loud = np.nonzero(np.abs(x) > gate)[0]
    return int(loud[0]) if len(loud) else len(x)

def measure(path):
    x = decode(path)
    if len(x) < SR // 8:
        return None
    peak = float(np.max(np.abs(x))) or 1e-9
    gate = peak * 0.01
    win = min(int(SR * 0.10), len(x) // 3)
    rms = lambda a: float(np.sqrt(np.mean(a.astype(np.float64) ** 2)))
    head, tail = rms(x[:win]), rms(x[-win:])
    return {
        "seconds": round(len(x) / SR, 2),
        "headPadMs": round(lead_silence(x, gate) / SR * 1000, 1),
        "tailPadMs": round(lead_silence(x[::-1], gate) / SR * 1000, 1),
        "spliceStep": round(abs(float(x[-1]) - float(x[0])) / peak, 4),
        "tailOverHead": round(tail / (head + 1e-9), 3),
    }

def faults(m):
    out = []
    worst = max(m["headPadMs"], m["tailPadMs"])
    if worst > 20:
        out.append(f"{worst:.0f}ms of silence at an end")
    if m["tailOverHead"] < 0.35:
        out.append("fades out")
    elif m["tailOverHead"] > 3.0:
        out.append("fades in")
    if m["spliceStep"] > 0.25:
        out.append("steps hard across the join")
    return out

rows = []

# ---- OpenGameArt ---------------------------------------------------------
for e in json.load(open(os.path.join(CACHE, "measured.json"))):
    at = os.path.join(CACHE, e["play"])
    if not os.path.exists(at):
        continue
    m = measure(at)
    if not m:
        continue
    author = re.split(r"\s+(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,",
                      e.get("author", ""))[0].strip()
    rows.append({
        "slug": e["slug"], "title": e["title"], "author": author or "unattributed",
        "licence": e["licence"], "source": e["url"], "host": "OpenGameArt",
        "file": os.path.basename(e["play"]),
        "note": "re-encoded to ogg for auditioning" if e.get("auditionOnly") else "",
        **m, "faults": faults(m),
    })

# ---- Freesound -----------------------------------------------------------
fs = os.path.join(CACHE, "fs-details.json")
if os.path.exists(fs):
    for e in json.load(open(fs)):
        at = os.path.join(CACHE, e["local"])
        if not os.path.exists(at):
            continue
        m = measure(at)
        if not m:
            continue
        rows.append({
            "slug": "fs-" + e["id"], "title": e["title"], "author": e["user"],
            "licence": e["licence"], "source": e["source"], "host": "Freesound",
            "file": os.path.basename(e["local"]),
            "note": "Freesound preview, not the master",
            **m, "faults": faults(m),
        })

rows.sort(key=lambda r: (len(r["faults"]), r["spliceStep"]))
json.dump(rows, open(os.path.join(HERE, "loops.json"), "w"), indent=1)

clean = [r for r in rows if not r["faults"]]
print(f"{len(rows)} candidates, {len(clean)} loop as they stand")
for r in rows:
    print(f"  {r['host'][:12]:13s} {r['title'][:40]:42s} {r['seconds']:7.1f}s "
          f"{'; '.join(r['faults']) or 'clean'}")
