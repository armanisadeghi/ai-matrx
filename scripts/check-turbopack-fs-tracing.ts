#!/usr/bin/env tsx
/**
 * Guard product runtime filesystem access from whole-repository Turbopack
 * tracing. A dynamic fs root without `turbopackIgnore` can make Next.js trace
 * tens of thousands of files into a server bundle and exhaust build memory.
 *
 * Test fixtures and CLI scripts are intentionally outside these product roots.
 * See docs/BUILD-TIME-TURBOPACK.md.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PRODUCT_ROOTS = ["app", "components", "features", "lib"] as const;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE =
  /(?:^|\/)(?:__tests__|__mocks__)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/;
const FS_IMPORT =
  /(?:from\s+["'](?:node:)?fs["']|import\s*\(\s*["'](?:node:)?fs["']\s*\))/;
const TRACE_BOUNDARY = /\/\*\s*turbopackIgnore:\s*true\s*\*\//;
const REVIEWED_STATIC_ROOTS = new Set([
  // Statically anchored under public/ before the dynamic subdirectory.
  "components/ssr/StaticFilesIndexPage.tsx",
]);

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const relPath = relative(ROOT, path);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (SOURCE_FILE.test(name) && !TEST_FILE.test(relPath)) {
      files.push(path);
    }
  }
  return files;
}

const violations = PRODUCT_ROOTS.flatMap((root) =>
  sourceFiles(join(ROOT, root)).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    const relPath = relative(ROOT, path);
    if (
      !FS_IMPORT.test(source) ||
      TRACE_BOUNDARY.test(source) ||
      REVIEWED_STATIC_ROOTS.has(relPath)
    ) {
      return [];
    }
    return [relPath];
  }),
);

if (violations.length > 0) {
  console.error(
    [
      "TURBOPACK FILESYSTEM TRACE BOUNDARY MISSING",
      "",
      ...violations.map((path) => `  - ${path}`),
      "",
      "Product runtime filesystem access must explicitly bound dynamic roots",
      "with /* turbopackIgnore: true */. See docs/BUILD-TIME-TURBOPACK.md.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  "check-turbopack-fs: OK — product runtime fs imports declare tracing boundaries.",
);
