"""loopscope — deconstruct any drum/music loop into the numbers a Strudel cover is built on.

    python3 loopscope.py <loop.ogg|wav> [--bpm B] [--bars N] [--out DIR]

--bpm and --bars are OPTIONAL: with only the sound file, loopscope estimates the tempo and bar
count by fitting a whole-bar grid to the onsets (see estimate_grid), then refines an exact BPM.
Pass --bpm/--bars to override when you know them. Everything is deterministic. Needs numpy,
scipy, matplotlib and ffmpeg on PATH.

What it reports
  - Estimated (or given) grid: exact bpm, bars, barlen/beat/16th.
  - Onsets (spectral-flux, sub-hop parabolic timing) with per-hit features: bar, 16th, centroid,
    the five band fractions (sub/low/mid/clap/hi), spectral flatness (tonal < 0.3 < noise), and
    the low-band fundamental — enough to call each hit kick / clap / snare / hat, or tonal.
  - Reverb tail: the median decay of the hits into the gaps after them (time to -20 and -40 dB).
    Short (a few ms to -20) = dry; a long -40 time = an audible tail to reproduce with `room`.
  - Per-16th drum-kit lanes UNFOLDED across the bars: each 16th's energy in every bar, flagging
    the ones that VARY. That is how a 1-bar loop is told from a 4-bar phrase, and how a fill (an
    extra clap in the last bar, say) is found instead of averaged away.
  - Per-bar harmony (chroma -> chord + bass) for loops with pitch; near-1 flatness = percussion.

What it draws (PNGs in --out)
  full 20-16k, low 20-300, annotated 50-3000 with note gridlines, and the 400-5000 "clap band"
  where a backbeat clap or snare lives between the kick and the hats.

Lessons this encodes (each cost a round of a rebuild):
  - Fold onto one bar for the GROOVE, but never for structure — unfold to find the fill.
  - A drum kit reads as "noise" to a flatness test; classify by band, not by tonality.
  - A clap hides in 1-5 kHz over the kick; a per-16th clap-band pass finds it.
"""
import argparse, os, numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.ndimage import uniform_filter1d

from loopdsp import SR, NAMES, decode, stft, onsets

NFFT = 16384                                     # zero-pad every hit FFT to this
FR16 = np.fft.rfftfreq(NFFT, 1 / SR)             # its bin frequencies -- constant, hoisted
BANDS = {'sub': (30, 110), 'low': (110, 300), 'mid': (300, 1000),
         'clap': (1000, 5000), 'hi': (6000, 16000)}   # drum-kit classification bands


def estimate_grid(x, ev=None):
    """Estimate (bpm, bars) from the audio alone, assuming a loop trimmed to whole bars.

    Not a beat-tracker — a grid-fit. For each plausible bar count the loop length implies a tempo
    and a 16th grid; score how tightly the onsets snap to that grid (alignment) times how many of
    the beats actually carry a hit (occupancy, which breaks the bars-vs-2*bars octave error). The
    best-scoring bar count wins. Returns (bpm, bars, confidence 0..1).
    """
    loud = np.where(np.abs(x) > 0.005)[0]          # strip edge silence — a trailing gap skews dur
    if len(loud):
        x = x[loud[0]:loud[-1] + 1]
    ev = np.array(onsets(x) if ev is None else [t - (loud[0] / SR if len(loud) else 0) for t in ev])
    dur = len(x) / SR
    if len(ev) < 4:
        return round(240 / dur, 2), 1, 0.0
    best = None
    for bars in range(1, 65):
        bpm = 240 * bars / dur
        if not (65 <= bpm <= 185):                              # plausible tempo band
            continue
        barlen = dur / bars; s16 = barlen / 16; beat = barlen / 4
        err = np.minimum(ev % s16, s16 - (ev % s16)) / s16      # 0 = on the 16th grid, .5 = between
        align = 1 - 2 * float(np.mean(err))
        beats = np.arange(4 * bars) * beat                      # occupancy: beats with a hit near them
        occ = float(np.mean([np.min(np.abs(ev - bt)) < beat * 0.15 for bt in beats]))
        score = align * occ
        if best is None or score > best[0]:
            best = (score, bpm, bars)
    _, bpm, bars = best
    return round(bpm, 2), bars, round(best[0], 2)


