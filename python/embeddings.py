"""Inferenza MobileNetV2 locale, senza download o import di PyTorch."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
import onnxruntime as ort
from grouping import unit_vector


class Embedder:
    def __init__(self, assets):
        assets = Path(assets)
        model = assets / "mobilenet_v2_features.onnx"
        manifest = json.loads((assets / "model.json").read_text(encoding="utf-8"))
        if manifest.get("schema_version") != 1 or manifest.get("architecture") != "mobilenet_v2_features":
            raise ValueError("Manifest modello incompatibile")
        if hashlib.sha256(model.read_bytes()).hexdigest() != manifest["sha256"]:
            raise ValueError("Hash modello diverso dal manifest")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        ort.disable_telemetry_events()
        self.session = ort.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"])
        inputs, outputs = self.session.get_inputs(), self.session.get_outputs()
        if len(inputs) != 1 or inputs[0].shape != [1, 3, 224, 224] or len(outputs) != 1 or outputs[0].shape != [1, 1280]:
            raise ValueError("Dimensioni del modello non compatibili")
        self.input_name = inputs[0].name
        self.model_hash = manifest["sha256"]

    def embed(self, rgb):
        image = Image.fromarray(rgb)
        width, height = image.size
        # Preprocessing dei pesi IMAGENET1K_V2: lato corto 232, crop centrale 224.
        if width <= height:
            size = (232, int(232 * height / width))
        else:
            size = (int(232 * width / height), 232)
        image = image.resize(size, Image.Resampling.BILINEAR)
        left, top = round((size[0]-224)/2), round((size[1]-224)/2)
        image = image.crop((left, top, left+224, top+224))
        array = np.asarray(image, dtype=np.float32) / 255
        array = (array - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
        tensor = np.ascontiguousarray(array.transpose(2, 0, 1)[None])
        vector = self.session.run(None, {self.input_name: tensor})[0].reshape(-1)
        if vector.size != 1280:
            raise ValueError("Embedding non valido")
        vector = np.asarray(vector, dtype=np.float32)
        norm = float(np.linalg.norm(vector))
        if not np.isfinite(vector).all() or not np.isfinite(norm) or norm <= 1e-12:
            raise ValueError("Embedding non finito o nullo")
        return vector / norm
