"""Fill a group's tiers back to four, from the models the picker never used.

Crossing a model out in the bench leaves a hole in the tier it came from, and the late
stages of the path deal one tier by name -- a twins tier holding one model is a board
where every piece is the answer. This refills each short tier from the rest of the pack,
by the same measure the tiers were picked with:

  twins   the candidate closest to what the tier already holds
  loud    the candidate least like anything else in the group
  plain   the candidate nearest the middle of that same measure

Selection runs on the four-angle traces every kept model already has. A model this adds
still has to be traced at eight angles before the bench can draw it; the script says
which.

    python3 refill_tiers.py            # show what it would add
    python3 refill_tiers.py --write    # write it into data/groups.json
"""

import json
import sys
from itertools import combinations
from pathlib import Path

import numpy as np

from inspect_pack import measure, overlaps

ROOT = Path(__file__).resolve().parents[2]
WANT = 4                      # members a tier holds
ANGLES = [0, 90, 180, 270]    # every kept model is traced at these


def pack_of(group):
    """Where a group's four-angle traces of the whole pack live."""
    return ROOT / 'tmp/modelsets/traced' / group['id']


def alikeness(group, names):
    """Mean IoU between every pair of the named models, as a lookup."""
    dirs = [pack_of(group) / name for name in names]
    iou = overlaps([measure(d, ANGLES) for d in dirs])
    return {(a, b): float(iou[i, j])
            for i, a in enumerate(names) for j, b in enumerate(names)}


def refill(group, dropped, pool):
    """The models to add, tier by tier, and why each was chosen."""
    tiers = {t: [m for m in ms if m not in dropped] for t, ms in group['tiers'].items()}
    standing = [m for ms in tiers.values() for m in ms]
    if all(len(ms) >= WANT for ms in tiers.values()):
        return tiers, []

    iou = alikeness(group, standing + pool)
    taken, picked = [], []

    # Twins first: it is the most constrained, and the tier the late path leans on.
    for tier, score in (
        ('twins', lambda c: np.mean([iou[(c, m)] for m in tiers['twins']] or [0])),
        ('loud', lambda c: -max(iou[(c, m)] for m in standing + taken if m != c)),
        ('plain', lambda c: -abs(np.mean([iou[(c, m)] for m in standing + taken if m != c])
                                 - middle)),
    ):
        while len(tiers[tier]) < WANT:
            free = [c for c in pool if c not in taken]
            if not free:
                break
            middle = float(np.mean([iou[(a, b)] for a, b in combinations(standing, 2)]))
            best = max(free, key=score)
            tiers[tier].append(best)
            taken.append(best)
            picked.append((tier, best, round(float(score(best)), 3)))

    return tiers, picked


def main():
    groups = json.loads((ROOT / 'data/groups.json').read_text())
    settings = json.loads((ROOT / 'data/presentation.json').read_text())
    write = '--write' in sys.argv
    added = []

    for group in groups['groups']:
        inspection = ROOT / f"tmp/modelsets/{group['id']}.json"
        if not inspection.exists():
            continue                       # the fleet: its tiers come from the game
        dropped = set(settings.get(group['id'], {}).get('excluded', []))
        kept = [m['model'] for m in json.loads(inspection.read_text())['models']
                if m['verdict'] == 'keep']
        pool = [m for m in kept if m not in group['members']]

        tiers, picked = refill(group, dropped, pool)
        if not picked:
            print(f"{group['title']:10s} already whole")
            continue

        print(f"{group['title']:10s} " + ', '.join(f'{t}: {m}' for t, m, _ in picked))
        group['tiers'] = tiers
        group['members'] = tiers['loud'] + tiers['plain'] + tiers['twins']
        added += [(group['id'], m) for _, m, _ in picked]

    if write:
        (ROOT / 'data/groups.json').write_text(json.dumps(groups, indent=1))
        print('\nwritten. Trace these at eight angles before the bench can draw them:')
        for gid, model in added:
            print(f'  {gid} {model}')


if __name__ == '__main__':
    main()
