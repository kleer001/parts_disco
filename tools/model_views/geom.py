"""Polyline geometry the tracer and the bakers share.

Here rather than in `render_views.py` because that module imports `bpy` at the top and
so can only be read inside Blender, while the same arithmetic is wanted by tools that
run under plain `python3`. Nothing in this file touches Blender.
"""

import math


def simplify(points, tolerance):
    """Ramer-Douglas-Peucker. Drops points that lie on the line their neighbours make."""
    if len(points) < 3:
        return points
    first, last = points[0], points[-1]
    dx, dy = last[0] - first[0], last[1] - first[1]
    span = math.hypot(dx, dy)

    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if span == 0:
            gap = math.hypot(px - first[0], py - first[1])
        else:
            gap = abs(dy * (px - first[0]) - dx * (py - first[1])) / span
        if gap > worst:
            worst, index = gap, i

    if worst <= tolerance:
        return [first, last]
    return (simplify(points[:index + 1], tolerance)[:-1]
            + simplify(points[index:], tolerance))
