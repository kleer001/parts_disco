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

# Set type and line art separate on two measurements together.
#
# A drawing is mostly ONE stroke: its outline connects to itself, so the largest
# connected component holds most of the ink. Type has no such component -- every
# glyph is its own island, and the biggest is one letter out of hundreds. Measured
# on real sheets, that share ran 0.31-0.84 for figures and 0.002-0.044 for text.
#
# Alone it is not enough: a heavily hatched figure is many separate strokes and can
# drop to 0.13. So height decides those. The marks in a drawing are fragments of a
# line, a pixel or two tall; the marks in type are glyphs, 3-8px. A block is type
# only when it is short of a dominant stroke AND its marks are glyph-sized.
#
# This is what keeps title blocks, reference tables and inventor signatures off the
# board. They sit on drawing pages as often as text pages, so page number is no
# guide -- a 1952 grant put its title block on page 4 and its foreign-references
# table on page 11.
TYPE_MIN_MEDIAN_HEIGHT = 3.0
TYPE_MAX_DOMINANT_SHARE = 0.10


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
        if keep_box(box, ink[rows, cols], width, height):
            boxes.append(box)
    return sorted(boxes, key=lambda b: (b[1], b[0]))


def looks_like_type(piece):
    """Is this block set type rather than line art?"""
    labels, count = ndimage.label(piece)
    if not count:
        return False
    heights = np.array([rows.stop - rows.start
                        for rows, _ in ndimage.find_objects(labels)])
    if float(np.median(heights)) < TYPE_MIN_MEDIAN_HEIGHT:
        return False  # marks are line fragments, not glyphs
    sizes = ndimage.sum_labels(piece, labels, range(1, count + 1))
    dominant = sizes.max() / sizes.sum()
    return dominant < TYPE_MAX_DOMINANT_SHARE


def keep_box(box, piece, width, height):
    """Is this blob a figure, rather than a speck, a header, or a block of type?"""
    x, y, w, h = box
    if w < MIN_SIDE or h < MIN_SIDE or piece.sum() < MIN_INK:
        return False
    if y < height * HEADER_BAND and h < height * HEADER_HEIGHT:
        return False
    return not looks_like_type(piece)


def crop(ink, box, pad=8):
    """The ink inside a box, with a little paper around it."""
    x, y, w, h = box
    height, width = ink.shape
    top, left = max(0, y - pad), max(0, x - pad)
    bottom, right = min(height, y + h + pad), min(width, x + w + pad)
    return ink[top:bottom, left:right]
