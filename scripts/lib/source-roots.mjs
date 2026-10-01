/**
 * WHERE THIS REPO'S SOURCE LIVES, AND WHAT ITS IMPORT ALIASES MEAN — the one answer every
 * hand-written guard, census and resolver asks.
 *
 * Why it exists: the chat code is moving from `features/` into the workspace package
 * `packages/chat/src` (common-docs projects/chat-package-move). After that move an import is
 * spelled three ways — `@/x` (app → app), `@host/x` (package → app; resolves exactly like `@/`)
 * and `@ai-matrx/chat/x` (app → package; resolves to `packages/chat/src/x`) — and feature code
 * lives under two roots. A guard that only knows `@/` or only walks `features/` keeps passing
 * while reading nothing of the moved code. Every such guard routes through this file, so a new
 * alias or a new root is one line here.
 *
 * Plain JavaScript on purpose: `node scripts/*.mjs`, `tsx scripts/*.ts` and Jest suites all
 * import it. Types: `source-roots.d.mts`. Paths are repo-relative and POSIX.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The chat workspace package's source directory (absent until the move lands). */
export const CHAT_PACKAGE_SRC = "packages/chat/src";

/** Every directory that holds feature code. A scan of `features/` scans all of these. */
export const FEATURE_ROOTS = Object.freeze(["features", CHAT_PACKAGE_SRC]);

/** The app's top-level source directories, the feature roots included. */
export const SOURCE_ROOTS = Object.freeze([
  "app",
  "features",
  "components",
  "lib",
  "hooks",
  "utils",
  "providers",
  "types",
  "constants",
  "config",
  CHAT_PACKAGE_SRC,
]);

/**
 * Module alias prefix → the repo-relative directory it resolves to (tsconfig `paths`, jest
 * `moduleNameMapper`). Longest prefix first is not needed: no prefix is a prefix of another.
 */
export const MODULE_ALIASES = Object.freeze([
  Object.freeze(["@/", ""]),
  Object.freeze(["@host/", ""]),
  Object.freeze(["@ai-matrx/chat/", `${CHAT_PACKAGE_SRC}/`]),
]);

/** The repo-relative path an aliased specifier names (no extension added), or null. */
export function aliasTarget(spec) {
  if (typeof spec !== "string") return null;
  for (const [prefix, dir] of MODULE_ALIASES) {
    if (spec.startsWith(prefix)) return dir + spec.slice(prefix.length);
  }
  return null;
}

/** True when the specifier is one of this repo's own aliases (not a package, not relative). */
export function isAliasSpecifier(spec) {
  return aliasTarget(spec) !== null;
}

/** A regex source alternation matching any alias prefix, for import-extraction regexes. */
export const ALIAS_PREFIX_PATTERN = MODULE_ALIASES.map(([prefix]) =>
  prefix.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"),
).join("|");

/** The roots that exist under `repoRoot` (default: every source root), in the given order. */
export function existingRoots(repoRoot, roots = SOURCE_ROOTS) {
  return roots.filter((root) => existsSync(join(repoRoot, root)));
}

/** The feature roots that exist under `repoRoot`: `["features"]` today. */
export function featureRoots(repoRoot) {
  return existingRoots(repoRoot, FEATURE_ROOTS);
}

/**
 * Split a repo-relative path into the feature root it sits under and the rest:
 * `features/hr/routes.ts` → `{ root: "features", rest: "hr/routes.ts" }`. Null when it sits
 * under no feature root.
 */
export function featureRootOf(rel) {
  const posix = String(rel).replace(/\\/g, "/").replace(/^\.\//, "");
  for (const root of FEATURE_ROOTS) {
    if (posix.startsWith(`${root}/`)) return { root, rest: posix.slice(root.length + 1) };
  }
  return null;
}

/**
 * True when a path (absolute or repo-relative) lies under `<feature root>/<sub>` for ANY
 * feature root — e.g. `isUnderFeature(file, "agents/deletion")`.
 */
export function isUnderFeature(file, sub) {
  const posix = String(file).replace(/\\/g, "/");
  return FEATURE_ROOTS.some((root) => {
    const needle = `${root}/${sub.replace(/^\/+|\/+$/g, "")}`;
    return posix === needle || posix.startsWith(`${needle}/`) || posix.includes(`/${needle}/`) || posix.endsWith(`/${needle}`);
  });
}
