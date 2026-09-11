"""Sort a traced pack into groups, and give every model a verdict.

Takes a directory of traced views -- one subdirectory per model, as
`tools/model_views/render_views.py` writes them -- and answers three questions about
the pack:

  * which models are the same shape as each other (grouped),
  * which are so close that the board could not tell them apart (tossed as twins),
  * which are not members of the set at all (a wheel in a car kit).

Nothing is dropped silently: every model in the directory comes back with a verdict
and the number behind it.

    python3 inspect_pack.py traced/food-kit --props "plate,cutting-board" > food-kit.json
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

# The grid a silhouette is rasterised on. Fine enough that a chair leg survives,
# coarse enough that a pack of two hundred models is one matrix multiply.
GRID = 128

# What the overlap bands mean. The board shows one model at a time and asks the player
# to find it among the rest, so the question each number answers is "could these two be
# confused" -- not "are these the same model".
BANDS = [
    (0.95, "same"),      # nothing to tell apart; the board would have two right answers
    (0.85, "near-twin"), # the twins tier: one shell, different trim
    (0.70, "close"),     # alike enough to slow a player down
    (0.00, "distinct"),  # its own silhouette
]

# Two shapes this alike are one shape: the board would be asking a question with two
# right answers. Everything below this is a group rather than a duplicate.
SAME = 0.95


def band(score):
    for floor, name in BANDS:
        if score >= floor:
            return name
    return "distinct"


def mask(path):
    """Rasterise one view's silhouette rings onto the shared grid."""
    rings = json.loads(path.read_text())["silhouette"]
    grid = np.zeros((GRID, GRID), dtype=bool)
    for ring in rings:
        pts = np.array(ring) * GRID
        ys = pts[:, 1]
        for row in range(max(0, int(ys.min())), min(GRID, int(ys.max()) + 1)):
            yc = row + 0.5
            crossings = []
            for i in range(len(pts)):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % len(pts)]
                if (y0 <= yc) != (y1 <= yc):
                    crossings.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
            crossings.sort()
            for i in range(0, len(crossings) - 1, 2):
                lo = max(0, int(crossings[i]))
                hi = min(GRID, int(crossings[i + 1]) + 1)
                grid[row, lo:hi] ^= True
    return grid


def measure(model_dir, angles):
    """One model's masks, its fill, its aspect and how much line art it carries."""
    masks, fills, aspects, strokes, blank = [], [], [], [], []
    for angle in angles:
        view = json.loads((model_dir / f"{angle:03d}.json").read_text())
        m = mask(model_dir / f"{angle:03d}.json")
        masks.append(m.reshape(-1))
        fills.append(m.mean())
        rows = np.flatnonzero(m.any(axis=1))
        cols = np.flatnonzero(m.any(axis=0))
        if len(rows) and len(cols):
            h = rows[-1] - rows[0] + 1
            w = cols[-1] - cols[0] + 1
            aspects.append(max(w / h, h / w))
        strokes.append(len(view["strokes"]))
        if not m.any():
            blank.append(angle)
    return {
        "masks": np.array(masks, dtype=np.float32),
        "fill": float(np.mean(fills)),
        "aspect": float(np.mean(aspects)) if aspects else 0.0,
        "strokes": float(np.mean(strokes)),
        "blank": ", ".join(f"{a}\u00b0" for a in blank),
    }


def overlaps(models):
    """Mean IoU between every pair, over every angle."""
    stack = np.stack([m["masks"] for m in models])          # models x angles x pixels
    n_models, n_angles, _ = stack.shape
    total = np.zeros((n_models, n_models), dtype=np.float32)
    for a in range(n_angles):
        layer = stack[:, a, :]
        inter = layer @ layer.T
        area = layer.sum(axis=1)
        union = area[:, None] + area[None, :] - inter
        total += np.divide(inter, union, out=np.zeros_like(inter), where=union > 0)
    return total / n_angles


def group(iou, names, threshold):
    """Complete-linkage clustering: a model joins a group only if it is close to all of it."""
    groups = []
    order = np.argsort(-iou.sum(axis=1))  # start from the most typical shape
    placed = {}
    for i in order:
        for g in groups:
            if all(iou[i, j] >= threshold for j in g):
                g.append(i)
                placed[i] = g
                break
        else:
            groups.append([i])
    return [sorted(g, key=lambda i: names[i]) for g in groups]


