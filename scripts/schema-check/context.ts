/**
 * Builds the ONE shared {@link Context} every check reads, and holds the check
 * registry. Walks the repo a single time; reference-scanning checks iterate
 * `ctx.codeFiles`, freshness checks read their generated artifact directly.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { classifyGenerated } from "./generated-files";
import { parseDbTypesSchemaList } from "./db-types-parse";
import { loadSnapshot } from "./snapshot";
import type { Check, CodeFile, Context, DeadRelation, Finding } from "./types";

const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql"]);
const SKIP_DIR = new Set([
  "node_modules",
  ".next",
  ".next-preview",
  ".git",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "migrations", // history — never code we repoint
  "docs", // prose; references there are illustrative
]);

function* walk(dir: string): Generator<string> {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!SKIP_DIR.has(name) && !name.startsWith(".")) yield* walk(full);
    } else if (SCAN_EXT.has(extname(name))) {
      yield full;
    }
  }
}

function readDeadRelations(root: string): DeadRelation[] {
  const p = join(root, "scripts/dead-relations.json");
  if (!existsSync(p)) return [];
  try {
    return (JSON.parse(readFileSync(p, "utf8")).relations ?? []) as DeadRelation[];
  } catch {
    return [];
  }
}

export function buildContext(root: string, warn: boolean): Context {
  const snapshot = loadSnapshot(root);

  const pkgPath = join(root, "package.json");
  const dbTypesSchemas = existsSync(pkgPath)
    ? parseDbTypesSchemaList(readFileSync(pkgPath, "utf8"))
    : new Set<string>();

  const deadRelations = readDeadRelations(root);
  const deadOldNames = new Set(deadRelations.map((d) => d.relation));

  // Read every first-party source file once. Generated artifacts are excluded
  // here (reference scanners don't want them, and they are large); freshness
  // checks read their artifact directly.
  const codeFiles: CodeFile[] = [];
  for (const abs of walk(root)) {
    const path = relative(root, abs).replace(/\\/g, "/");
    // scripts/ is dev tooling (incl. these guards) — full of example schema.table
    // strings and `.from()` patterns that are not product DB calls. Skip it.
    if (path.startsWith("scripts/")) continue;
    const generated = classifyGenerated(path);
    if (generated) continue;
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    codeFiles.push({ path, ext: extname(path), lines: content.split("\n"), generated: null });
  }

  return {
    root,
    snapshot,
    codeFiles,
    dbTypesSchemas,
    deadRelations,
    deadOldNames,
    warn,
  };
}

// ── check registry ──────────────────────────────────────────────────────────

const REGISTRY: Array<{ name: string; fn: Check }> = [];

/** Register a check. Call once at module load (checks self-register on import). */
export function registerCheck(name: string, fn: Check): void {
  if (REGISTRY.some((r) => r.name === name)) return;
  REGISTRY.push({ name, fn });
}

export function registeredChecks(): ReadonlyArray<{ name: string; fn: Check }> {
  return REGISTRY;
}

/** Small helper for checks: a comment on the line silences findings there. */
export function isIgnored(text: string): boolean {
  return /(?:\/\/|--|\/\*)\s*schema-check-ignore/.test(text);
}

/** Build a "path:line" location string. */
export function loc(file: CodeFile, lineIdx: number): string {
  return `${file.path}:${lineIdx + 1}`;
}

export type { Finding };
