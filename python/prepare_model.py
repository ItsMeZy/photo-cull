"""Tool di sviluppo: esporta pesi pre-addestrati in ONNX. Non importato dall'app."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--download-weights", action="store_true", help="Scarica soltanto i pesi ufficiali PyTorch")
    source.add_argument("--weights", type=Path, help="Pesi IMAGENET1K_V2 locali, nessun download")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "assets")
    args = parser.parse_args()
    import torch
    from torchvision.models import mobilenet_v2, MobileNet_V2_Weights
    import cv2
    import numpy as np
    import onnx
    import onnxruntime as ort

    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if args.download_weights:
        weights = MobileNet_V2_Weights.IMAGENET1K_V2.get_state_dict(progress=True, check_hash=True)
    else:
        weights = torch.load(str(args.weights), map_location="cpu", weights_only=True)
    network = mobilenet_v2(weights=None)
    network.load_state_dict(weights)
    network.eval()
    # Esclude il classificatore ImageNet: restituisce 1280 feature, non 1000 classi.
    features = torch.nn.Sequential(network.features, torch.nn.AdaptiveAvgPool2d((1, 1)), torch.nn.Flatten(1)).eval()
    torch.manual_seed(0)
    example = torch.randn(1, 3, 224, 224)
    temporary = output / "mobilenet_v2_features.part.onnx"
    with torch.inference_mode():
        reference = features(example).numpy()
        torch.onnx.export(features, example, str(temporary), input_names=["image"],
                          output_names=["embedding"], opset_version=17, dynamo=False)
    onnx.checker.check_model(onnx.load(str(temporary)))
    session = ort.InferenceSession(str(temporary), providers=["CPUExecutionProvider"])
    actual = session.run(None, {"image": example.numpy()})[0]
    np.testing.assert_allclose(actual, reference, rtol=1e-3, atol=1e-4)
    model = output / "mobilenet_v2_features.onnx"
    temporary.replace(model)
    for name in ("haarcascade_frontalface_default.xml", "haarcascade_eye.xml"):
        shutil.copyfile(str(Path(cv2.data.haarcascades) / name), str(output / name))
    manifest = {"schema_version": 1, "architecture": "mobilenet_v2_features",
                "weights": "torchvision.MobileNet_V2_Weights.IMAGENET1K_V2",
                "sha256": hashlib.sha256(model.read_bytes()).hexdigest(),
                "input_shape": [1, 3, 224, 224], "output_shape": [1, 1280],
                "resize_short": 232, "crop": 224,
                "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]}
    (output / "model.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("OK: modello ONNX verificato contro PyTorch, manifest e cascade in {}".format(output))


if __name__ == "__main__":
    main()
