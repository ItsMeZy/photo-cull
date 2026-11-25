from pathlib import Path
import unittest
import numpy as np


@unittest.skipUnless((Path(__file__).parent / "assets" / "model.json").exists(), "Preparare prima gli asset MobileNetV2")
class LocalModelTests(unittest.TestCase):
    def test_local_inference_is_repeatable_and_normalized(self):
        from embeddings import Embedder
        embedder = Embedder(Path(__file__).parent / "assets")
        image = np.full((320, 480, 3), 128, np.uint8)
        first = np.asarray(embedder.embed(image))
        second = np.asarray(embedder.embed(image))
        self.assertEqual(first.shape, (1280,))
        self.assertTrue(np.isfinite(first).all())
        self.assertAlmostEqual(float(np.linalg.norm(first)), 1, places=5)
        np.testing.assert_allclose(first, second, atol=1e-6)


if __name__ == "__main__":
    unittest.main()
