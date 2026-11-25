import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { python, root, sidecarInfo } from "./common.mjs";

const expected = (name) => ({
  protocol_version: 1,
  message: `Ciao ${name}! Risposta dal sidecar Python locale.`,
});
const script = new URL("../python/engine.py", import.meta.url);
const { fileURLToPath } = await import("node:url");
const binary = sidecarInfo().binary;
for (const [program, prefix] of [[python, [fileURLToPath(script)]], [binary, []]]) {
  for (const name of ["Fotografo", "José 📷", "Nome con spazi", "--nome"]) {
    const raw = execFileSync(program, [...prefix, `--ping=${name}`], { cwd: root, encoding: "utf8", timeout: 30000 });
    assert.deepEqual(JSON.parse(raw), expected(name));
  }
  const invalid = spawnSync(program, [...prefix, "--ping", " "], { encoding: "utf8", timeout: 30000 });
  assert.ifError(invalid.error);
  assert.notEqual(invalid.status, 0);
  assert.equal(invalid.stdout, "");
}
console.log("OK: script e binario sidecar; JSON, Unicode, spazi e input non valido.");
