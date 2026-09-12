"""compare — score a Strudel render against the loop it covers.

    python3 compare.py <original.ogg> <render.wav|ogg> --bpm 120.18 --bars 4

Prints the numbers that told the techno-ish rebuild it was converging: onsets per bar, the
per-16th kick / clap / hat placement correlations (1.0 = same pattern), and the loudness /
dynamics of both (LUFS, LRA, true peak, crest). Match the placement first, then master to the
original's LUFS/LRA with `master.sh`.

Deterministic. Needs numpy, scipy, ffmpeg on PATH.
"""
import argparse, re, subprocess, numpy as np
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d

SR = 48000


def decode(p):
    return np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-f", "f32le",
        "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout,
        dtype=np.float32).astype(float)


def bandE(seg, lo, hi):
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 16384)) ** 2
    fr = np.fft.rfftfreq(16384, 1 / SR)
    return sp[(fr >= lo) & (fr < hi)].sum()


def profile(x, bpm, bars):
    barlen = 4 * 60.0 / bpm
    s16 = barlen / 16
    x = x[:int(bars * barlen * SR)]
    n, hop = 2048, 256
    win = np.hanning(n)
    idx = np.arange(0, len(x) - n, hop)
    mag = np.abs(np.array([np.fft.rfft(x[i:i + n] * win) for i in idx]))
    odf = np.diff(mag, axis=0).clip(0).sum(1)
    odf /= odf.max() + 1e-12
    pk, _ = find_peaks(odf, height=np.maximum(0.06, uniform_filter1d(odf, size=30) * 1.4), distance=5)
    sub = np.zeros(16); clap = np.zeros(16); hi = np.zeros(16)
    for q in range(16):
        for b in range(bars):
            seg = x[int((b * barlen + q * s16) * SR):int((b * barlen + q * s16 + s16) * SR)]
            if len(seg) < 256:
                continue
            sub[q] += bandE(seg, 30, 110); clap[q] += bandE(seg, 1000, 5000); hi[q] += bandE(seg, 6000, 16000)
    norm = lambda a: a / (a.max() + 1e-12)
    return len(pk) / bars, norm(sub), norm(clap), norm(hi)


def loudness(p):
    x = decode(p)
    out = subprocess.run(["ffmpeg", "-v", "info", "-i", p, "-af", "ebur128", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    I = re.findall(r"I:\s*(-?\d+\.?\d*)\s*LUFS", out)
    L = re.findall(r"LRA:\s*(-?\d+\.?\d*)\s*LU", out)
    pk = np.abs(x).max(); rms = np.sqrt(np.mean(x ** 2))
    return dict(lufs=float(I[-1]) if I else None, lra=float(L[-1]) if L else None,
                tp=20 * np.log10(pk + 1e-9), crest=20 * np.log10(pk / (rms + 1e-9)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("original"); ap.add_argument("render")
    ap.add_argument("--bpm", type=float, required=True); ap.add_argument("--bars", type=int, required=True)
    a = ap.parse_args()
    (no, so, co, ho) = profile(decode(a.original), a.bpm, a.bars)
    (nr, sr, cr, hr) = profile(decode(a.render), a.bpm, a.bars)
    corr = lambda u, v: float(np.corrcoef(u, v)[0, 1])
    print(f"onsets/bar : original {no:.1f}   render {nr:.1f}")
    print(f"kick corr  : {corr(so, sr):.2f}   (per-16th placement, 1.0 = identical)")
    print(f"clap corr  : {corr(co, cr):.2f}")
    print(f"hat  corr  : {corr(ho, hr):.2f}")
    lo, lr = loudness(a.original), loudness(a.render)
    print(f"\n{'':11s}{'LUFS':>8}{'LRA':>7}{'truePk':>8}{'crest':>7}")
    for lbl, d in [("original", lo), ("render", lr)]:
        print(f"{lbl:11s}{d['lufs']:8.1f}{d['lra']:7.1f}{d['tp']:8.1f}{d['crest']:7.1f}")
    print("\nplacement corrs low? re-read the loop with loopscope.py (a missed clap/fill).")
    print("loudness/LRA off? master the render to the original's LUFS with master.sh.")


if __name__ == "__main__":
    main()
