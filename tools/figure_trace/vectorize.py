"""Turn a cropped figure's ink into an SVG path.

The game draws these at a fraction of the size the patent office printed them, over
and over, so the cost that matters is path length rather than fidelity to the scan.
Tracing is potrace's, which fits curves and finds corners; the speckle filter below
it throws away the scanner's dust before any of that runs.
"""

import numpy as np
import potrace
from scipy import ndimage

# --- tuning -------------------------------------------------------------------

# A connected mark smaller than this is scanner dust, not a line. Dropped before
# tracing, so it never reaches the path.
MIN_SPECK = 12

# potrace's own smoothing. Higher alphamax rounds more corners; opttolerance is how
# far a fitted curve may stray from the traced outline, in pixels.
TRACE = {'turdsize': 4, 'alphamax': 1.0, 'opticurve': True, 'opttolerance': 0.35}

# Coordinates are written at this many decimal places. Patent line work does not
# carry meaning below a hundredth of a source pixel, and the digits are most of the
# file size.
PRECISION = 2


def despeckle(ink, min_speck=MIN_SPECK):
    """Drop marks too small to be a line."""
    labels, count = ndimage.label(ink)
    if not count:
        return ink
    sizes = ndimage.sum_labels(ink, labels, range(1, count + 1))
    keep = np.concatenate([[False], sizes >= min_speck])
    return keep[labels]


def trace_path(ink):
    """The SVG path data for a figure's ink, in its own pixel coordinates."""
    # Two things about what goes in here, both measured rather than documented.
    # The array must be boolean or 0-255: potrace compares against a black level on
    # a 0-255 scale, so a 0/1 array reads as one solid background and traces nothing
    # but the frame. And it is the complement that gets traced -- handed the ink
    # mask, potrace fills the paper and leaves the line work as holes.
    path = potrace.Bitmap(~ink).trace(**TRACE)
    out = []
    for curve in path:
        point = curve.start_point
        out.append(f'M{round(point.x, PRECISION)},{round(point.y, PRECISION)}')
        for segment in curve:
            if segment.is_corner:
                out.append(f'L{fmt(segment.c)}L{fmt(segment.end_point)}')
            else:
                out.append(f'C{fmt(segment.c1)},{fmt(segment.c2)},{fmt(segment.end_point)}')
        out.append('Z')
    return ''.join(out)


def fmt(point):
    return f'{round(point.x, PRECISION)},{round(point.y, PRECISION)}'


def svg(path_data, width, height):
    """A standalone SVG holding one traced figure.

    The path is filled rather than stroked: potrace traces the boundary of the ink,
    so the line work is already a shape with a width, and filling it keeps the
    weight the draftsman drew instead of imposing a uniform one.
    """
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">'
        f'<path fill="currentColor" fill-rule="evenodd" d="{path_data}"/>'
        f'</svg>\n'
    )
