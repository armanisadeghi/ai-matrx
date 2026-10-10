/**
 * W-51 — A MANIFEST NEVER DROPS ON ITS WAY TO THE PACKAGE (P19, CPM-009a).
 *
 * The release sync mirrors the registered manifests to `ui.ui_surface_*` and
 * ARCHIVES every mirror row the code no longer declares. Since P19 the chat
 * package reads manifests only through its registration seam
 * (`@ai-matrx/chat/surfaces/runtime/registry`), filled at startup by
 * `providers/chat-surface-manifests.ts`. A manifest file left out of the
 * registry, or a registration that stops being mounted, loses that surface's
 * page values, client tools and write targets for every agent — and, on the
 * next release, its rows.
 *
 * Break it names:
 *   - a `*.manifest.ts` export no longer in RAW_MANIFESTS → "every manifest
 *     file's surface is registered" red, naming the file and surface;
 *   - the startup module registers a different or partial lookup → "the
 *     package sees exactly the app registry" red;
 *   - `app/Providers.tsx` stops mounting the registration → "mounted once at
 *     startup" red.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The app's manifests, and the chat package's own (moved there in P19) —
// the app registry must register every one of both.
const MANIFEST_DIRS = [
  path.resolve(__dirname, ".."),
  path.resolve(__dirname, "../../../../node_modules/@ai-matrx/chat/dist/surfaces/manifests"),
];

type ManifestLike = { surfaceName: string; values: unknown[] };

function isManifest(value: unknown): value is ManifestLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { surfaceName?: unknown }).surfaceName === "string" &&
    Array.isArray((value as { values?: unknown }).values)
  );
}

function declaredInFiles(): Array<{ file: string; surfaceName: string }> {
  const out: Array<{ file: string; surfaceName: string }> = [];
  for (const dir of MANIFEST_DIRS) {
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".manifest.ts") || f.endsWith(".manifest.js"))) {
      const file = path.relative(path.resolve(__dirname, "../../../.."), path.join(dir, name));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path.join(dir, name)) as Record<string, unknown>;
      for (const value of Object.values(mod)) {
        if (isManifest(value)) out.push({ file, surfaceName: value.surfaceName });
      }
    }
  }
  return out;
}

describe("W-51: every manifest reaches the chat package", () => {
  beforeAll(() => {
    // The real startup registration, exactly as app/Providers.tsx runs it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/providers/chat-surface-manifests");
  });

  it("every manifest file's surface is registered and readable through the package seam", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seam = require("@ai-matrx/chat/surfaces/runtime/registry") as typeof import("@ai-matrx/chat/surfaces/runtime/registry");
    const declared = declaredInFiles();
    expect(declared.length).toBeGreaterThan(200);
    // the package's own manifests are part of the census, not skipped
    expect(declared.filter(({ file }) => file.startsWith("node_modules/@ai-matrx/chat/")).length).toBeGreaterThanOrEqual(10);
    const missing = declared
      .filter(({ surfaceName }) => !seam.getManifest(surfaceName))
      .map(({ file, surfaceName }) => `${file}: ${surfaceName}`);
    expect(missing).toEqual([]);
  });

  it("the package sees exactly the app registry — no surface dropped or added on the way", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seam = require("@ai-matrx/chat/surfaces/runtime/registry") as typeof import("@ai-matrx/chat/surfaces/runtime/registry");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const app = require("@/features/surfaces/manifests/registry") as typeof import("@/features/surfaces/manifests/registry");
    expect(seam.hasRegisteredSurfaceManifests()).toBe(true);
    const fromPackage = seam.getAllManifests().map((m) => m.surfaceName);
    expect(fromPackage).toEqual(app.getRegisteredSurfaceNames());
    for (const name of fromPackage) {
      const resolved = app.getManifest(name);
      expect(seam.getManifest(name)).toEqual(seam.toSurfaceIndexEntry(resolved!, app.getRawManifest(name)));
      // Step 2: the body resolves from its own file + parent chain — equal, not the same object.
      expect(await seam.loadSurfaceBody(name)).toEqual(resolved);
      expect(seam.getSurfaceAncestry(name)).toEqual(app.getSurfaceAncestry(name));
      expect(seam.getSurfaceChildren(name)).toEqual(app.getSurfaceChildren(name));
    }
  });

  it("the registration is mounted once at startup, on the server and in the browser", () => {
    const providers = readFileSync(path.resolve(__dirname, "../../../../app/Providers.tsx"), "utf8");
    expect(providers).toMatch(/^import "@\/providers\/chat-surface-manifests";$/m);
    expect(providers.match(/<ChatSurfaceRegistrations \/>/g)).toHaveLength(1);
    const browser = readFileSync(
      path.resolve(__dirname, "../../../../providers/ChatSurfaceRegistrations.tsx"),
      "utf8",
    );
    expect(browser).toMatch(/^import "@\/providers\/chat-surface-manifests";$/m);
  });
});
