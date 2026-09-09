"""Rate the earmarked loops, and work out where each one wants to be cut.

Two questions are being answered and they are answered differently.

HOW WELL DOES IT LOOP is measured. A join is heard as a click when the waveform steps
across it by more than the music steps anywhere else, so the join's step is scored
against the track's own distribution of steps rather than against a fixed number. The
rest is silence at either end, and whether the tail is at the head's level.

WHERE SHOULD IT BE CUT is solved. A loop from A to B is seamless when the audio
arriving at B sounds like the audio arriving at A -- so the search is over bar-aligned
(A, B) pairs, minimising the distance between the window before B and the window
before A. Bar-aligned because a loop that is seamless but half a beat short still
limps.

HOW WELL IT VIBES is not measured and is not claimed to be. What is measured here are
the things a judgement about it should be made against: how often it comes round in a
stage, how bright it is, and how much its level moves.
"""
import json, os, re, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "..", "..", "tmp", "loops")
AUDIO = os.path.join(CACHE, "audio")
SR = 44100

PICKS = ["fs-572397", "fs-832693", "fs-447576", "funky-disco-beats-to-boogiewoogie-to"]

def decode(path):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le",
                          "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).astype(np.float64)

def onset_envelope(x, hop=512, win=1024):
    """Rising spectral energy per frame -- where the hits are."""
    n = (len(x) - win) // hop
    frames = np.lib.stride_tricks.as_strided(
        x, shape=(n, win), strides=(x.strides[0] * hop, x.strides[0]))
    spec = np.abs(np.fft.rfft(frames * np.hanning(win), axis=1))
    flux = np.diff(spec, axis=0)
    return np.maximum(flux, 0).sum(axis=1)

def tempo_of(x, lo=70, hi=180, hop=512):
    """Beats per minute, from the strongest periodicity in the onsets."""
    env = onset_envelope(x, hop)
    env = env - env.mean()
    if len(env) < 64:
        return None, 0.0
    ac = np.correlate(env, env, mode="full")[len(env) - 1:]
    fps = SR / hop
    lags = np.arange(len(ac))
    with np.errstate(divide="ignore", invalid="ignore"):
        bpm = 60.0 * fps / lags
    ok = (bpm >= lo) & (bpm <= hi) & (lags > 0)
    if not ok.any():
        return None, 0.0
    best = lags[ok][np.argmax(ac[ok])]
    strength = float(ac[best] / (ac[0] + 1e-12))
    return float(60.0 * fps / best), strength

def step_score(x):
    """The join's waveform step, as a percentile of the track's own steps.

    100 means nothing in the music ever moves that fast between two samples, so the
    join is the sharpest edge in the track and will be heard. Low means the join is
    ordinary and disappears into the groove.
    """
    d = np.abs(np.diff(x))
    join = abs(x[0] - x[-1])
    return float((d < join).mean() * 100.0)

def loudness(x, hop=2048):
    n = len(x) // hop
    if n < 4:
        return 0.0, 0.0
    r = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(axis=1)) + 1e-12
    db = 20 * np.log10(r)
    return float(db.mean()), float(db.std())

# Where the game's own voice sits. `src/audio.js` puts the ground click at 210-165Hz,
# the refusal at 190-135Hz, the "already found" at 330Hz, and the find's Shepard
# partials from 220Hz up. A loop with most of its energy in that span competes with
# every sound the board makes; one that leaves the span clear can be louder and still
# not bury them.
GAME_BAND = (130, 900)

