import "server-only";

import { readdir } from "fs/promises";
import { join } from "path";
import { isPageFile } from "./scan-fs";

export {
  scanRoutesFs as scanRoutes,
  scanRoutesFsSync as scanRoutesSync,
  discoverRoutesFromPageFiles,
  isPageFile,
} from "./scan-fs";

export {
  groupRoutes,
  toModulePages,
  sortGroupKeys,
  getRouteLabel,
} from "./shared";

export {
  buildRouteSearchRows,
  filterRouteSearchRows,
  type RouteSearchRow,
} from "./filter-routes";

/** Shallow scan — one directory level only (immediate child folders with a page). */
export async function scanRoutesShallow(dir: string): Promise<string[]> {
  const routes: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;

      const subDir = join(dir, entry.name);
      try {
        const subEntries = await readdir(subDir);
        if (subEntries.some((name) => isPageFile(name))) {
          routes.push(entry.name);
        }
      } catch {
        // skip unreadable subdirs
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return routes.sort();
    console.error(`[route-discovery] Error reading directory ${dir}:`, error);
  }

  return routes.sort();
}
