import {
  hasChunkLoadErrorSignature,
  isChunkLoadError,
} from "@/components/errors/chunk-load-recovery";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("chunk-load failure detection", () => {
  it("does not invent deploy skew from Turbopack's runtime-integrity wording", () => {
    // Refresh can recover this error, but that does not prove a stale tab. It
    // also occurs on fresh document loads and must remain diagnostically loud.
    const message =
      "Module 7163177 was instantiated because it was required from module 5477232, but the module factory is not available.";
    expect(hasChunkLoadErrorSignature(message)).toBe(false);
    expect(isChunkLoadError(new Error(message))).toBe(false);

    const bootScriptSource = readFileSync(
      join(process.cwd(), "components/errors/ChunkRecoveryBootScript.tsx"),
      "utf8",
    );
    expect(bootScriptSource).not.toContain(
      "/module factory is not available/i.test(msg)",
    );
  });

  it("keeps reactive recovery UI free of unsupported deploy claims", () => {
    for (const relativePath of [
      "app/global-error.tsx",
      "components/errors/ErrorBoundaryView.tsx",
      "components/errors/NewVersionWatcher.tsx",
      "features/overlays/boundary/lazyOverlay.tsx",
      "features/overlays/boundary/OverlayErrorFallback.tsx",
      "features/overlays/boundary/overlayErrorReport.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source).not.toContain("This page is out of date");
      expect(source).not.toContain(
        "A new version of the app was deployed while this tab was open",
      );
      expect(source).not.toContain("usually a stale build");
      expect(source).not.toContain("This tab was likely open across a deploy");
      expect(source).not.toContain("stale build / cache / deploy skew");
      expect(source).not.toContain(
        "likely a stale build, cached chunk, or deployment skew",
      );
      expect(source).not.toContain("A stale tab requesting a chunk");
    }
  });

  it("still recognises the webpack-era chunk failures", () => {
    for (const message of [
      "ChunkLoadError: Loading chunk 4821 failed.",
      "Loading CSS chunk app-layout failed.",
      "Failed to fetch dynamically imported module: https://x/_next/static/chunk.js",
      "Importing a module script failed.",
    ]) {
      expect(isChunkLoadError(new Error(message))).toBe(true);
    }
  });

  it("matches on name alone for a bare ChunkLoadError", () => {
    const error = new Error("something opaque");
    error.name = "ChunkLoadError";
    expect(isChunkLoadError(error)).toBe(true);
  });

  it("does not claim ordinary application errors", () => {
    for (const message of [
      "Cannot read properties of undefined (reading 'id')",
      "Failed to fetch",
      "PGRST205: table not found",
    ]) {
      expect(isChunkLoadError(new Error(message))).toBe(false);
    }
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("a string")).toBe(false);
  });
});
