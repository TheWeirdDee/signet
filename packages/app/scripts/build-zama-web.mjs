/**
 * Self-host the Zama relayer SDK web build.
 *
 * Zama's CDN no longer serves a UMD for relayer-sdk 0.4.x, and bundling the
 * web entry through Next's bundler stalls on the WASM/worker graph. So we
 * pre-bundle it ONCE with esbuild into /public/zama/ and the app dynamic-
 * imports it at runtime (the bundler never sees it).
 *
 * wasm-bindgen resolves its .wasm via `new URL("tfhe_bg.wasm", import.meta.url)`,
 * so the wasm files (and the multithreading worker snippets) are copied next
 * to the bundle output.
 *
 * Run: node scripts/build-zama-web.mjs   (wired into `npm run build` via prebuild)
 */
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../public/zama");
mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
// "./web" is the exported subpath; it maps to lib/web.js
const webEntry = require.resolve("@zama-fhe/relayer-sdk/web");
const tfheDir = path.dirname(require.resolve("tfhe/package.json"));
const tkmsDir = path.dirname(require.resolve("tkms/package.json"));

await build({
  entryPoints: [webEntry],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: path.join(outDir, "relayer-sdk-web.js"),
  // keep wasm-bindgen's `new URL(..., import.meta.url)` intact — the wasm
  // files are copied beside the output below
  external: ["*.wasm"],
  logLevel: "info",
});

for (const [dir, name] of [
  [tfheDir, "tfhe_bg.wasm"],
  [tkmsDir, "kms_lib_bg.wasm"],
]) {
  const src = path.join(dir, name);
  if (existsSync(src)) cpSync(src, path.join(outDir, name));
}
// multithreading worker snippets (used when wasm threads are available)
const snippets = path.join(tfheDir, "snippets");
if (existsSync(snippets)) cpSync(snippets, path.join(outDir, "snippets"), { recursive: true });

console.log("zama web bundle written to public/zama/");
