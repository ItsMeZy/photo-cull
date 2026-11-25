import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { root, windows, python, sidecarInfo } from "./common.mjs";

const { name, binary } = sidecarInfo();
execFileSync(python, ["-c", "import sys; assert sys.version_info >= (3, 10), 'Serve Python 3.10+'"], { stdio: "inherit" });
const assets = path.join(root, "python", "assets");
for (const file of ["mobilenet_v2_features.onnx", "model.json", "haarcascade_frontalface_default.xml", "haarcascade_eye.xml"]) {
  if (!existsSync(path.join(assets, file))) throw new Error(`Asset mancante: ${file}. Eseguire python/prepare_model.py.`);
}
const dist = path.join(root, "work", "sidecar-dist");
const specs = path.join(root, "work", "specs");
mkdirSync(specs, { recursive: true });
execFileSync(python, [
  "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile",
  "--name", "photo-engine", "--distpath", dist,
  "--workpath", path.join(root, "work", "pyinstaller"),
  "--specpath", specs, "--add-data", `${assets}${path.delimiter}assets`,
  "--exclude-module", "torch", "--exclude-module", "torchvision",
  path.join(root, "python", "engine.py"),
], { cwd: root, stdio: "inherit" });
mkdirSync(path.dirname(binary), { recursive: true });
copyFileSync(path.join(dist, `photo-engine${windows ? ".exe" : ""}`), binary);
if (!windows) chmodSync(binary, 0o755);
console.log(`Sidecar AI pronto: ${name}`);
