# Photo Cull

Photo Cull è un'app desktop per selezionare le foto e raggruppare gli scatti simili. L'analisi delle immagini avviene in locale.

## Installare Photo Cull su Windows x64

Per installare l'app su un nuovo PC basta **un solo installer**. Il pacchetto include Photo Cull, il motore di analisi e il modello. Il repository e gli strumenti di sviluppo servono per compilare l'app dai sorgenti.

1. Scarica l’installer `.exe` dalla [release v0.1.0 su GitHub](https://github.com/ItsMeZy/photo-cull/releases/tag/v0.1.0).
2. Apri il file scaricato con un doppio clic e segui la procedura di installazione. Se sul PC manca Microsoft Edge WebView2 Runtime, l'installer usa Internet per scaricarlo e installarlo.
3. Apri **Photo Cull** dal menu Start. L'analisi delle foto funziona offline anche al primo avvio.

Se hai già compilato l'app su un altro PC, puoi copiare il solo installer da `src-tauri/target/release/bundle/nsis/` (file `.exe`) o da `src-tauri/target/release/bundle/msi/` (file `.msi`).

## Usare Photo Cull

1. **Apri una cartella RAW.** Fai clic su **Apri cartella RAW** e scegli la cartella che contiene gli scatti. Photo Cull legge i file `.CR3`, `.ARW` e `.NEF` direttamente nella cartella selezionata. Per analizzare una sottocartella, aprila separatamente.
2. **Attendi l’analisi.** Photo Cull estrae le anteprime, raggruppa gli scatti simili e assegna un punteggio a ciascuna foto. Nella **Libreria**, usa il menu **Gruppi** per confrontare una sequenza alla volta. La stella ★ nella **Griglia** indica la foto con il punteggio più alto del gruppo.
3. **Confronta le foto.** Seleziona una miniatura e usa le frecce per muoverti nella griglia. Apri il dettaglio nel pannello **Loupe**, dove puoi passare da **Adatta** a **100%**. L’**Ispettore** mostra i punteggi di nitidezza, esposizione e composizione.
4. **Registra le decisioni.** Usa i pulsanti sotto l’anteprima o le scorciatoie `P` per **Approva**, `X` per **Scarta** e `U` per **Reset** (torna a **Da valutare**). Usa `Ctrl+Z` per annullare e `Ctrl+Maiusc+Z` per ripetere una decisione. Nella **Libreria**, puoi filtrare la griglia per foto **Da valutare**, **Approvate** o **Scartate**.
5. **Riprendi la selezione.** Le decisioni vengono salvate automaticamente sul PC. Riapri la stessa cartella per ritrovarle. Anche i file RAW delle foto scartate restano intatti nella cartella.

Prima di aprire una cartella, puoi regolare **Somiglianza** e **Intervallo (s)** nella **Libreria**. Una soglia più alta richiede scatti più simili. Un intervallo più alto consente di raggruppare scatti più distanti nel tempo. Per restare sulla stessa foto dopo averla approvata o scartata, disattiva **Avanza dopo la decisione**.

## Compilare dai sorgenti su Windows

### Prerequisiti

- Node.js 22.12 o superiore, con npm.
- Python 3.12 a 64 bit, con il launcher `py`.
- Rust con toolchain MSVC, Visual Studio Build Tools con il carico di lavoro **Sviluppo di applicazioni desktop con C++** e Microsoft Edge WebView2 Runtime.

Esegui i comandi seguenti dalla radice del repository in **Developer PowerShell for Visual Studio**, con l'ambiente di compilazione x64 attivo.

### Preparare il modello

```powershell
py -3.12 -m venv .model-venv
.\.model-venv\Scripts\python.exe -m pip install -r python/requirements-model.txt
.\.model-venv\Scripts\python.exe python/prepare_model.py --download-weights
```

Lo script scarica i pesi MobileNetV2 `IMAGENET1K_V2` e genera il modello ONNX, il manifest e i due file XML di OpenCV in `python/assets/`. Se hai già i pesi ufficiali, puoi usare `--weights <percorso>` al posto di `--download-weights`.

### Compilare l'app desktop

```powershell
npm ci
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r python/requirements.txt -r python/requirements-build.txt
npm run sidecar:build
npm run tauri -- build
```

Per avviare l'app in modalità sviluppo dopo aver compilato il sidecar, usa `npm run tauri -- dev`.