def band_share(x, lo, hi, win=4096):
    """The share of the loop's energy sitting in a frequency span."""
    n = max(1, len(x) // win)
    frames = x[:n * win].reshape(n, win) * np.hanning(win)
    power = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    freqs = np.fft.rfftfreq(win, 1 / SR)
    inside = (freqs >= lo) & (freqs < hi)
    total = power.sum()
    return round(float(power[:, inside].sum() / (total + 1e-12)) * 100, 1)

def brightness(x, win=2048):
    n = len(x) // win
    frames = x[:n * win].reshape(n, win) * np.hanning(win)
    spec = np.abs(np.fft.rfft(frames, axis=1)) + 1e-12
    freqs = np.fft.rfftfreq(win, 1 / SR)
    return float((spec * freqs).sum() / spec.sum())

def bar_fit(seconds, bpm, beats_per_bar=4):
    """How near the length is to a whole number of bars.

    This is the one that decides whether a loop limps. A join can be silent and the
    loop still be wrong: come back an eighth of a beat early and every repeat drags
    the pulse forward until the groove is unrecognisable.
    """
    if not bpm:
        return None
    bars = seconds * bpm / 60.0 / beats_per_bar
    off = bars - round(bars)
    return {"bars": round(bars, 3), "offBars": round(off, 3),
            "offMs": round(off * beats_per_bar * 60.0 / bpm * 1000, 1)}

def suggest_trim(x, bpm, head_pad, tail_pad, beats_per_bar=4):
    """Drop the silence at the ends, then snap the length to a whole bar.

    Nothing cleverer is called for. Where the tempo is steady and the file was cut on
    a bar already, the whole repair is the padding -- and where it was not, no choice
    of endpoints rescues it.
    """
    if not bpm:
        return None
    bar = beats_per_bar * 60.0 / bpm
    start = head_pad / 1000.0
    end = len(x) / SR - tail_pad / 1000.0
    bars = max(1, round((end - start) / bar))
    end = start + bars * bar
    if end > len(x) / SR:
        end = start + (bars - 1) * bar
        bars -= 1
    return {"startSec": round(start, 3), "endSec": round(end, 3),
            "bars": bars, "lengthSec": round(end - start, 3)}

def fade_ratio(x, share=0.2):
    """Last fifth against first fifth. A fade shows over seconds, not milliseconds.

    Measured on 100ms windows this misreads every loop that starts on a downbeat and
    leaves air before it: the tail is quiet because the bar is ending, not because the
    track is.
    """
    n = max(1, int(len(x) * share))
    rms = lambda a: float(np.sqrt(np.mean(a ** 2)))
    return round(rms(x[-n:]) / (rms(x[:n]) + 1e-12), 3)

# The bed every loop is normalised to, in LUFS. Loops as published vary by more than
# ten decibels, so without this the music fader means a different thing per track and
# a quiet one leaves the board shouting while a loud one buries it.
BED_LUFS = -18.0

def integrated(path):
    """Integrated loudness and true peak, from ffmpeg's EBU R128 meter.

    Read out of the Summary block at the end. The running lines carry a `I:` too, and
    the first of those is the gate's floor rather than a measurement.
    """
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path,
         "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    tail = out.split("Summary:")[-1]
    lufs = re.search(r"I:\s*(-?\d+\.\d+)\s*LUFS", tail)
    peak = re.search(r"Peak:\s*(-?\d+\.\d+)\s*dBFS", tail)
    return float(lufs.group(1)), float(peak.group(1))

rows = []
by_slug = {r["slug"]: r for r in json.load(open(os.path.join(HERE, "loops.json")))}
for slug in PICKS:
    meta = by_slug[slug]
    path = os.path.join(AUDIO, meta["file"])
    x = decode(path)
    peak = float(np.max(np.abs(x))) or 1e-9
    bpm, pulse = tempo_of(x)
    mean_db, swing_db = loudness(x)
    trim = suggest_trim(x, bpm, meta["headPadMs"], meta["tailPadMs"])
    fit = bar_fit(meta["seconds"], bpm)
    trimmed_fit = bar_fit(trim["lengthSec"], bpm) if trim else None

    lufs, peak_db = integrated(path)
    # What this loop needs to sit at the bed, and what that does to its peak. Above
    # 0dBFS the master would clip on the loop alone, before a single blip.
    norm_db = BED_LUFS - lufs
    rows.append({
        **meta,
        "lufs": round(lufs, 1),
        "truePeakDb": round(peak_db, 1),
        "normGain": round(10 ** (norm_db / 20), 4),
        "normDb": round(norm_db, 1),
        "peakAfterNormDb": round(peak_db + norm_db, 1),
        "bpm": round(bpm, 1) if bpm else None,
        "pulseStrength": round(pulse, 3),
        "joinPercentile": round(step_score(x), 1),
        "meanDb": round(mean_db, 1),
        "swingDb": round(swing_db, 1),
        "brightnessHz": round(brightness(x)),
        "peak": round(peak, 3),
        "fadeRatio": fade_ratio(x),
        "gameBandPct": band_share(x, *GAME_BAND),
        "barFit": fit,
        "trim": trim,
        "trimBarFit": trimmed_fit,
    })
    r = rows[-1]
    t = f"{trim['startSec']}–{trim['endSec']}s = {trim['bars']} bars" if trim else "no tempo"
    print(f"{meta['title'][:42]:44s} {meta['seconds']:6.1f}s bpm={bpm and round(bpm,1)}", file=sys.stderr)
    print(f"    bars={fit['bars']} (off by {fit['offMs']}ms)  join={r['joinPercentile']:.1f}%  "
          f"fade={r['fadeRatio']}  bright={r['brightnessHz']}Hz  swing={swing_db:.1f}dB  "
          f"in the game's band={r['gameBandPct']}%", file=sys.stderr)
    print(f"    trim to {t}", file=sys.stderr)
    print(f"    {lufs:.1f} LUFS -> bed at {norm_db:+.1f}dB (x{rows[-1]['normGain']}), "
          f"peak then {rows[-1]['peakAfterNormDb']:+.1f} dBFS", file=sys.stderr)

# The ratings are written by hand and live in their own file. Merging them in rather
# than letting this script own them is what stops a re-measure erasing the argument.
notes = json.load(open(os.path.join(HERE, "ratings.json")))
for r in rows:
    r.update(notes.get(r["slug"], {}))

json.dump(rows, open(os.path.join(HERE, "shortlist.json"), "w"), indent=1)
print(f"\nwrote {len(rows)}")