def reverb_tail(x, ev):
    """Median decay of hits into the gap after them: time (ms) to -20 dB and to -40 dB."""
    t20, t40 = [], []
    for i, t in enumerate(ev):
        nxt = ev[i + 1] if i + 1 < len(ev) else t + 0.25
        if nxt - t < 0.05:
            continue
        seg = np.abs(x[int(t * SR):int(min(nxt, t + 0.35) * SR)])
        sm = uniform_filter1d(seg, max(1, int(0.003 * SR)))
        pk = sm[:max(1, int(0.01 * SR))].max() + 1e-9
        db = 20 * np.log10(sm / pk + 1e-9)
        w20 = np.where(db < -20)[0]; w40 = np.where(db < -40)[0]
        if len(w20): t20.append(w20[0] / SR * 1000)
        if len(w40): t40.append(w40[0] / SR * 1000)
    med = lambda a: float(np.median(a)) if a else None
    return med(t20), med(t40)


def features(x, t, dur):
    i = int(t * SR)
    seg = x[i:i + max(256, int(dur * SR))]
    if len(seg) < 256:
        return None
    # centroid, flatness and low-note from the hit's 60 ms onset window
    w = min(len(seg), int(0.06 * SR))
    sp = np.abs(np.fft.rfft(seg[:w] * np.hanning(w), NFFT))
    cen = (FR16 * sp).sum() / (sp.sum() + 1e-12)
    lo, hi = np.searchsorted(FR16, 30), np.searchsorted(FR16, 180)
    low = sp[lo:hi] + 1e-9
    flat = np.exp(np.mean(np.log(low))) / np.mean(low)
    note = NAMES[int(round(69 + 12 * np.log2(FR16[lo + int(np.argmax(low))] / 440.0))) % 12]
    # the five band energies from ONE power spectrum of the whole hit
    pw = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), NFFT)) ** 2
    b = {name: pw[(FR16 >= a) & (FR16 < z)].sum() for name, (a, z) in BANDS.items()}
    tot = sum(b.values()) + 1e-12
    b = {k: v / tot for k, v in b.items()}
    cls = 'KICK' if b['sub'] + b['low'] > 0.4 else ('CLAP' if b['clap'] > 0.3 and b['sub'] < 0.3 else 'HAT')
    return dict(cen=cen, flat=flat, note=note, cls=cls, **b)


