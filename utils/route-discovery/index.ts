import "server-only";

import { readdir } from "fs/promises";
import { join } from "path";

export { groupRoutes, toModulePages, sortGroupKeys } from "./shared";

export async function scanRoutes(
  dir: string,
  baseRoute: string = "",
): Promise<string[]> {
  const routes: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith("_") || entry.name.startsWith("[")) continue;

      const fullPath = join(dir, entry.name);
      const routePath = baseRoute ? `${baseRoute}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const subRoutes = await scanRoutes(fullPath, routePath);
        routes.push(...subRoutes);
      } else if (
        (entry.name === "page.tsx" ||
          entry.name === "page.ts" ||
          entry.name === "page.dev.tsx" ||
          entry.name === "page.dev.ts") &&
        baseRoute
      ) {
        routes.push(baseRoute);
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // Missing directory (e.g. stale RouteIndexPage path after a route move)
    if (err.code === "ENOENT") {
      return routes;
    }
    console.error(`[route-discovery] Error reading directory ${dir}:`, error);
  }

  return routes;
}

export async function scanRoutesShallow(dir: string): Promise<string[]> {
  const routes: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith("_") ||
        entry.name.startsWith("[")
      )
        continue;

      const subDir = join(dir, entry.name);
      try {
        const subEntries = await readdir(subDir);
        if (
          subEntries.includes("page.tsx") ||
          subEntries.includes("page.ts") ||
          subEntries.includes("page.dev.tsx") ||
          subEntries.includes("page.dev.ts")
        ) {
          routes.push(entry.name);
        }
      } catch {
        // skip unreadable subdirs
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return routes.sort();
    }
    console.error(`[route-discovery] Error reading directory ${dir}:`, error);
  }

  return routes.sort();
}
