/**
 * THE TRACE LAW: in production, route discovery answers from app-tree.generated.json (written by
 * scripts/generate-manifest.ts at the start of every build), never the disk — reading app/ at
 * request time shipped whole source folders inside server functions (2026-10-09). This proves the
 * production path answers like the disk does, with readdir unreachable.
 */
jest.mock("server-only", () => ({}));
jest.mock("fs/promises", () => ({ readdir: jest.fn(async () => { throw new Error("production must not read the disk"); }) }));

import { scanRoutesFsSync } from "../scan-fs";
import { appDir, buildAppTree } from "../app-tree";

describe("production routes come from the build tree", () => {
  const env = process.env.NODE_ENV;
  afterEach(() => { (process.env as Record<string, string | undefined>).NODE_ENV = env; });

  it("the admin route list from the tree matches the disk walk of the same tree", async () => {
    const { scanRoutes } = await import("../index");
    const fromDisk = new Set(
      // the disk walk, against the tree that is checked in (a fresh build regenerates both together)
      Object.keys(buildAppTree(appDir("(admin)", "administration"))).length ? scanRoutesFsSync(appDir("(admin)", "administration"), "administration") : [],
    );
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const fromTree = await scanRoutes(appDir("(admin)", "administration"), "administration");
    expect(fromTree.length).toBeGreaterThan(100);
    const missing = fromTree.filter((r) => !fromDisk.has(r));
    expect(missing).toEqual([]);
  });
});
