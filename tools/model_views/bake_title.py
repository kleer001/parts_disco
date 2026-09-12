"""Bake the yard the title screen opens on.

The title paints before the fleet is asked for, so it cannot draw from it. This walks
the groups in `data/groups.json`, takes what is still in play at a bearing the group
allows, and writes one small file the title can have in flight on the first frame.

Only the outline and the silhouette are kept. The title draws a portrait, not a board:
it needs no tone bands, no terminator, and no shaded card.

    python3 tools/model_views/bake_title.py

Run it after the presentation bench changes which members or bearings are in play.
"""

import json
from pathlib import Path

from geom import simplify

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/title/yard.json'

# How many drawings to take from each group. Enough that a screenful is a different
# crowd each time, few enough that the whole yard is a fraction of one vehicle's views.
PER_GROUP = 4

# How far a title drawing's line may stray from the traced one, as a share of the frame.
# A vehicle stands about a fifth of the short edge here, so this is a third of a pixel on
# a tall phone and under one on a desktop. The board keeps the unsimplified strokes.
SLACK = 0.002

# The narrowest a drawing may be across its short side, as a share of the frame. The
# title is a portrait at a fifth of the short edge: a chopstick is a member of its group
# and a scratch on this screen. The board draws everything; only the crowd is picked.
MIN_BREADTH = 0.12


def breadth(rings):
    """The short side of what a drawing covers, in frame units."""
    xs = [x for ring in rings for x, _ in ring]
    ys = [y for ring in rings for _, y in ring]
    if not xs:
        return 0.0
    return min(max(xs) - min(xs), max(ys) - min(ys))


def main():
    groups = json.loads((ROOT / 'data/groups.json').read_text())
    settings = json.loads((ROOT / 'data/presentation.json').read_text())

    yard = []
    seen = set()
    for group in groups['groups']:
        chosen = settings.get(group['id'], {})
        dropped = set(chosen.get('excluded', []))
        members = [m for m in group['members'] if m not in dropped]
        angles = chosen.get('angles') or groups['angles']
        # Spread first, then fall back to the rest of the group when a spread pick is
        # too thin to draw. Ordered dedup, so a model is considered once and its bearing
        # does not depend on which pass reached it.
        step = max(1, len(members) // PER_GROUP)
        taken = 0
        for i, model in enumerate(dict.fromkeys(members[::step] + members)):
            if taken == PER_GROUP:
                break
            if model in seen:
                continue
            angle = angles[i % len(angles)]
            view = json.loads(
                (ROOT / group['views'].lstrip('/') / model / f'{angle:03d}.json').read_text())
            if breadth(view['silhouette']) < MIN_BREADTH:
                continue
            taken += 1
            seen.add(model)
            yard.append({
                'group': group['id'],
                'model': model,
                'angle': angle,
                'silhouette': [[[round(x, 4), round(y, 4)] for x, y in ring]
                               for ring in view['silhouette']],
                'strokes': [[[round(x, 4), round(y, 4)] for x, y in simplify(stroke, SLACK)]
                            for stroke in view['strokes']],
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'drawings': yard}))
    size = OUT.stat().st_size
    points = sum(len(s) for d in yard for s in d['strokes'])
    print(f'{len(yard)} drawings from {len(groups["groups"])} groups, {points} stroke points '
          f'-> {OUT.relative_to(ROOT)}, {size / 1024:.0f}KB')


if __name__ == '__main__':
    main()
