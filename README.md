# Photo Cull

Photo Cull è un'app desktop per selezionare le foto e raggruppare gli scatti simili. L'analisi delle immagini avviene in locale.

## Prerequisiti su Windows

- Node.js 22.12 o superiore, con npm.
- Python 3.12 a 64 bit, con il launcher `py`.
- Rust con toolchain MSVC, Visual Studio Build Tools con il carico di lavoro **Sviluppo di applicazioni desktop con C++** e Microsoft Edge WebView2 Runtime.

Esegui i comandi seguenti dalla radice del repository in **Developer PowerShell for Visual Studio**, con l'ambiente di compilazione x64 attivo.

## Preparare il modello

```powershell
py -3.12 -m venv .model-venv
.\.model-venv\Scripts\python.exe -m pip install -r python/requirements-model.txt
.\.model-venv\Scripts\python.exe python/prepare_model.py --download-weights
```

Lo script scarica i pesi MobileNetV2 `IMAGENET1K_V2` e genera il modello ONNX, il manifest e i due file XML di OpenCV in `python/assets/`. Se hai già i pesi ufficiali, puoi usare `--weights <percorso>` al posto di `--download-weights`.

## Compilare l'app desktop

```powershell
npm ci
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r python/requirements.txt -r python/requirements-build.txt
npm run sidecar:build
npm run tauri -- build
```

Il sidecar Python incorpora gli asset del modello. L'app installata può quindi analizzare le foto offline anche al primo avvio. Gli installer sono nella cartella `src-tauri/target/release/bundle/`.

Per avviare l'app in modalità sviluppo dopo aver compilato il sidecar, usa `npm run tauri -- dev`.