def pick_fleet(iou, kept, names, size=4):
    """A twelve out of what survived: four that hide, four ordinary, four that shout.

    The twins are the tightest clique of four -- scored on the loosest pair inside it,
    so a group only wins when every one of its four is close to every other. The loud
    four are the shapes least like the rest of the pack, and the plain four sit at the
    middle of that same measure.
    """
    if len(kept) < size * 3:
        return None
    mean_to_rest = {i: float(np.mean([iou[i, j] for j in kept if j != i])) for i in kept}

    best, best_score = None, -1.0
    for i in kept:
        near = sorted((j for j in kept if j != i), key=lambda j: -iou[i, j])[:size - 1]
        clique = [i] + near
        score = min(iou[a, b] for a in clique for b in clique if a != b)
        if score > best_score:
            best, best_score = clique, score
    twins = sorted(best, key=lambda i: names[i])

    rest = [i for i in kept if i not in twins]
    by_mean = sorted(rest, key=lambda i: mean_to_rest[i])
    loud = sorted(by_mean[:size], key=lambda i: names[i])
    middle = by_mean[size:]
    start = max(0, len(middle) // 2 - size // 2)
    plain = sorted(middle[start:start + size], key=lambda i: names[i])

    return {
        "twins": [names[i] for i in twins],
        "twins_floor": round(float(best_score), 3),
        "plain": [names[i] for i in plain],
        "loud": [names[i] for i in loud],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("traced", type=Path, help="directory of traced models")
    ap.add_argument("--angles", default="0,90,180,270")
    ap.add_argument("--props", default="", help="comma-separated name prefixes that are not members of the set")
    ap.add_argument("--group-at", type=float, default=0.85)
    args = ap.parse_args()

    angles = [int(a) for a in args.angles.split(",")]
    dirs = sorted(d for d in args.traced.iterdir() if d.is_dir())
    if not dirs:
        raise SystemExit(f"no traced models under {args.traced}")  # boundary

    names = [d.name for d in dirs]
    models = [measure(d, angles) for d in dirs]
    prefixes = [p for p in args.props.split(",") if p]

    iou = overlaps(models)
    groups = group(iou, names, args.group_at)
    group_of = {i: n for n, g in enumerate(groups) for i in g}

    out = []
    kept_by_shape = []
    for i, name in enumerate(names):
        m = models[i]
        others = [(iou[i, j], names[j]) for j in range(len(names)) if j != i]
        nearest, nearest_name = max(others) if others else (0.0, None)

        if m["blank"]:
            verdict, why = "toss", f"no silhouette at {m['blank']}"
        elif any(name.startswith(p) for p in prefixes):
            verdict, why = "toss", "not a member of the set"
        else:
            twin = next((n for s, n in sorted(others, reverse=True)
                         if s >= SAME and n in kept_by_shape), None)
            if twin:
                verdict, why = "toss", f"the same shape as {twin}"
            else:
                verdict, why = "keep", band(nearest)
                kept_by_shape.append(name)

        out.append({
            "model": name,
            "verdict": verdict,
            "why": why,
            "group": group_of[i],
            "nearest": nearest_name,
            "nearest_iou": round(float(nearest), 3),
            "fill": round(m["fill"], 3),
            "aspect": round(m["aspect"], 2),
            "strokes": round(m["strokes"], 1),
        })

    # A kept model's band has to be read against the models it will actually share a
    # board with, so the nearest neighbour is taken again over the survivors only.
    kept = [i for i, row in enumerate(out) if row["verdict"] == "keep"]
    for i in kept:
        rivals = [(iou[i, j], names[j]) for j in kept if j != i]
        if not rivals:
            continue
        score, rival = max(rivals)
        out[i]["nearest"] = rival
        out[i]["nearest_iou"] = round(float(score), 3)
        out[i]["why"] = band(score)

    json.dump({
        "pack": args.traced.name,
        "angles": angles,
        "group_threshold": args.group_at,
        "models": out,
        "groups": [[names[i] for i in g] for g in groups],
        "group_span": [[round(float(min(iou[a, b] for a in g for b in g if a != b)), 3),
                        round(float(max(iou[a, b] for a in g for b in g if a != b)), 3)]
                       if len(g) > 1 else None for g in groups],
        "fleet": pick_fleet(iou, kept, names),
    }, sys.stdout, indent=1)


if __name__ == "__main__":
    main()