def spectrograms(x, barlen, bars, out, name):
    S, freqs, times, hop = stft(x)
    db = 20 * np.log10(S.T + 1e-6)
    db = np.clip(db, db.max() - 72, db.max())
    for tag, lo, hi, notes in [("full", 20, 16000, True), ("low", 20, 300, False),
                               ("annotated", 50, 3000, True), ("clapband", 400, 5000, False)]:
        fig, ax = plt.subplots(figsize=(15, 6))
        ax.pcolormesh(times, freqs, db, shading='auto', cmap='magma')
        ax.set_yscale('log'); ax.set_ylim(lo, hi); ax.set_xlim(0, barlen * bars)
        if notes:
            for midi in range(24, 108):
                f = 440 * 2 ** ((midi - 69) / 12)
                if lo < f < hi:
                    ax.axhline(f, color='cyan', lw=0.3, alpha=0.22)
                    if midi % 12 == 0:
                        ax.text(0.0, f, f"C{midi // 12 - 1}", color='cyan', fontsize=7, va='center')
        for b in range(bars + 1):
            ax.axvline(b * barlen, color='white', lw=1.1, alpha=0.7)
        ax.set_title(f"{name} — {tag} ({lo}-{hi} Hz)"); ax.set_xlabel('s'); ax.set_ylabel('Hz')
        plt.tight_layout(); plt.savefig(os.path.join(out, f"{name}_{tag}.png"), dpi=110); plt.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("loop")
    ap.add_argument("--bpm", type=float, default=None)
    ap.add_argument("--bars", type=int, default=None)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    out = a.out or os.path.dirname(os.path.abspath(a.loop)) or "."
    os.makedirs(out, exist_ok=True)
    name = os.path.splitext(os.path.basename(a.loop))[0]
    x = decode(a.loop)

    if a.bpm is None or a.bars is None:
        ebpm, ebars, conf = estimate_grid(x)
        bpm = a.bpm if a.bpm is not None else ebpm
        bars = a.bars if a.bars is not None else ebars
        print(f"[estimated from audio] bpm~{ebpm} bars~{ebars} (grid-fit confidence {conf}). "
              f"Sanity-check it, and override with --bpm/--bars if the loop is not trimmed to whole "
              f"bars or the confidence is low.")
    else:
        bpm, bars = a.bpm, a.bars

    barlen = 4 * 60.0 / bpm
    beat = barlen / 4
    s16 = beat / 4
    x = x[:int(bars * barlen * SR)]
    print(f"{name}: bpm={bpm} bars={bars} barlen={barlen:.4f}s beat={beat:.4f}s 16th={s16*1000:.1f}ms")

    ev = onsets(x)
    t20, t40 = reverb_tail(x, ev)
    print(f"reverb tail: median -20 dB at {t20:.0f} ms" + (f", -40 dB at {t40:.0f} ms" if t40 else
          ", never reaches -40 dB in a gap") + "  (short = dry; long -40 = audible tail -> add room)")

    print(f"\n{len(ev)} onsets ({len(ev)/bars:.1f}/bar):")
    for t in ev:
        f = features(x, t, s16)
        if not f:
            continue
        print(f"  bar{int(t//barlen)} 16th={(t%barlen)/s16:5.2f}  {f['cls']:4s}  cen={f['cen']:5.0f} "
              f"flat={f['flat']:.2f}  sub={f['sub']:.2f} low={f['low']:.2f} mid={f['mid']:.2f} "
              f"clap={f['clap']:.2f} hi={f['hi']:.2f}  lowNote={f['note']}")

    print("\nUNFOLDED per-16th RMS(dB) — a row that VARIES is a bar-unique fill, not the base groove:")
    print("  16th |" + "".join(f" bar{b} " for b in range(bars)))
    for q in range(16):
        es = []
        for b in range(bars):
            seg = x[int((b * barlen + q * s16) * SR):int((b * barlen + q * s16 + s16) * SR)]
            es.append(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9) if len(seg) else -99)
        flag = "  <-- VARIES (fill)" if (max(es) - min(es)) > 7 else ""
        print(f"  {q:4d} |" + "".join(f"{e:6.1f} " for e in es) + flag)

    print("\nPer-bar bass / chord (ignore for percussion loops — see flatness above):")
    for b in range(min(bars, 8)):
        seg = x[int(b * barlen * SR):int((b + 1) * barlen * SR)]
        Z = 4
        sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), len(seg) * Z))
        fr = np.fft.rfftfreq(len(seg) * Z, 1 / SR)
        ch = np.zeros(12)
        for k in range(np.searchsorted(fr, 120), np.searchsorted(fr, 2000)):
            ch[int(round(12 * np.log2(fr[k] / 440.0) + 69)) % 12] += sp[k]
        lo, hi = np.searchsorted(fr, 45), np.searchsorted(fr, 300)
        bass = NAMES[int(round(69 + 12 * np.log2(fr[lo + int(np.argmax(sp[lo:hi]))] / 440.0))) % 12]
        third = 'm' if ch[(NAMES.index(bass) + 3) % 12] > ch[(NAMES.index(bass) + 4) % 12] else ''
        print(f"  bar{b}: bass~{bass:2s} chord~{bass}{third}   top-pc={[NAMES[i] for i in np.argsort(ch)[::-1][:4]]}")

    spectrograms(x, barlen, bars, out, name)
    print(f"\nwrote {name}_full.png / _low.png / _annotated.png / _clapband.png to {out}")


if __name__ == "__main__":
    main()
