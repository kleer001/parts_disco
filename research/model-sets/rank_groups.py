"""Order the groups from easy to hard, on the members and bearings still in play.

Hardness is how alike a group's members are to each other: for every pair, the
intersection over union of their silhouettes at the same bearing, averaged over the
bearings the group is allowed to draw at, then averaged over the pairs. A group whose
members share one shell scores high and is hard; a group of unlike things scores low.

Only what is in play counts. A member crossed out in the bench is not on the board, and
a bearing switched off is one the player never sees, so neither belongs in the number.

    python3 rank_groups.py            # print the order
    python3 rank_groups.py --write    # and sort data/groups.json into it
"""

import json
import sys
from itertools import combinations
from pathlib import Path

import numpy as np

from inspect_pack import mask

ROOT = Path(__file__).resolve().parents[2]


def views_of(group, members, angles):
    """Every member's silhouette raster, one row per bearing."""
    out = {}
    for model in members:
        rows = []
        for angle in angles:
            path = ROOT / group['views'].lstrip('/') / model / f'{angle:03d}.json'
            rows.append(mask(path).reshape(-1).astype(np.float32))
        out[model] = np.array(rows)
    return out


def hardness(rasters):
    """Mean same-bearing IoU over every pair of members."""
    # Areas do not depend on the pair, so they are summed once rather than once per
    # comparison a member takes part in.
    areas = {model: raster.sum(axis=1) for model, raster in rasters.items()}
    scores = []
    for a, b in combinations(rasters, 2):
        inter = (rasters[a] * rasters[b]).sum(axis=1)
        union = areas[a] + areas[b] - inter
        scores.append(float(np.mean(np.divide(inter, union,
                                              out=np.zeros_like(inter), where=union > 0))))
    return float(np.mean(scores)), max(scores), min(scores)


def main():
    groups = json.loads((ROOT / 'data/groups.json').read_text())
    settings = json.loads((ROOT / 'data/presentation.json').read_text())

    ranked = []
    for group in groups['groups']:
        chosen = settings.get(group['id'], {})
        dropped = set(chosen.get('excluded', []))
        members = [m for m in group['members'] if m not in dropped]
        angles = chosen.get('angles') or groups['angles']
        if len(members) < 2:
            continue
        mean, worst, best = hardness(views_of(group, members, angles))
        ranked.append({'group': group, 'mean': mean, 'worst': worst, 'best': best,
                       'members': len(members), 'angles': len(angles)})

    ranked.sort(key=lambda r: r['mean'])

    print(f"{'order':>5}  {'group':16s} {'in play':>7} {'bearings':>8} "
          f"{'mean IoU':>9} {'closest pair':>13} {'furthest':>9}")
    for i, r in enumerate(ranked, 1):
        print(f"{i:>5}  {r['group']['id']:16s} {r['members']:>7} {r['angles']:>8} "
              f"{r['mean']:>9.3f} {r['worst']:>13.3f} {r['best']:>9.3f}")

    if '--write' in sys.argv:
        for i, r in enumerate(ranked):
            r['group']['difficulty'] = round(r['mean'], 3)
            r['group']['rank'] = i + 1
        groups['groups'] = [r['group'] for r in ranked]
        (ROOT / 'data/groups.json').write_text(json.dumps(groups, indent=1))
        print('\ndata/groups.json is now in this order.')


if __name__ == '__main__':
    main()
