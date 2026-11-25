"""Anteprime incorporate nei RAW. Nessun demosaicing o servizio di rete."""
import hashlib
import io
import os
from pathlib import Path
import tempfile
import time

RAW_EXTENSIONS = frozenset({".cr3", ".arw", ".nef"})


class PreviewError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def discover_raws(folder):
    """Ordine per nome, non per data di scatto. Esclude link e sottocartelle."""
    folder = Path(folder).expanduser().resolve(strict=True)
    if not folder.is_dir():
        raise ValueError("Il percorso di input non e' una cartella")
    paths = sorted(
        (item for item in folder.iterdir()
         if not item.is_symlink() and item.is_file()
         and item.suffix.lower() in RAW_EXTENSIONS),
        key=lambda item: (item.name.casefold(), item.name),
    )
    return folder, paths


def photo_id(source, stat):
    fingerprint = "{}|{}|{}".format(source, stat.st_size, stat.st_mtime_ns)
    return hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()


def write_atomic(destination, data):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=str(destination.parent), suffix=".part", delete=False
        ) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(str(temporary), str(destination))
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def thumbnail_bytes(source):
    # Il ping continua a funzionare anche senza queste dipendenze.
    import rawpy
    from PIL import Image

    try:
        with rawpy.imread(str(source)) as raw:
            thumbnail = raw.extract_thumb()
            if thumbnail.format == rawpy.ThumbFormat.JPEG:
                data = bytes(thumbnail.data)
                kind = "embedded_jpeg"
            elif thumbnail.format == rawpy.ThumbFormat.BITMAP:
                with Image.fromarray(thumbnail.data) as image:
                    with image.convert("RGB") as rgb:
                        buffer = io.BytesIO()
                        rgb.save(buffer, format="JPEG", quality=95)
                        data = buffer.getvalue()
                kind = "embedded_bitmap"
            else:
                raise PreviewError("unsupported_thumbnail", "Formato anteprima non supportato")
    except rawpy.LibRawNoThumbnailError as error:
        raise PreviewError("no_thumbnail", "Il RAW non contiene un'anteprima estraibile") from error
    except rawpy.LibRawUnsupportedThumbnailError as error:
        raise PreviewError("unsupported_thumbnail", str(error)) from error
    except rawpy.LibRawFileUnsupportedError as error:
        raise PreviewError("unsupported_raw", str(error)) from error
    except rawpy.LibRawError as error:
        raise PreviewError("raw_read_error", str(error)) from error

    # Decodifica di controllo per rilevare anche JPEG troncati.
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "JPEG":
            raise PreviewError("invalid_preview", "L'anteprima estratta non e' JPEG")
        image.load()
        width, height = image.size
        orientation = int(image.getexif().get(274, 1))
    return data, kind, width, height, orientation


def extract_one(source, cache):
    started = time.perf_counter()
    before = source.stat()
    identifier = photo_id(source, before)
    data, kind, width, height, orientation = thumbnail_bytes(source)
    after = source.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise PreviewError("source_changed", "Il RAW e' cambiato durante l'estrazione")
    destination = cache / (identifier + ".jpg")
    write_atomic(destination, data)
    return {
        "id": identifier, "source_path": str(source), "preview_path": str(destination),
        "preview_kind": kind, "width": width, "height": height,
        "exif_orientation": orientation,
        "source_size_bytes": before.st_size, "preview_size_bytes": len(data),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
    }


def extract_folder(input_dir, cache_dir=None, limit=0, progress=None):
    started = time.perf_counter()
    if limit < 0:
        raise ValueError("Il limite non puo' essere negativo")
    folder, paths = discover_raws(input_dir)
    if cache_dir is None:
        cache = Path(tempfile.mkdtemp(prefix="photo-cull-previews-")).resolve()
        temporary_cache = True
    else:
        cache = Path(cache_dir).expanduser().resolve()
        if cache == folder:
            raise ValueError("La cache deve essere diversa dalla cartella RAW")
        cache.mkdir(parents=True, exist_ok=True)
        temporary_cache = False
    selected = paths[:limit] if limit else paths
    photos, errors = [], []
    if progress:
        progress("extract", 0, len(selected))
    for index, source in enumerate(selected, 1):
        try:
            photos.append(extract_one(source, cache))
        except Exception as error:
            errors.append({
                "source_path": str(source), "code": getattr(error, "code", "extraction_error"),
                "message": str(error),
            })
        if progress and (index % 25 == 0 or index == len(selected)):
            progress("extract", index, len(selected))
    status = "ok" if not errors else ("partial" if photos else "failed")
    return {
        "protocol_version": 1, "command": "extract_previews", "status": status,
        "input_dir": str(folder), "cache_dir": str(cache), "temporary_cache": temporary_cache,
        "discovered_count": len(paths), "processed_count": len(selected),
        "success_count": len(photos), "error_count": len(errors),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
        "photos": photos, "errors": errors,
    }
