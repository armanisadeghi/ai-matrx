/**
 * THE PUBLIC SURFACE of @ai-matrx/chat — the one list every other piece reads.
 *
 * Read by: tsup.config.ts (what is built), scripts/finish-build.mjs (the
 * published export map), scripts/verify-tarball.mjs (what the canary imports),
 * and matrx-frontend's scripts/check-chat-public-subpaths.mjs (what the app may
 * import). Change it here and all four move together.
 *
 * Shape (P26, PACKAGE-INDEPENDENCE §5): one subpath PATTERN per module domain,
 * resolving one specifier to exactly one built module —
 *
 *     @ai-matrx/chat/<domain>/<path/to/module>   ->  dist/<domain>/<path>.js (+ .d.ts)
 *
 * plus the two named host entries. Why patterns over barrels: ≈640 modules
 * carry their own "use client" and the app holds ≈60 `next/dynamic` doors and
 * ≈610 `jest.mock` sites keyed to single modules. A barrel would merge client
 * and pure modules, collapse every lazy door into one chunk, and turn each
 * module mock into a whole-domain mock. A pattern keeps the module the unit.
 *
 * NOT public, ever: `src/` itself, a directory specifier (name the module or its
 * `/index`), any test/fixture/doc file, any file extension in the specifier.
 */

/** Every top-level module domain under src/ — each one is a public pattern. */
export const PUBLIC_DOMAINS = [
  "action-requests",
  "agent-copy",
  "agents",
  "canvas",
  "compute",
  "context",
  "context-menu",
  "conversation",
  "cx-chat",
  "cx-conversation",
  "host",
  "mandates",
  "next",
  "public-chat",
  "quick-actions",
  "store",
  "surfaces",
  "testing",
  "tool-call-visualization",
  "ui",
  "utils",
  "voice-agent",
  "window-panels",
];

/**
 * `testing` is public for TESTS only: the fake db, the server/test hosts, render helpers and
 * captured run fixtures a consumer's suites drive the package with. A runtime importer is
 * refused by matrx-frontend's check:chat-public-subpaths (TEST_PATH).
 */
export const TEST_ONLY_DOMAINS = ["testing"];

/** Named entries: subpath -> source module (without extension). */
export const NAMED_ENTRIES = {
  "./host": "host/index",
  "./host/react": "host/react",
};

/** A source path (relative to src/) that never ships. */
export const NON_PUBLIC_SEGMENT =
  /(^|\/)(__tests__|__mocks__|__fixtures__|fixtures|test-utils)(\/|$)|\.(test|spec|stories)\.[cm]?[jt]sx?$|\.d\.ts$/;

/** Globs (relative to the package) that tsup builds. */
export const PUBLIC_SOURCE_GLOBS = [
  ...PUBLIC_DOMAINS.flatMap((d) => [`src/${d}/**/*.ts`, `src/${d}/**/*.tsx`]),
  "!src/**/__tests__/**",
  "!src/**/__mocks__/**",
  "!src/**/__fixtures__/**",
  "!src/**/fixtures/**",
  "!src/**/test-utils/**",
  "!src/**/*.test.*",
  "!src/**/*.spec.*",
  "!src/**/*.stories.*",
  "!src/**/*.d.ts",
];

/** The published `exports` map (dist targets). */
export function publishedExports() {
  const map = {};
  for (const [subpath, mod] of Object.entries(NAMED_ENTRIES)) {
    map[subpath] = { types: `./dist/${mod}.d.ts`, import: `./dist/${mod}.js` };
  }
  for (const d of PUBLIC_DOMAINS) {
    map[`./${d}/*`] = { types: `./dist/${d}/*.d.ts`, import: `./dist/${d}/*.js` };
  }
  map["./package.json"] = "./package.json";
  return map;
}

/** The in-repo `exports` map (source targets, used by the workspace). */
export function sourceExports() {
  const map = {
    "./host": "./src/host/index.ts",
    "./host/react": "./src/host/react.tsx",
  };
  for (const d of PUBLIC_DOMAINS) map[`./${d}/*`] = `./src/${d}/*`;
  return map;
}
