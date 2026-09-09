"""Measure how well each candidate actually loops.

Three things break a seamless loop and all three are measurable:

  pad     Silence at either end. A loop with a gap ticks once a bar forever.
  fade    A tail much quieter than the head is a track with an ending, not a loop.
  splice  The jump in level across the join, which is what is heard as a click.

`splice` is read against the track's own dynamics: the same jump is inaudible in a
loud passage and obvious in a quiet one, so it is scored as a ratio to the peak.
"""
import json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100

def decode(path):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1",
         "-ar", str(SR), "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32)

def silence_run(x, thresh):
    """Samples at the head of `x` below `thresh`."""
    loud = np.nonzero(np.abs(x) > thresh)[0]
    return int(loud[0]) if len(loud) else len(x)

rows = []
for e in json.load(open(os.path.join(HERE, "oga-details.json"))):
    at = os.path.join(HERE, e.get("local", ""))
    if not e.get("local") or not os.path.exists(at):
        continue
    try:
        x = decode(at)
    except Exception as ex:
        print("!!", e["title"], ex, file=sys.stderr); continue
    if len(x) < SR // 2:
        continue

    peak = float(np.max(np.abs(x))) or 1e-9
    gate = peak * 0.01
    head_pad = silence_run(x, gate) / SR
    tail_pad = silence_run(x[::-1], gate) / SR

    win = int(SR * 0.10)
    head = x[:win]
    tail = x[-win:]
    rms = lambda a: float(np.sqrt(np.mean(a.astype(np.float64) ** 2)))
    head_rms, tail_rms = rms(head), rms(tail)
    # The join, as the level step from the last sample to the first, against the peak.
    splice = abs(float(x[-1]) - float(x[0])) / peak
    fade = tail_rms / (head_rms + 1e-9)

    rows.append({
        **e,
        "seconds": round(len(x) / SR, 2),
        "headPadMs": round(head_pad * 1000, 1),
        "tailPadMs": round(tail_pad * 1000, 1),
        "spliceStep": round(splice, 4),
        "tailOverHead": round(fade, 3),
        "peak": round(peak, 3),
        "bytes": os.path.getsize(at),
    })

# A verdict, stated as what was measured rather than as a pass mark.
for r in rows:
    faults = []
    if r["headPadMs"] > 20 or r["tailPadMs"] > 20:
        faults.append(f"{max(r['headPadMs'], r['tailPadMs']):.0f}ms of silence at an end")
    if r["tailOverHead"] < 0.35:
        faults.append("fades out")
    elif r["tailOverHead"] > 3.0:
        faults.append("fades in")
    if r["spliceStep"] > 0.25:
        faults.append("steps hard across the join")
    r["faults"] = faults

rows.sort(key=lambda r: (len(r["faults"]), r["spliceStep"]))
json.dump(rows, open(os.path.join(HERE, "measured.json"), "w"), indent=1)

print(f"{'title':38s} {'secs':>6s} {'head':>7s} {'tail':>7s} {'splice':>7s} {'t/h':>6s}  notes")
for r in rows:
    print(f"{r['title'][:36]:38s} {r['seconds']:6.1f} {r['headPadMs']:6.0f}m {r['tailPadMs']:6.0f}m "
          f"{r['spliceStep']:7.3f} {r['tailOverHead']:6.2f}  {'; '.join(r['faults']) or 'clean'}")
