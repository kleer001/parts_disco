"""Find the individual figures on a patent drawing sheet.

A sheet carries several numbered figures and one header line naming the office, the
date, the sheet number and the patent number. Each figure is many disconnected marks
-- an outline, its callout numerals, the leader lines between them -- so the figures
are found by growing the ink until each figure's marks merge into one blob, then
taking that blob's bounding box back on the original ink.

Pure apart from reading the image: everything here takes arrays and returns boxes.
"""

import numpy as np
from PIL import Image
from scipy import ndimage

# --- tuning -------------------------------------------------------------------

# Ink is black on white paper; anything below this is a mark.
INK_THRESHOLD = 128

# Sheets are rendered at print resolution, which is an order of magnitude more
# detail than a figure drawn a couple of hundred pixels wide can show. Halving the
# page before tracing costs nothing visible and takes about 45% off the path data.
# Going much below this starts merging figures instead: at a third, two of the five
# figures on a test sheet ran together.
PAGE_SCALE = 0.5

# How far a mark reaches when looking for the rest of its figure, in scaled pixels.
# Large enough to span a leader line's gap between a numeral and the part it points
# at, small enough to leave two figures on the same sheet separate.
GROW = 7

# A blob smaller than this in either direction is a speck or a stray numeral.
MIN_SIDE = 45

# A blob with less ink than this is a caption, not a drawing.
MIN_INK = 400

# The header line runs across the top of the sheet. A blob starting inside this
# band, and short enough to be a line of type rather than a drawing, is that header.
HEADER_BAND = 0.11
HEADER_HEIGHT = 0.07


def read_ink(image, scale=PAGE_SCALE):
    """A boolean array, true where the sheet is inked."""
    grey = image.convert('L')
    if scale != 1:
        grey = grey.resize((round(grey.width * scale), round(grey.height * scale)),
                           Image.LANCZOS)
    return np.array(grey) < INK_THRESHOLD


def figure_boxes(ink, grow=GROW):
    """Bounding boxes of the figures on a sheet, in reading order.

    @param ink: boolean array from read_ink
    @returns list of (x, y, width, height)
    """
    height, width = ink.shape
    grown = ndimage.binary_dilation(
        ink, ndimage.generate_binary_structure(2, 2), iterations=grow)
    labels, _ = ndimage.label(grown)

    boxes = []
    for rows, cols in ndimage.find_objects(labels):
        box = (cols.start, rows.start, cols.stop - cols.start, rows.stop - rows.start)
        if keep_box(box, ink[rows, cols].sum(), width, height):
            boxes.append(box)
    return sorted(boxes, key=lambda b: (b[1], b[0]))


def keep_box(box, inked, width, height):
    """Is this blob a figure, rather than a speck or the sheet's header line?"""
    x, y, w, h = box
    if w < MIN_SIDE or h < MIN_SIDE or inked < MIN_INK:
        return False
    is_header = y < height * HEADER_BAND and h < height * HEADER_HEIGHT
    return not is_header


def crop(ink, box, pad=8):
    """The ink inside a box, with a little paper around it."""
    x, y, w, h = box
    height, width = ink.shape
    top, left = max(0, y - pad), max(0, x - pad)
    bottom, right = min(height, y + h + pad), min(width, x + w + pad)
    return ink[top:bottom, left:right]
