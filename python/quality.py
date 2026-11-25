"""Indicatori euristici su anteprime: non misure assolute della qualita' RAW."""
import math
from pathlib import Path
import cv2
import numpy as np


def score_sharpness(gray, size=256):
    if gray.size == 0:
        raise ValueError("Regione di nitidezza vuota")
    # Dimensione comune per ciascun tipo di ROI; scala intenzionalmente fissa.
    normalized = cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)
    smoothed = cv2.GaussianBlur(normalized, (3, 3), 0)
    variance = float(cv2.Laplacian(smoothed, cv2.CV_64F).var())
    return {"score": round(100 * (1 - math.exp(-variance / 180.0)), 2),
            "laplacian_variance": round(variance, 4)}


def score_exposure(rgb):
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    shadows = float(np.mean(gray <= 5))
    highlights = float(np.mean(np.max(rgb, axis=2) >= 250))
    mean = float(gray.mean() / 255)
    # Penalita' di clipping + penalita' moderata per luminosita' lontana dal centro.
    score = 100 * math.exp(-4 * (shadows + highlights)) * (1 - 0.35 * abs(mean - 0.5) * 2)
    return {"score": round(max(0, min(100, score)), 2),
            "shadow_clipping_fraction": round(shadows, 6),
            "highlight_channel_clipping_fraction": round(highlights, 6),
            "mean_luminance": round(mean, 6),
            "histogram_16": np.histogram(gray, bins=16, range=(0, 256))[0].tolist()}


def score_composition(gray, face):
    height, width = gray.shape
    if face is not None:
        x, y, w, h = face
        cx, cy = (x + w / 2) / width, (y + h / 2) / height
        method, confidence = "largest_face_center", "medium"
    else:
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
        energy = cv2.magnitude(gx, gy)
        total = float(energy.sum())
        if total <= 1e-6:
            return {"score": None, "method": "no_subject_estimate", "confidence": "none"}
        cx = float((energy.sum(axis=0) * np.arange(width)).sum() / total / width)
        cy = float((energy.sum(axis=1) * np.arange(height)).sum() / total / height)
        method, confidence = "edge_energy_centroid", "low"
    targets = [(0.5, 0.5)] + [(x, y) for x in (1 / 3, 2 / 3) for y in (1 / 3, 2 / 3)]
    distance = min(math.hypot(cx - x, cy - y) for x, y in targets)
    return {"score": round(100 * math.exp(-0.5 * (distance / 0.2) ** 2), 2),
            "method": method, "confidence": confidence,
            "subject_center_normalized": [round(cx, 4), round(cy, 4)]}


class QualityScorer:
    def __init__(self, assets):
        self.face = cv2.CascadeClassifier(str(Path(assets) / "haarcascade_frontalface_default.xml"))
        self.eye = cv2.CascadeClassifier(str(Path(assets) / "haarcascade_eye.xml"))
        if self.face.empty() or self.eye.empty():
            raise ValueError("Cascade mancanti: eseguire prepare_model.py")

    def score(self, rgb):
        height, width = rgb.shape[:2]
        scale = min(1.0, 1600 / max(width, height))
        small = cv2.resize(rgb, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
        faces = self.face.detectMultiScale(cv2.equalizeHist(gray), scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
        faces = sorted([tuple(int(v) for v in box) for box in faces], key=lambda box: box[2] * box[3], reverse=True)
        primary = faces[0] if faces else None
        region, method, eyes = gray, "whole_frame", []
        if primary is not None:
            x, y, w, h = primary
            region, method = gray[y:y+h, x:x+w], "largest_face"
            upper = region[:max(1, int(h * 0.6)), :]
            candidates = self.eye.detectMultiScale(upper, scaleFactor=1.1, minNeighbors=5, minSize=(12, 12))
            candidates = sorted([tuple(int(v) for v in box) for box in candidates], key=lambda box: box[2] * box[3], reverse=True)
            for i, left in enumerate(candidates):
                for right in candidates[i+1:]:
                    lx, ly = left[0] + left[2]/2, left[1] + left[3]/2
                    rx, ry = right[0] + right[2]/2, right[1] + right[3]/2
                    if 0.15*w <= abs(lx-rx) <= 0.7*w and abs(ly-ry) <= 0.15*h:
                        eyes = [left, right]
                        break
                if eyes:
                    break
        if eyes:
            measurements = [score_sharpness(region[y:y+h, x:x+w], size=64) for x, y, w, h in eyes]
            sharpness = {"score": round(float(np.mean([m["score"] for m in measurements])), 2),
                         "laplacian_variance": round(float(np.mean([m["laplacian_variance"] for m in measurements])), 4)}
            method = "detected_eye_pair"
        else:
            sharpness = score_sharpness(region)
        sharpness["region"] = method
        sharpness["confidence"] = "medium" if primary is not None else "low"
        exposure = score_exposure(small)
        composition = score_composition(gray, primary)
        composition_weight = 0.1 if primary is not None else 0.05
        weighted = 0.6 * sharpness["score"] + 0.3 * exposure["score"]
        denominator = 0.9
        if composition["score"] is not None:
            weighted += composition_weight * composition["score"]
            denominator += composition_weight
        return {"overall": round(weighted / denominator, 2), "sharpness": sharpness,
                "exposure": exposure, "composition": composition,
                "face_count": len(faces), "face_boxes_analysis_pixels": [list(box) for box in faces],
                "analysis_size": {"width": gray.shape[1], "height": gray.shape[0]}}
