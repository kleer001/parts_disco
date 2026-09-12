"""Deconstruct the four CC0 source loops into the numbers the Strudel covers are built on.

Reads the originals in ../originals/ and prints, per track: exact tempo, the drum grid
(kick / snare-keys / hats folded onto one bar), the per-bar bass motion, and the per-bar
chord with its major/minor third measured directly. The covers in the parent folder are
transcriptions of this output, not of an ear.

Method, all deterministic (re-running gives identical numbers):
  - Tempo is exact from the bar-aligned trim: barlen = (endSec - startSec) / bars.
  - Onsets: spectral flux at hop 256 (~5 ms), peak-picked, parabolic-interpolated for
    sub-hop timing, classified kick / snare / hat by post-onset band-energy fractions.
  - Bass: a heavy zero-padded FFT (65536) on the sustained part of each beat, 45-300 Hz,
    parabolic peak -> sub-bin fundamental, skipping the kick transient.
  - Harmony: per-bar chroma (harmonic fold, 120-2000 Hz) matched to chord templates, with
    the third decided by comparing energy at root+3 vs root+4.

Run:  python3 deconstruct.py        (needs numpy, scipy, ffmpeg on PATH)
"""
import os, numpy as np

from loopdsp import SR, NAMES, decode, parab, onsets

HERE = os.path.dirname(os.path.abspath(__file__))
ORIG = os.path.join(HERE, "..", "originals")

# (name, file, startSec, endSec, bars) -- the bar-aligned trim measured in disco-loops.
TRACKS = [
    ("Funky",      "funky.ogg",      0.0,   130.961, 60),
    ("Techno-ish", "techno-ish.ogg", 0.0,   7.988,   4),
    ("Disco",      "disco.ogg",      0.004, 31.955,  16),
    ("Piano",      "piano.ogg",      0.006, 15.981,  8),
]


def classify(x, t, ms=45):
    i = int(t * SR)
    seg = x[i:i + int(ms / 1000 * SR)]
    if len(seg) < 64:
        return 'x'
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 4096)) ** 2
    fr = np.fft.rfftfreq(4096, 1 / SR)
    E = lambda lo, hi: sp[(fr >= lo) & (fr < hi)].sum()
    sub, low, mid, hi = E(30, 140), E(140, 300), E(300, 2500), E(4000, 16000)
    tot = sub + low + mid + hi + 1e-12
    if sub / tot > 0.35 or (sub + low) / tot > 0.5:
        return 'K'
    if hi / tot > 0.4 and sub / tot < 0.1:
        return 'H'
    return 'S'


def bass(x, t, dur):
    i0, i1 = int((t + dur * 0.3) * SR), int((t + dur * 0.95) * SR)
    seg = x[i0:i1]
    if len(seg) < 512:
        return None
    NF = 65536
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), NF))
    fr = np.fft.rfftfreq(NF, 1 / SR)
    lo, hi = np.searchsorted(fr, 45), np.searchsorted(fr, 300)
    k = lo + int(np.argmax(sp[lo:hi]))
    f = (k + parab(sp[k - 1], sp[k], sp[k + 1])) * SR / NF
    return NAMES[int(round(69 + 12 * np.log2(f / 440.0))) % 12] if f > 0 else None


def chroma(x, t, dur):
    n = int(dur * SR)
    seg = x[int(t * SR):int(t * SR) + n]
    if len(seg) < 256:
        return np.zeros(12)
    Z = 4
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), len(seg) * Z))
    fr = np.fft.rfftfreq(len(seg) * Z, 1 / SR)
    ch = np.zeros(12)
    for k in range(np.searchsorted(fr, 120), np.searchsorted(fr, 2000)):
        ch[int(round(12 * np.log2(fr[k] / 440.0) + 69)) % 12] += sp[k]
    return ch / (ch.max() + 1e-12)


def chord(ch, root):
    r = NAMES.index(root)
    third = 'm' if ch[(r + 3) % 12] > ch[(r + 4) % 12] * 1.1 else ''
    seventh = '7' if ch[(r + 10) % 12] > 0.5 else ('maj7' if ch[(r + 11) % 12] > 0.5 else '')
    return f"{root}{third}{seventh}"


for name, f, s, e, bars in TRACKS:
    x = decode(os.path.join(ORIG, f), s, e)
    bl = (e - s) / bars
    print(f"\n===== {name} =====  bpm={240 / bl:.2f}  barlen={bl:.4f}s  bars={bars}")

    # drums: fold every bar onto 16 steps, keep a step that fires in >=40% of bars
    N = 16
    step = bl / N
    lane = {'K': [0] * N, 'S': [0] * N, 'H': [0] * N}
    for t in onsets(x):
        c = classify(x, t)
        if c in lane:
            lane[c][int(round((t % bl) / step)) % N] += 1
    tag = lambda v: '#' if v >= bars * 0.7 else ('+' if v >= bars * 0.4 else ('.' if v >= bars * 0.2 else ' '))
    print("           1   2   3   4")
    for c, label in [('K', 'kick'), ('S', 'snr/keys'), ('H', 'hats')]:
        print(f"  {label:>8}: [" + "".join(tag(v) for v in lane[c]) + "]")

    # harmony: per-bar bass and chord, then the repeating loop
    per = min(bars, 8)
    chords, basses = [], []
    for b in range(bars):
        bl_notes = [bass(x, b * bl + i * bl / 4, bl / 4) for i in range(4)]
        root = max([n for n in bl_notes if n], key=bl_notes.count) if any(bl_notes) else None
        basses.append(root or '-')
        chords.append(chord(chroma(x, b * bl, bl), root) if root else '-')
    print("  bar chords:", " ".join(chords[:per]), "..." if bars > per else "")
    print("  bar bass  :", " ".join(basses[:per]), "..." if bars > per else "")
