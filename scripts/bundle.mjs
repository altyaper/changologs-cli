// Bundles the CLI and its dependencies into one file, published as a GitHub
// Release asset so install.sh can download it instead of building from source.
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/changologs.js",
  bundle: true,
  minify: true,
  platform: "node",
  format: "esm",
  target: "node24",
  // turndown and its DOM parser are CommonJS; give them a real require() for node builtins.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  // Source builds read package.json at runtime instead; see src/update-check.ts.
  define: { __CHANGOLOGS_VERSION__: JSON.stringify(version) },
  logLevel: "warning",
});
