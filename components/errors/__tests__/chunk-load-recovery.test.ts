import {
  hasStaleChunkSignature,
  isChunkLoadError,
} from "@/components/errors/chunk-load-recovery";

describe("stale-graph detection", () => {
  it("recognises Turbopack's module-factory wording", () => {
    // Seen in production 2026-08-22 on /work/conversations/[id] back-nav; it
    // reached the raw error boundary because no pattern matched it.
    const message =
      "Module 7163177 was instantiated because it was required from module 5477232, but the module factory is not available.";
    expect(hasStaleChunkSignature(message)).toBe(true);
    expect(isChunkLoadError(new Error(message))).toBe(true);
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
