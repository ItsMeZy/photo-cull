"""Sidecar locale: ping, estrazione RAW e analisi. stdout riservato al JSON."""
import argparse
import json
import math
import sys
from raw_previews import extract_folder


def emit(response):
    print(json.dumps(response, ensure_ascii=True, allow_nan=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--ping")
    action.add_argument("--input-dir", help="Cartella RAW; scansione non ricorsiva")
    parser.add_argument("--cache-dir")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--analyze", action="store_true", help="Aggiunge scoring e grouping alle anteprime")
    parser.add_argument("--progress", action="store_true", help="Avanzamento su stderr; stdout rimane JSON")
    parser.add_argument("--assets-dir", help="Modello ONNX, manifest e cascade locali")
    parser.add_argument("--similarity", type=float, default=0.94)
    parser.add_argument("--max-gap", type=float, default=3.0)
    args = parser.parse_args()
    if args.limit < 0:
        parser.error("--limit deve essere maggiore o uguale a zero")
    if not math.isfinite(args.similarity) or not -1 <= args.similarity <= 1:
        parser.error("--similarity deve essere tra -1 e 1")
    if not math.isfinite(args.max_gap) or args.max_gap < 0:
        parser.error("--max-gap deve essere finito e non negativo")
    if args.ping is not None:
        if args.analyze:
            parser.error("--analyze richiede --input-dir")
        name = args.ping.strip()
        if not name or len(name) > 100:
            parser.error("Il nome deve contenere da 1 a 100 caratteri")
        emit({"protocol_version": 1, "message": "Ciao {}! Risposta dal sidecar Python locale.".format(name)})
        return 0
    try:
        if args.analyze:
            from analysis_engine import analyze_folder
            def progress(phase, done, total):
                if args.progress:
                    print("PHOTO_CULL_PROGRESS " + json.dumps({"phase": phase, "done": done, "total": total}), file=sys.stderr, flush=True)
            result = analyze_folder(args.input_dir, args.cache_dir, args.limit,
                                    args.assets_dir, args.similarity, args.max_gap, progress)
        else:
            result = extract_folder(args.input_dir, args.cache_dir, args.limit)
        emit(result)
        return 0
    except Exception as error:
        emit({"protocol_version": 1, "command": "analyze" if args.analyze else "extract_previews",
              "status": "error", "error": {"code": "batch_error", "message": str(error)}})
        print("Elaborazione non avviata: {}".format(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
