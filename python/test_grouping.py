import copy
import math
import unittest
from grouping import group_photos, unit_vector


def photo(identifier, seconds, quality=50, source="preview_exif_wall_clock"):
    return {"id": identifier, "sequence_time_seconds": seconds,
            "sequence_time_source": source, "scores": {"overall": quality}}


class GroupingTests(unittest.TestCase):
    def test_similar_burst_and_best_suggestion(self):
        photos = [photo("a", 0, 20), photo("b", 1, 90)]
        groups = group_photos(photos, [[1, 0], [1, 0]])
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["suggested_photo_id"], "b")
        self.assertNotIn("decision", photos[0])  # Nessuna approvazione automatica.

    def test_gap_and_different_frame_split(self):
        photos = [photo("a", 0), photo("b", 10), photo("c", 11)]
        self.assertEqual(len(group_photos(photos, [[1, 0], [1, 0], [0, 1]])), 3)

    def test_anchor_prevents_chaining(self):
        photos = [photo("a", 0), photo("b", 1), photo("c", 2)]
        vectors = [[math.cos(angle), math.sin(angle)] for angle in (0, 0.2, 0.4)]
        self.assertEqual(len(group_photos(photos, vectors, threshold=0.95)), 2)

    def test_no_mixing_clock_sources(self):
        photos = [photo("a", 0), photo("b", 1, source="file_mtime_fallback")]
        self.assertEqual(len(group_photos(photos, [[1, 0], [1, 0]])), 2)

    def test_group_size_bound_and_tie_break(self):
        photos = [photo(str(i), i) for i in range(4)]
        groups = group_photos(photos, [[1, 0]]*4, max_group=2)
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0]["suggested_photo_id"], "0")

    def test_invalid_vectors_and_parameters(self):
        for vector in ([], [0, 0], [float("nan"), 1], [float("inf")]):
            with self.assertRaises(ValueError):
                unit_vector(vector)
        with self.assertRaises(ValueError):
            group_photos([], [], threshold=float("nan"))
        with self.assertRaises(ValueError):
            group_photos([photo("a", 0)], [])

    def test_empty_batch(self):
        self.assertEqual(group_photos([], []), [])


if __name__ == "__main__":
    unittest.main()
