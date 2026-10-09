import "server-only";

import { join } from "path";
import { listAppDir } from "./app-tree";
import { isPageFile } from "./scan-fs";

export {
  scanRoutesFs as scanRoutes,
  scanRoutesFsSync as scanRoutesSync,
  discoverRoutesFromPageFiles,
  isPageFile,
} from "./scan-fs";

export { appDir, listAppDir } from "./app-tree";

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
    const entries = await listAppDir(dir);

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;

      const subDir = join(dir, entry.name);
      try {
        const subEntries = (await listAppDir(subDir)).map((e) => e.name);
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
