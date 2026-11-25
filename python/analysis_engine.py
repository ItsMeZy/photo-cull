"""Pipeline offline: anteprime -> scoring -> embedding -> gruppi supervisionati."""
import calendar
import io
from datetime import datetime
from pathlib import Path
import sys
import time
from raw_previews import extract_folder, write_atomic


def default_assets():
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "assets"
    return Path(__file__).parent / "assets"


def sequence_metadata(image, source):
    try:
        exif = image.getexif()
        details = exif.get_ifd(34665)
        value = details.get(36867) or exif.get(36867)
        if value:
            parsed = datetime.strptime(str(value), "%Y:%m:%d %H:%M:%S")
            sub = str(details.get(37521, "")).strip()
            seconds = calendar.timegm(parsed.timetuple())
            if sub.isdigit():
                seconds += float("0." + sub[:9])
            return {"capture_time": str(value), "sequence_time_seconds": seconds,
                    "sequence_time_source": "preview_exif_wall_clock"}
    except (KeyError, ValueError, TypeError, OSError):
        pass
    return {"capture_time": None, "sequence_time_seconds": Path(source).stat().st_mtime_ns / 1e9,
            "sequence_time_source": "file_mtime_fallback"}


def analyze_folder(input_dir, cache_dir=None, limit=0, assets=None, threshold=0.94, max_gap=3.0, progress=None):
    started = time.perf_counter()
    import numpy as np
    from PIL import Image, ImageOps
    from embeddings import Embedder
    from grouping import group_photos
    from quality import QualityScorer

    # Fail-fast prima di leggere RAW se il modello non e' stato preparato.
    assets = Path(assets) if assets else default_assets()
    embedder, scorer = Embedder(assets), QualityScorer(assets)
    report = extract_folder(input_dir, cache_dir, limit, progress)
    photos, vectors, errors = [], {}, list(report["errors"])
    if progress:
        progress("analyze", 0, len(report["photos"]))
    for index, photo in enumerate(report["photos"], 1):
        try:
            with Image.open(photo["preview_path"]) as original:
                metadata = sequence_metadata(original, photo["source_path"])
                with ImageOps.exif_transpose(original) as oriented:
                    photo["display_width"], photo["display_height"] = oriented.size
                    with oriented.convert("RGB") as rgb_image:
                        # Dimensione limitata prima del passaggio a NumPy.
                        rgb_image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
                        rgb = np.asarray(rgb_image).copy()
                        rgb_image.thumbnail((320, 320), Image.Resampling.LANCZOS)
                        buffer = io.BytesIO()
                        rgb_image.save(buffer, format="JPEG", quality=82)
                        thumbnail = Path(report["cache_dir"]) / (photo["id"] + ".thumb.jpg")
                        write_atomic(thumbnail, buffer.getvalue())
                        photo["thumbnail_path"] = str(thumbnail)
            photo.update(metadata)
            photo["scores"] = scorer.score(rgb)
            vectors[photo["id"]] = embedder.embed(rgb)
            photo["decision"] = "unreviewed"
            photos.append(photo)
        except Exception as error:
            errors.append({"source_path": photo["source_path"], "code": "analysis_error", "message": str(error)})
        if progress and (index % 10 == 0 or index == len(report["photos"])):
            progress("analyze", index, len(report["photos"]))
    photos.sort(key=lambda item: (item["sequence_time_source"], item["sequence_time_seconds"], item["source_path"]))
    groups = group_photos(photos, [vectors[item["id"]] for item in photos], threshold, max_gap, normalized=True)
    fallback_count = sum(item["sequence_time_source"] == "file_mtime_fallback" for item in photos)
    report.update({
        "command": "analyze", "photos": photos, "errors": errors, "groups": groups,
        "success_count": len(photos), "error_count": len(errors), "group_count": len(groups),
        "status": "ok" if not errors else ("partial" if photos else "failed"),
        "analysis_version": "heuristic-v1-mobilenet-v2",
        "model": {"name": "mobilenet_v2_features", "sha256": embedder.model_hash, "embedding_dimensions": 1280},
        "grouping": {"cosine_similarity_threshold": threshold, "max_gap_seconds": max_gap,
                     "max_group_size": 25, "time_fallback_count": fallback_count},
        "warnings": (["Ora EXIF assente per {} foto: sequenza stimata dalla data di modifica dei file.".format(fallback_count)] if fallback_count else []),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
    })
    return report
