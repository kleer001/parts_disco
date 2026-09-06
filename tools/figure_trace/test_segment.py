"""Tests for telling a drawing apart from a block of set type."""

import unittest

import numpy as np

from segment import looks_like_type


def type_block(rows=12, cols=20, glyph=6):
    """Separate marks of glyph height, laid out in lines — what type looks like."""
    page = np.zeros((rows * glyph * 2, cols * glyph * 2), dtype=bool)
    for r in range(rows):
        for c in range(cols):
            top, left = r * glyph * 2, c * glyph * 2
            page[top:top + glyph, left:left + glyph - 2] = True
    return page


def line_drawing(size=200):
    """One closed outline — most of the ink in a single connected stroke."""
    page = np.zeros((size, size), dtype=bool)
    page[20:24, 20:180] = True
    page[176:180, 20:180] = True
    page[20:180, 20:24] = True
    page[20:180, 176:180] = True
    return page


class LooksLikeType(unittest.TestCase):
    def test_a_block_of_glyphs_reads_as_type(self):
        self.assertTrue(looks_like_type(type_block()))

    def test_a_closed_outline_does_not(self):
        self.assertFalse(looks_like_type(line_drawing()))

    def test_an_outline_with_callout_numerals_beside_it_is_still_a_drawing(self):
        # The numerals are glyph-sized and separate, but the outline still holds
        # most of the ink, which is what a figure looks like.
        page = line_drawing()
        page[60:66, 60:64] = True
        page[60:66, 70:74] = True
        page[80:86, 60:64] = True
        self.assertFalse(looks_like_type(page))

    def test_empty_paper_is_not_type(self):
        self.assertFalse(looks_like_type(np.zeros((50, 50), dtype=bool)))


if __name__ == "__main__":
    unittest.main()
