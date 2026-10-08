// Dev-server loader: an @ai-matrx import the INSTALLED package cannot satisfy yet becomes a loud
// placeholder instead of a module error that answers 500 on every route of the shared preview.
// Why and how: scripts/lib/matrx-pending-imports.mjs (the judge + rewrite + self-test).
// Wired ONLY for `next dev` in next.config.js — a build still fails loudly.
const { statSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = join(__dirname, "..", "..");
let modulePromise = null;
let installStamp = null;
const announced = new Set();

// An install under the running server changes what every import resolves to: forget the caches.
function currentInstallStamp() {
  try {
    return statSync(join(ROOT, "node_modules", ".modules.yaml")).mtimeMs;
  } catch {
    return null;
  }
}

module.exports = function matrxPendingImportsLoader(source) {
  const callback = this.async();
  const file = this.resourcePath;
  // turbopackIgnore: Turbopack bundles this loader; this is a plain Node import of a repo script
  // (TypeScript-free on purpose — it runs in every loader worker).
  modulePromise ??= import(/* turbopackIgnore: true */ pathToFileURL(join(ROOT, "scripts", "lib", "matrx-pending-imports.mjs")).href);
  modulePromise
    .then((pending) => {
      const stamp = currentInstallStamp();
      if (stamp !== installStamp) {
        installStamp = stamp;
        pending.resetPendingCaches();
      }
      const result = pending.rescuePendingImports(file, source, ROOT);
      for (const dir of result.packageDirs) this.addDependency?.(join(dir, "package.json"));
      for (const p of result.pending) {
        const line = pending.describePending(p);
        // Once per name per worker. Not emitWarning: Turbopack prints that per layer with the full
        // import trace on every recompile, burying the shared log (42 blocks in minutes, 2026-10-08).
        if (!announced.has(line)) {
          announced.add(line);
          console.error(line);
        }
      }
      callback(null, result.code);
    })
    // The rescue must never be the thing that breaks the preview: on any failure, compile as written.
    .catch((err) => {
      console.error(`[matrx-pending] loader could not judge ${file}; compiling it unchanged: ${err?.stack ?? err}`);
      callback(null, source);
    });
};
