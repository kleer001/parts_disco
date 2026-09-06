"""Tests for the numeral -> part-name extractor.  Run: python3 -m unittest discover"""

import unittest

from labels import MIN_NUMERALS_FOR_BOARD, extract_labels, screen


class ExtractLabels(unittest.TestCase):
    def test_repeated_pairing_names_the_part(self):
        text = (
            "The distributor cap 42 is shown. The distributor cap 42 seats on the housing 40. "
            "A distributor cap 42 carries the towers 44."
        )
        self.assertEqual(extract_labels(text)["42"]["name"], "distributor cap")

    def test_most_specific_name_carried_by_half_the_mentions_wins(self):
        # "cap" appears in every mention, "distributor cap" in two of three. The more
        # specific name is the useful one and it clears the support threshold.
        text = "The ignition distributor cap 42 is here. The distributor cap 42 seats. The cap 42 seals."
        self.assertEqual(extract_labels(text)["42"]["name"], "distributor cap")

    def test_figure_references_are_not_parts(self):
        text = "FIG. 2 is an exploded view. As FIG. 3 shows, the piston 12 moves. The piston 12 is shown."
        labels = extract_labels(text)
        self.assertIn("12", labels)
        self.assertNotIn("2", labels)
        self.assertNotIn("3", labels)

    def test_cited_patent_numbers_are_not_parts(self):
        text = "See U.S. Pat. No. 4,123,456 for context. The crankshaft 20 turns. The crankshaft 20 is journalled."
        labels = extract_labels(text)
        self.assertEqual(list(labels), ["20"])

    def test_measurements_are_not_parts(self):
        text = "The bore is about 86 mm across. The valve 30 opens. The valve 30 closes."
        labels = extract_labels(text)
        self.assertIn("30", labels)
        self.assertNotIn("86", labels)

    def test_leading_ordinals_and_articles_are_stripped(self):
        text = "The first piston 10 rises. The second piston 10 falls. Said piston 10 reciprocates."
        self.assertEqual(extract_labels(text)["10"]["name"], "piston")

    def test_confidence_reports_how_much_of_the_evidence_agreed(self):
        text = "The rocker arm 55 pivots. The rocker arm 55 returns."
        entry = extract_labels(text)["55"]
        self.assertEqual(entry["mentions"], 2)
        self.assertEqual(entry["confidence"], 1.0)

    def test_output_is_ordered_numerically_and_repeatable(self):
        text = "The cam 100 turns. The cam 100 lifts. The pin 9 holds. The pin 9 seats. The rod 20 links. The rod 20 swings."
        self.assertEqual(list(extract_labels(text)), ["9", "20", "100"])
        self.assertEqual(extract_labels(text), extract_labels(text))

    def test_numeral_suffixes_fold_into_the_base_numeral(self):
        text = "The bearing 16a supports. The bearing 16b supports. The bearing 16 supports."
        self.assertEqual(extract_labels(text)["16"]["mentions"], 3)

    def test_text_with_no_numerals_yields_nothing(self):
        self.assertEqual(extract_labels("An engine of the usual kind, having no callouts."), {})


class Screen(unittest.TestCase):
    def _labels(self, n):
        text = " ".join(f"The part{i} {i * 10} sits. The part{i} {i * 10} rests." for i in range(1, n + 1))
        return extract_labels(text)

    def test_sparse_figure_is_rejected(self):
        ok, reason = screen(self._labels(MIN_NUMERALS_FOR_BOARD - 1))
        self.assertFalse(ok)
        self.assertIn("want", reason)

    def test_dense_figure_passes(self):
        ok, _ = screen(self._labels(MIN_NUMERALS_FOR_BOARD))
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
