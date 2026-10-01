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
 * Plain CommonJS on purpose: `node scripts/*.mjs` (named ESM imports of CJS), `tsx scripts/*.ts`
 * and Jest suites (which load it untransformed — Jest cannot require an ESM `.mjs` repo file)
 * all import it. Types: `source-roots.d.cts`. Paths are repo-relative and POSIX.
 */
"use strict";
const { existsSync } = require("node:fs");
const { join } = require("node:path");

/** The chat workspace package's source directory (absent until the move lands). */
const CHAT_PACKAGE_SRC = "packages/chat/src";

/** Every directory that holds feature code. A scan of `features/` scans all of these. */
const FEATURE_ROOTS = Object.freeze(["features", CHAT_PACKAGE_SRC]);

/** The app's top-level source directories, the feature roots included. */
const SOURCE_ROOTS = Object.freeze([
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
const MODULE_ALIASES = Object.freeze([
  Object.freeze(["@/", ""]),
  Object.freeze(["@host/", ""]),
  Object.freeze(["@ai-matrx/chat/", `${CHAT_PACKAGE_SRC}/`]),
]);

/** The repo-relative path an aliased specifier names (no extension added), or null. */
function aliasTarget(spec) {
  if (typeof spec !== "string") return null;
  for (const [prefix, dir] of MODULE_ALIASES) {
    if (spec.startsWith(prefix)) return dir + spec.slice(prefix.length);
  }
  return null;
}

/** True when the specifier is one of this repo's own aliases (not a package, not relative). */
function isAliasSpecifier(spec) {
  return aliasTarget(spec) !== null;
}

/** A regex source alternation matching any alias prefix, for import-extraction regexes. */
const ALIAS_PREFIX_PATTERN = MODULE_ALIASES.map(([prefix]) =>
  prefix.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"),
).join("|");

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Regex source for "any feature root, then a slash" — today `(?:features|packages\/chat\/src)\/`.
 * Matches repo-relative paths under every feature root.
 */
const FEATURE_ROOT_PATTERN = `(?:${FEATURE_ROOTS.map(escapeRegExp).join("|")})\\/`;

/**
 * Regex source for every aliased spelling of an import that reaches feature code: each alias
 * prefix joined to each feature root it can address — today `@/features/`, `@/packages/chat/src/`,
 * `@host/features/`, `@host/packages/chat/src/` and `@ai-matrx/chat/`.
 */
const FEATURE_SPECIFIER_PATTERN = `(?:${MODULE_ALIASES.flatMap(([prefix, dir]) =>
  FEATURE_ROOTS.filter((root) => `${root}/`.startsWith(dir)).map((root) =>
    escapeRegExp(`${prefix}${`${root}/`.slice(dir.length)}`),
  ),
).join("|")})`;

/**
 * Widen a regex written against `features/` to every feature root, so a guard keeps matching
 * moved code. Write the literal exactly as before and wrap it:
 * `featureRegExp(/^features\/agents\//)` or `featureRegExp(/from "@\/features\/x"/)`.
 * Each `@\/features\/` in the source becomes FEATURE_SPECIFIER_PATTERN, each other standalone
 * `features\/` becomes FEATURE_ROOT_PATTERN (non-capturing, so group numbers are unchanged).
 * Flags are kept. While nothing lives under the package root and no import spells `@host/` or
 * `@ai-matrx/chat/`, the result matches exactly what the literal did.
 */
function featureRegExp(re) {
  const source = re.source.replace(/(?<![\w-])(@\\\/)?features\\\//g, (_match, at) =>
    at ? FEATURE_SPECIFIER_PATTERN : FEATURE_ROOT_PATTERN,
  );
  return new RegExp(source, re.flags);
}

/** The roots that exist under `repoRoot` (default: every source root), in the given order. */
function existingRoots(repoRoot, roots = SOURCE_ROOTS) {
  return roots.filter((root) => existsSync(join(repoRoot, root)));
}

/** The feature roots that exist under `repoRoot`: `["features"]` today. */
function featureRoots(repoRoot) {
  return existingRoots(repoRoot, FEATURE_ROOTS);
}

/**
 * Split a repo-relative path into the feature root it sits under and the rest:
 * `features/hr/routes.ts` → `{ root: "features", rest: "hr/routes.ts" }`. Null when it sits
 * under no feature root.
 */
function featureRootOf(rel) {
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
function isUnderFeature(file, sub) {
  const posix = String(file).replace(/\\/g, "/");
  return FEATURE_ROOTS.some((root) => {
    const needle = `${root}/${sub.replace(/^\/+|\/+$/g, "")}`;
    return posix === needle || posix.startsWith(`${needle}/`) || posix.includes(`/${needle}/`) || posix.endsWith(`/${needle}`);
  });
}

exports.CHAT_PACKAGE_SRC = CHAT_PACKAGE_SRC;
exports.FEATURE_ROOTS = FEATURE_ROOTS;
exports.SOURCE_ROOTS = SOURCE_ROOTS;
exports.MODULE_ALIASES = MODULE_ALIASES;
exports.ALIAS_PREFIX_PATTERN = ALIAS_PREFIX_PATTERN;
exports.FEATURE_ROOT_PATTERN = FEATURE_ROOT_PATTERN;
exports.FEATURE_SPECIFIER_PATTERN = FEATURE_SPECIFIER_PATTERN;
exports.featureRegExp = featureRegExp;
exports.aliasTarget = aliasTarget;
exports.isAliasSpecifier = isAliasSpecifier;
exports.existingRoots = existingRoots;
exports.featureRoots = featureRoots;
exports.featureRootOf = featureRootOf;
exports.isUnderFeature = isUnderFeature;
