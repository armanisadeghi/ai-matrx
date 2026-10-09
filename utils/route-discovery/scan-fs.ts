/**
 * Filesystem route scanner — safe for scripts, tests, and server components.
 *
 * Walks a Next.js App Router directory tree and returns route segment paths
 * (no leading slash, no basePath prefix). Skips `_`-prefixed private folders;
 * includes dynamic segments literally (`[id]`, `[...slug]`, `[[...path]]`).
 *
 * Do not import from client components — use `@/utils/route-discovery` (server-only barrel).
 */


import { join, relative, sep } from "path";

import { listAppDir, listAppDirSync } from "./app-tree";

const PAGE_FILE = /^page(\.(tsx|ts|jsx|js|mdx)|\.dev\.(tsx|ts|jsx|js|mdx))$/;

export function isPageFile(name: string): boolean {
  return PAGE_FILE.test(name);
}

function shouldSkipDir(name: string): boolean {
  return name.startsWith("_");
}

/**
 * Recursively scan `dir` for page files.
 *
 * @param dir Absolute path to the route tree root.
 * @param baseRoute Route segments accumulated so far (no leading slash).
 */
export async function scanRoutesFs(
  dir: string,
  baseRoute = "",
): Promise<string[]> {
  const routes: string[] = [];

  try {
    const entries = await listAppDir(dir);

    for (const entry of entries) {
      if (shouldSkipDir(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      const routePath = baseRoute ? `${baseRoute}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        routes.push(...(await scanRoutesFs(fullPath, routePath)));
      } else if (isPageFile(entry.name) && baseRoute) {
        routes.push(baseRoute);
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return routes;
    console.error(`[route-discovery] Error reading directory ${dir}:`, error);
  }

  return routes;
}

/** Sync variant — used by validation scripts for cross-checks. */
export function scanRoutesFsSync(dir: string, baseRoute = ""): string[] {
  const routes: string[] = [];

  let entries;
  try {
    entries = listAppDirSync(dir);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return routes;
    throw error;
  }

  for (const entry of entries) {
    if (shouldSkipDir(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    const routePath = baseRoute ? `${baseRoute}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      routes.push(...scanRoutesFsSync(fullPath, routePath));
    } else if (isPageFile(entry.name) && baseRoute) {
      routes.push(baseRoute);
    }
  }

  return routes;
}

/**
 * Independent cross-check: walk every page file under `dir` and derive routes
 * from relative directory paths. Should match {@link scanRoutesFsSync} exactly;
 * any delta indicates a scanner bug.
 */
export function discoverRoutesFromPageFiles(dir: string): string[] {
  const routes: string[] = [];

  function walk(current: string) {
    let entries;
    try {
      entries = listAppDirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (shouldSkipDir(entry.name)) continue;

      const fullPath = join(current, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (isPageFile(entry.name)) {
        const relDir = relative(dir, current);
        if (relDir && relDir !== ".") {
          routes.push(relDir.split(sep).join("/"));
        }
      }
    }
  }

  walk(dir);
  return [...new Set(routes)].sort();
}
