'use strict';
//
// PostCSS plugin: never hand the bundler a dependency OUTSIDE the project root.
//
// WHY (root cause, measured 2026-09-26): globals.css `@source`s the dist of
// every @ai-matrx package through node_modules symlinks. While pnpm relinks a
// package (any install / update that moves a version), the `@source` path is
// missing for a moment, and Tailwind v4 then registers a `dir-dependency` for
// EVERY ancestor directory so it can notice the path reappearing — "/",
// "/Users", "/Users/<me>/code", ... Next's Turbopack loader turns each
// dependency into a root-relative path and THROWS for one outside the root
// ("Cannot depend on path outside of root"), surfacing as
//   [project]/app/globals.css — FileSystemPath("").join("../../../..") leaves the filesystem root
// ("../../../.." is "/" seen from this checkout). The failed evaluation
// registered no usable dependencies, so nothing ever re-runs it: every route
// 500s until the dev server is restarted. Reproduced outside the shared server
// by running Tailwind in a loop while pnpm relinked a package (the ancestor
// dir-dependencies up to "/" appeared).
//
// WHAT: after every other plugin, drop dependency messages whose path is not
// inside the project root, and say so once per path. The in-root ancestors
// Tailwind also registers (node_modules/@ai-matrx, ...) stay, so the stylesheet
// still re-evaluates when the package reappears — an install never needs a
// server restart. Guard: scripts/postcss/__tests__/keep-dependencies-in-root.test.ts.
const path = require('path');

const DEPENDENCY_TYPES = new Set(['dependency', 'dir-dependency', 'context-dependency', 'missing-dependency', 'build-dependency']);
const announced = new Set();

function outsideRoot(root, target) {
  const rel = path.relative(root, target);
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

module.exports = (options = {}) => {
  const root = path.resolve(options.root || process.cwd());
  return {
    postcssPlugin: 'matrx-keep-dependencies-in-root',
    OnceExit(_css, { result }) {
      result.messages = result.messages.filter((message) => {
        if (!DEPENDENCY_TYPES.has(message.type)) return true;
        const target = message.dir || message.file;
        if (typeof target !== 'string' || !outsideRoot(root, target)) return true;
        const key = `${message.type} ${target}`;
        if (!announced.has(key)) {
          announced.add(key);
          process.stderr.write(
            `[postcss] dropped ${message.type} outside the project root: ${target} ` +
              `(a package relink in progress; Turbopack cannot watch it — the stylesheet re-evaluates when the package reappears)\n`,
          );
        }
        return false;
      });
    },
  };
};
module.exports.postcss = true;
