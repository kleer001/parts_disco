"""loopscope — deconstruct any drum/music loop into the numbers a Strudel cover is built on.

    python3 loopscope.py <loop.ogg|wav> --bpm 120.18 --bars 4 [--out DIR]

Prints, and writes spectrogram PNGs, everything the four covers in the parent folder were
transcribed from. Deterministic (re-running gives identical numbers). Needs numpy, scipy,
matplotlib and ffmpeg on PATH.

What it reports
  - Exact grid from --bpm/--bars (barlen, beat, 16th in ms).
  - Onsets (spectral-flux, sub-hop parabolic timing) with per-hit features: bar, 16th, centroid,
    the five band fractions (sub/low/mid/clap/hi), spectral flatness (tonal < 0.3 < noise), and
    the low-band fundamental — enough to call each hit kick / clap / snare / hat, or tonal.
  - Per-16th drum-kit lanes UNFOLDED across the bars: a table of each 16th's energy in every bar,
    flagging the ones that VARY. That is how a 1-bar loop is told from a 4-bar phrase, and how a
    fill (an extra clap in the last bar, say) is found instead of averaged away.
  - Per-bar harmony (chroma -> chord + bass) for loops that have pitch; near-zero flatness says
    "this is percussion, there are no notes" and the harmony read is noise.

What it draws (PNGs in --out)
  full 20-16k, low 20-300, annotated 50-3000 with note gridlines, and the 400-5000 "clap band"
  where a backbeat clap or snare lives between the kick and the hats.

Lessons this encodes (each cost a round of the techno-ish rebuild):
  - Fold onto one bar for the drum GROOVE, but never for structure — unfold to find the fill.
  - A drum kit reads as "noise" to a flatness test; classify by band, not by tonality.
  - A clap hides in 1-5 kHz over the kick; a per-16th clap-band pass finds it.
"""
import argparse, os, subprocess, numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d

SR = 48000
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def decode(path):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1",
                          "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).astype(float)


def parab(y0, y1, y2):
    d = y0 - 2 * y1 + y2
    return 0.0 if abs(d) < 1e-12 else 0.5 * (y0 - y2) / d


def stft(x, n=2048, hop=256):
    win = np.hanning(n)
    idx = np.arange(0, max(1, len(x) - n), hop)
    S = np.abs(np.array([np.fft.rfft(x[i:i + n] * win) for i in idx]))
    return S, np.fft.rfftfreq(n, 1 / SR), (idx + n / 2) / SR, hop


def onsets(x):
    S, freqs, times, hop = stft(x)
    flux = np.diff(S, axis=0)
    flux[flux < 0] = 0
    odf = flux.sum(1)
    odf /= odf.max() + 1e-12
    thr = np.maximum(0.06, uniform_filter1d(odf, size=30) * 1.4)
    pk, _ = find_peaks(odf, height=thr, distance=5)
    out = []
    for p in pk:
        t = times[p] + (parab(odf[p - 1], odf[p], odf[p + 1]) * hop / SR if 0 < p < len(odf) - 1 else 0)
        out.append(max(0.0, t))
    return out


def bandE(seg, lo, hi):
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 16384)) ** 2
    fr = np.fft.rfftfreq(16384, 1 / SR)
    return sp[(fr >= lo) & (fr < hi)].sum()


def features(x, t, dur):
    i = int(t * SR)
    seg = x[i:i + max(256, int(dur * SR))]
    if len(seg) < 256:
        return None
    sp = np.abs(np.fft.rfft(seg[:int(0.06 * SR)] * np.hanning(min(len(seg), int(0.06 * SR))), 16384))
    fr = np.fft.rfftfreq(16384, 1 / SR)
    cen = (fr * sp).sum() / (sp.sum() + 1e-12)
    b = {'sub': bandE(seg, 30, 110), 'low': bandE(seg, 110, 300), 'mid': bandE(seg, 300, 1000),
         'clap': bandE(seg, 1000, 5000), 'hi': bandE(seg, 6000, 16000)}
    tot = sum(b.values()) + 1e-12
    b = {k: v / tot for k, v in b.items()}
    lo, hi = np.searchsorted(fr, 30), np.searchsorted(fr, 180)
    band = sp[lo:hi] + 1e-9
    flat = np.exp(np.mean(np.log(band))) / np.mean(band)
    k = lo + int(np.argmax(band))
    note = NAMES[int(round(69 + 12 * np.log2(fr[k] / 440.0))) % 12]
    cls = 'KICK' if b['sub'] + b['low'] > 0.4 else ('CLAP' if b['clap'] > 0.3 and b['sub'] < 0.3 else 'HAT')
    return dict(cen=cen, flat=flat, note=note, cls=cls, **b)


def spectrograms(x, barlen, bars, out, name):
    S, freqs, times, hop = stft(x)
    db = 20 * np.log10(S.T + 1e-6)
    db = np.clip(db, db.max() - 72, db.max())
    plans = [("full", 20, 16000, True), ("low", 20, 300, False),
             ("annotated", 50, 3000, True), ("clapband", 400, 5000, False)]
    for tag, lo, hi, notes in plans:
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
    ap.add_argument("--bpm", type=float, required=True)
    ap.add_argument("--bars", type=int, required=True)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    out = a.out or os.path.dirname(os.path.abspath(a.loop)) or "."
    os.makedirs(out, exist_ok=True)
    name = os.path.splitext(os.path.basename(a.loop))[0]

    x = decode(a.loop)
    barlen = 4 * 60.0 / a.bpm            # 4 beats per bar
    beat = barlen / 4
    s16 = beat / 4
    total = a.bars * barlen
    x = x[:int(total * SR)]
    print(f"{name}: bpm={a.bpm} bars={a.bars} barlen={barlen:.4f}s beat={beat:.4f}s 16th={s16*1000:.1f}ms")

    ev = onsets(x)
    print(f"\n{len(ev)} onsets ({len(ev)/a.bars:.1f}/bar):")
    for t in ev:
        f = features(x, t, s16)
        if not f:
            continue
        print(f"  bar{int(t//barlen)} 16th={(t%barlen)/s16:5.2f}  {f['cls']:4s}  cen={f['cen']:5.0f} "
              f"flat={f['flat']:.2f}  sub={f['sub']:.2f} low={f['low']:.2f} mid={f['mid']:.2f} "
              f"clap={f['clap']:.2f} hi={f['hi']:.2f}  lowNote={f['note']}")

    # UNFOLD: per-16th RMS in every bar. A row that varies by >7 dB is a fill, not the groove.
    print("\nUNFOLDED per-16th RMS(dB) — a row that VARIES is a bar-unique fill, not the base groove:")
    print("  16th |" + "".join(f" bar{b} " for b in range(a.bars)))
    for q in range(16):
        es = []
        for b in range(a.bars):
            i = int((b * barlen + q * s16) * SR)
            seg = x[i:i + int(s16 * SR)]
            es.append(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9) if len(seg) else -99)
        flag = "  <-- VARIES (fill)" if (max(es) - min(es)) > 7 else ""
        print(f"  {q:4d} |" + "".join(f"{e:6.1f} " for e in es) + flag)

    # per-bar harmony (only meaningful when hits are tonal; flatness near 0.7+ = percussion)
    print("\nPer-bar bass / chord (ignore for percussion loops — see flatness above):")
    for b in range(min(a.bars, 8)):
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

    spectrograms(x, barlen, a.bars, out, name)
    print(f"\nwrote {name}_full.png / _low.png / _annotated.png / _clapband.png to {out}")


if __name__ == "__main__":
    main()
