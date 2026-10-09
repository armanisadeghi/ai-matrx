/**
 * The App Router's directory tree, without reading the disk in production.
 *
 * THE TRACE LAW (2026-10-09): `readdir(join(process.cwd(), "app", …))` at request time makes
 * Turbopack's file tracing ship that whole source folder inside the route's server function.
 * The admin layout shipped all 573 admin source files in each of 275 admin functions, and
 * /data/try-everything shipped 3,451 files of app/. Production now reads
 * `app-tree.generated.json`, written by `scripts/generate-manifest.ts` at the start of every
 * build; dev reads the disk so a new page shows up at once. Build every route-folder path
 * with {@link appDir} — its root is marked `turbopackIgnore`, so nothing is traced.
 * Guard: scripts/check-server-trace-scope.mjs (runs after every build).
 */
import { readdirSync } from "fs";
import { readdir } from "fs/promises";
import { join, relative, sep } from "path";

import GENERATED from "./app-tree.generated.json";

/** A directory: child directories are objects, page files are `1`. */
export type AppTree = { [name: string]: AppTree | 1 };

const PAGE_FILE = /^page(\.(tsx|ts|jsx|js|mdx)|\.dev\.(tsx|ts|jsx|js|mdx))$/;

/** Absolute path of a folder under app/, never traced into a server function. */
export function appDir(...segments: string[]): string {
  return join(/* turbopackIgnore: true */ process.cwd(), "app", ...segments);
}

export interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

function fromTree(dir: string): DirEntry[] | undefined {
  const rel = relative(appDir(), dir);
  if (rel.startsWith("..")) return undefined;
  let node: AppTree | 1 | undefined = GENERATED as AppTree;
  for (const part of rel ? rel.split(sep) : []) {
    node = node === 1 ? undefined : node[part];
    if (!node) return [];
  }
  if (node === 1) return [];
  return Object.entries(node).map(([name, child]) => ({ name, isDirectory: () => child !== 1 }));
}

const useTree = () => process.env.NODE_ENV === "production" && !process.env.MATRX_ROUTE_TREE_FROM_DISK;

/** List a folder under app/ (production: the build-time tree; dev and scripts: the disk). */
export async function listAppDir(dir: string): Promise<DirEntry[]> {
  if (useTree()) {
    const entries = fromTree(dir);
    if (entries) return entries;
  }
  return readdir(/* turbopackIgnore: true */ dir, { withFileTypes: true });
}

export function listAppDirSync(dir: string): DirEntry[] {
  if (useTree()) {
    const entries = fromTree(dir);
    if (entries) return entries;
  }
  return readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true });
}

/** Build the tree from disk (the generator; directories and page files only). */
export function buildAppTree(appRoot: string): AppTree {
  const tree: AppTree = {};
  for (const e of readdirSync(appRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) tree[e.name] = buildAppTree(join(appRoot, e.name));
    else if (PAGE_FILE.test(e.name)) tree[e.name] = 1;
  }
  return tree;
}
