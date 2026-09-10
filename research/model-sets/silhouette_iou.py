"""How alike two traced views are: intersection over union of their silhouettes.

Rasterises each view's silhouette rings on a shared grid, so the number answers the
only question the board asks -- from this angle, do these two read as the same shape?
"""
import json, sys
from pathlib import Path

N = 200

def mask(path):
    rings = json.loads(Path(path).read_text())['silhouette']
    grid = bytearray(N * N)
    for ring in rings:
        pts = [(x * N, y * N) for x, y in ring]
        ys = [p[1] for p in pts]
        for row in range(max(0, int(min(ys))), min(N, int(max(ys)) + 1)):
            yc = row + 0.5
            xs = []
            for i in range(len(pts)):
                x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % len(pts)]
                if (y0 <= yc) != (y1 <= yc):
                    xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for col in range(max(0, int(xs[i])), min(N, int(xs[i + 1]) + 1)):
                    grid[row * N + col] ^= 1
    return grid

def iou(a, b):
    inter = sum(1 for i in range(N * N) if a[i] and b[i])
    union = sum(1 for i in range(N * N) if a[i] or b[i])
    return inter / union if union else 0.0

def views(root, model, angles):
    return {a: mask(f'{root}/{model}/{a:03d}.json') for a in angles}

if __name__ == '__main__':
    root, angles = sys.argv[1], [int(a) for a in sys.argv[2].split(',')]
    pairs = [p.split(':') for p in sys.argv[3:]]
    cache = {}
    for a_name, b_name in pairs:
        for n in (a_name, b_name):
            if n not in cache: cache[n] = views(root, n, angles)
        scores = [iou(cache[a_name][a], cache[b_name][a]) for a in angles]
        print(f"{a_name:14s} vs {b_name:14s} " +
              " ".join(f"{a:3d}:{s:.2f}" for a, s in zip(angles, scores)) +
              f"   mean {sum(scores)/len(scores):.2f}")
