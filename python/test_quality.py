import unittest
import cv2
import numpy as np
from quality import score_sharpness, score_exposure, score_composition


class QualityTests(unittest.TestCase):
    def test_blur_reduces_sharpness(self):
        grid = ((np.indices((256, 256)).sum(axis=0) // 8) % 2 * 255).astype(np.uint8)
        blurred = cv2.GaussianBlur(grid, (25, 25), 5)
        self.assertGreater(score_sharpness(grid)["laplacian_variance"], score_sharpness(blurred)["laplacian_variance"])

    def test_clipping_penalizes_black_and_white(self):
        scores = [score_exposure(np.full((32, 32, 3), value, np.uint8))["score"] for value in (0, 128, 255)]
        self.assertGreater(scores[1], scores[0])
        self.assertGreater(scores[1], scores[2])

    def test_composition_flat_image_has_no_subject(self):
        self.assertIsNone(score_composition(np.zeros((32, 32), np.uint8), None)["score"])

    def test_centered_face_scores_above_corner(self):
        image = np.zeros((300, 300), np.uint8)
        self.assertGreater(score_composition(image, (125, 125, 50, 50))["score"],
                           score_composition(image, (0, 0, 30, 30))["score"])


if __name__ == "__main__":
    unittest.main()
