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
// Value-import of the TypeScript compiler into the Next app graph is forbidden
// (D103): it dragged ~10MB of tooling into every page-data worker and OOM'd
// production builds. Type-only imports (`import type …`) are fine.
const TYPESCRIPT_VALUE_IMPORT =
  /(?:^|\n)\s*import\s+(?!type\b)[^;]*\bfrom\s+["']typescript["']/;
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

const fsViolations = PRODUCT_ROOTS.flatMap((root) =>
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

const typescriptViolations = ["app", "components", "features"].flatMap((root) =>
  sourceFiles(join(ROOT, root)).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    if (!TYPESCRIPT_VALUE_IMPORT.test(source)) return [];
    return [relative(ROOT, path)];
  }),
);

if (fsViolations.length > 0 || typescriptViolations.length > 0) {
  const parts: string[] = [];
  if (fsViolations.length > 0) {
    parts.push(
      "TURBOPACK FILESYSTEM TRACE BOUNDARY MISSING",
      "",
      ...fsViolations.map((path) => `  - ${path}`),
      "",
      "Product runtime filesystem access must explicitly bound dynamic roots",
      "with /* turbopackIgnore: true */. See docs/BUILD-TIME-TURBOPACK.md.",
      "",
    );
  }
  if (typescriptViolations.length > 0) {
    parts.push(
      "TYPESCRIPT COMPILER VALUE-IMPORTED INTO THE APP GRAPH (D103)",
      "",
      ...typescriptViolations.map((path) => `  - ${path}`),
      "",
      "Do not import 'typescript' as a value from app/components/features.",
      "Use `pnpm capture-errors` (CLI) or `import type` only. See D103 /",
      "docs/BUILD-TIME-TURBOPACK.md.",
    );
  }
  console.error(parts.join("\n"));
  process.exit(1);
}

console.log(
  "check-turbopack-fs: OK — fs boundaries present; no typescript value imports in app graph.",
);
