"""Test con anteprime sintetiche. Non sostituiscono prove con RAW di fotocamere."""
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import rawpy
import numpy as np
from PIL import Image
from raw_previews import PreviewError, discover_raws, extract_folder, thumbnail_bytes, write_atomic


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name) / "originals"
        self.folder.mkdir()
        self.cache = Path(self.temporary.name) / "cache"

    def raw(self, name):
        source = self.folder / name
        source.write_bytes(b"placeholder RAW - not a camera file")
        return source

    def test_discovery_extensions_and_no_recursion(self):
        for name in ("b.NEF", "a.CR3", "c.ARW", "ignored.jpg"):
            self.raw(name)
        (self.folder / "sub").mkdir()
        (self.folder / "sub" / "nested.NEF").touch()
        _, paths = discover_raws(self.folder)
        self.assertEqual([p.name for p in paths], ["a.CR3", "b.NEF", "c.ARW"])

    def test_jpeg_is_copied_without_reencoding(self):
        buffer = io.BytesIO()
        with Image.new("RGB", (48, 32), "red") as image:
            image.save(buffer, "JPEG")
        data = buffer.getvalue()
        with patch("rawpy.imread") as read:
            read.return_value.__enter__.return_value.extract_thumb.return_value = SimpleNamespace(
                format=rawpy.ThumbFormat.JPEG, data=data)
            output, kind, width, height, orientation = thumbnail_bytes(Path("fake.NEF"))
        self.assertEqual(output, data)
        self.assertEqual((kind, width, height, orientation), ("embedded_jpeg", 48, 32, 1))

    def test_bitmap_is_converted_to_jpeg(self):
        with patch("rawpy.imread") as read:
            read.return_value.__enter__.return_value.extract_thumb.return_value = SimpleNamespace(
                format=rawpy.ThumbFormat.BITMAP, data=np.zeros((20, 30, 3), dtype=np.uint8))
            data, kind, width, height, _ = thumbnail_bytes(Path("fake.ARW"))
        self.assertTrue(data.startswith(b"\xff\xd8"))
        self.assertEqual((kind, width, height), ("embedded_bitmap", 30, 20))

    def test_missing_thumbnail_is_reported(self):
        with patch("rawpy.imread") as read:
            read.return_value.__enter__.return_value.extract_thumb.side_effect = rawpy.LibRawNoThumbnailError()
            with self.assertRaises(PreviewError) as caught:
                thumbnail_bytes(Path("fake.CR3"))
        self.assertEqual(caught.exception.code, "no_thumbnail")

    def test_failure_does_not_stop_batch_or_modify_originals(self):
        first, second = self.raw("a.NEF"), self.raw("b.NEF")
        before = {p: p.read_bytes() for p in (first, second)}
        with patch("raw_previews.thumbnail_bytes", side_effect=[
            PreviewError("no_thumbnail", "Assente"), (b"jpeg test bytes", "embedded_jpeg", 40, 30, 1)
        ]):
            report = extract_folder(self.folder, self.cache)
        self.assertEqual(report["status"], "partial")
        self.assertEqual((report["success_count"], report["error_count"]), (1, 1))
        self.assertEqual(Path(report["photos"][0]["preview_path"]).read_bytes(), b"jpeg test bytes")
        self.assertEqual({p: p.read_bytes() for p in (first, second)}, before)

    def test_limit_and_empty_folder(self):
        self.assertEqual(extract_folder(self.folder, self.cache)["processed_count"], 0)
        self.raw("a.NEF")
        self.raw("b.ARW")
        with patch("raw_previews.thumbnail_bytes", return_value=(b"jpeg", "embedded_jpeg", 1, 1, 1)):
            report = extract_folder(self.folder, self.cache, limit=1)
        self.assertEqual((report["discovered_count"], report["processed_count"]), (2, 1))

    def test_atomic_failure_removes_partial_file(self):
        self.cache.mkdir()
        with patch("raw_previews.os.replace", side_effect=OSError("disco non disponibile")):
            with self.assertRaises(OSError):
                write_atomic(self.cache / "preview.jpg", b"jpeg")
        self.assertEqual(list(self.cache.iterdir()), [])

    def test_invalid_input_and_cache_location(self):
        with self.assertRaises(FileNotFoundError):
            extract_folder(self.folder / "missing")
        with self.assertRaises(ValueError):
            extract_folder(self.folder, self.folder)


if __name__ == "__main__":
    unittest.main()
