"""Shared DSP core for the strudel-cover tools — one decode, STFT and onset detector.

loopscope, compare and deconstruct all read audio, take a short-time FFT, and pick onsets
the same way. This is that one implementation, so a change to the detector lands once and
every tool measures a loop with the same one — the tool that verifies a cover then uses the
same onsets as the tool that deconstructed it.

48 kHz because the loops these tools read are 48 kHz: analysing at the native rate avoids a
resample. Deterministic. Needs numpy, scipy, ffmpeg on PATH.
"""
import subprocess
import numpy as np
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d

SR = 48000
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def decode(path, start=0.0, end=None):
    """One mono float channel at SR, optionally trimmed to [start, end] seconds."""
    cmd = ["ffmpeg", "-v", "error"]
    if start:
        cmd += ["-ss", str(start)]
    if end is not None:
        cmd += ["-to", str(end)]
    cmd += ["-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).astype(float)


def parab(y0, y1, y2):
    """Parabolic-interpolated offset of a peak at the middle sample, in [-0.5, 0.5]."""
    d = y0 - 2 * y1 + y2
    return 0.0 if abs(d) < 1e-12 else 0.5 * (y0 - y2) / d


def stft(x, n=2048, hop=256):
    """Magnitude STFT. Returns (S, freqs, frame_times, hop)."""
    win = np.hanning(n)
    idx = np.arange(0, max(1, len(x) - n), hop)
    S = np.abs(np.array([np.fft.rfft(x[i:i + n] * win) for i in idx]))
    return S, np.fft.rfftfreq(n, 1 / SR), (idx + n / 2) / SR, hop


def onsets(x):
    """Onset times (seconds), spectral-flux peaks with sub-hop parabolic timing."""
    S, freqs, times, hop = stft(x)
    odf = np.diff(S, axis=0).clip(0).sum(1)
    odf /= odf.max() + 1e-12
    thr = np.maximum(0.06, uniform_filter1d(odf, size=30) * 1.4)
    pk, _ = find_peaks(odf, height=thr, distance=5)
    out = []
    for p in pk:
        t = times[p] + (parab(odf[p - 1], odf[p], odf[p + 1]) * hop / SR if 0 < p < len(odf) - 1 else 0)
        out.append(max(0.0, t))
    return out
