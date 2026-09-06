"""Tests for the text-shaping harvest.py does between the PDF and labels.py."""

import unittest

from harvest import description_only, strip_margin_numbers


class StripMarginNumbers(unittest.TestCase):
    def test_removes_a_column_of_printed_line_numbers(self):
        column = "\n".join([
            "the flywheel carries four magnet elements 5",
            "on the inner peripheral surface of its rim,",
            "each secured by a holder of spring steel 10",
            "which expands outwardly against the rim,",
            "so that the elements cannot work loose 15",
        ])
        stripped = strip_margin_numbers(column)
        self.assertNotIn(" 5\n", stripped)
        self.assertNotIn(" 10\n", stripped)
        self.assertNotIn("15", stripped)
        self.assertIn("magnet elements", stripped)

    def test_keeps_reference_numerals_that_happen_to_end_a_line(self):
        # These are multiples of five at the end of a line, but they do not climb
        # the page, so they are parts and not a printed line-number column.
        column = "\n".join([
            "adhesive secures the magnet element holder 5",
            "against the flywheel rim described above 20",
            "which is itself carried by the centerpiece 5",
        ])
        self.assertEqual(strip_margin_numbers(column), column)

    def test_ignores_a_run_too_short_to_be_a_column(self):
        column = "the holder 5\nis fitted to the rim 10"
        self.assertEqual(strip_margin_numbers(column), column)


class DescriptionOnly(unittest.TestCase):
    def test_cuts_the_front_page_and_the_claims_away(self):
        text = (
            "3,265,913 8/1966 Irwin ... 310\n"
            "DETAILED DESCRIPTION OF THE INVENTION\n"
            "the flywheel 1 carries a magnet element holder 5.\n"
            "\n What is claimed is:\n"
            "1. A magneto as claimed in claim 4, wherein said holder\n"
        )
        kept = description_only(text)
        self.assertIn("magnet element holder 5", kept)
        self.assertNotIn("310", kept)
        self.assertNotIn("claim 4", kept)

    def test_keeps_everything_when_neither_heading_is_present(self):
        text = "the flywheel 1 carries a magnet element holder 5.\n"
        self.assertEqual(description_only(text), text)


if __name__ == "__main__":
    unittest.main()
