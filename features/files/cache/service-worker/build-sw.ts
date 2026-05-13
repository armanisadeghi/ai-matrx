/**
 * Compile features/files/cache/service-worker/src/sw.ts → public/blob-sw.js
 *
 * Run via `pnpm build:sw`. Wired into the main `pnpm build` script in
 * package.json so the SW artifact is regenerated on every production
 * build. In dev the SW is registered by the page only when explicitly
 * opted in (`localStorage.matrx_dev_sw=1`) so HMR isn't interfered with.
 *
 * Output target: ES2020 IIFE (the SW runs in its own worker context; no
 * module loader available). Minified for the smallest possible network
 * footprint — the SW is the first thing every authed page loads.
 */

import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
// features/files/cache/service-worker → repo root: 4 levels up.
const ROOT = resolve(__dirname, "../../../..");

const SRC = resolve(__dirname, "src/sw.ts");
const OUT = resolve(ROOT, "public/blob-sw.js");

async function main(): Promise<void> {
    await build({
        entryPoints: [SRC],
        outfile: OUT,
        bundle: true,
        minify: true,
        sourcemap: false,
        target: "es2020",
        format: "iife",
        platform: "browser",
        // The SW runs as a classic script. We intentionally do NOT mark it
        // `type: 'module'` — older Safari versions reject module workers.
        legalComments: "none",
        logLevel: "info",
    });

    // Stamp the artifact with a build-time version comment so it's easy to
    // confirm in DevTools that the served SW matches the source tree.
    const content = await readFile(OUT, "utf8");
    const stamped = `// matrx blob-cache SW — built ${new Date().toISOString()}\n${content}`;
    await writeFile(OUT, stamped, "utf8");
    // eslint-disable-next-line no-console
    console.log(
        `✓ blob-sw.js (${(stamped.length / 1024).toFixed(1)} KB) → ${OUT}`,
    );
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[build-sw] failed:", err);
    process.exit(1);
});
