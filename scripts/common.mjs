import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const windows = process.platform === "win32";
export const python = path.join(root, ".venv", windows ? "Scripts/python.exe" : "bin/python");
export function sidecarInfo() {
  const info = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const target = /^host: (.+)$/m.exec(info)?.[1].trim();
  if (!target) throw new Error("Target Rust non rilevato");
  const name = `photo-engine-${target}${windows ? ".exe" : ""}`;
  return { name, binary: path.join(root, "src-tauri", "binaries", name) };
}
