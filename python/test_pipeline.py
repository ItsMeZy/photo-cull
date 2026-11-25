import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from PIL import Image
from analysis_engine import analyze_folder


class PipelineTests(unittest.TestCase):
    def test_oriented_thumbnail_is_small_and_independent_of_raw(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "test.ARW"
            source.write_bytes(b"original RAW placeholder")
            preview = root / "preview.jpg"
            with Image.new("RGB", (640, 400), "gray") as image:
                exif = Image.Exif(); exif[274] = 6
                image.save(preview, "JPEG", exif=exif)
            photo = {"id": "photo-one", "source_path": str(source), "preview_path": str(preview)}
            report = {"photos": [photo], "errors": [], "cache_dir": str(root), "processed_count": 1}
            progress = []
            with patch("analysis_engine.extract_folder", return_value=report), patch("embeddings.Embedder") as embedder, patch("quality.QualityScorer") as scorer:
                embedder.return_value.embed.return_value = np.array([1, 0], dtype=np.float32)
                embedder.return_value.model_hash = "test"
                scorer.return_value.score.return_value = {"overall": 70}
                result = analyze_folder(root, assets=root, progress=lambda *args: progress.append(args))
            self.assertEqual(result["success_count"], 1)
            self.assertEqual((photo["display_width"], photo["display_height"]), (400, 640))
            with Image.open(photo["thumbnail_path"]) as thumb:
                self.assertEqual(thumb.size, (200, 320))
                self.assertNotIn(274, thumb.getexif())
            self.assertEqual(source.read_bytes(), b"original RAW placeholder")
            self.assertEqual(photo["decision"], "unreviewed")
            self.assertEqual(progress[-1], ("analyze", 1, 1))


if __name__ == "__main__":
    unittest.main()
