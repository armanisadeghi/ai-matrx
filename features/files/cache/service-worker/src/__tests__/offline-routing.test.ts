import {
  isImmutableAssetRequest,
  isStudyNavigationRequest,
} from "../offline-routing";

const ORIGIN = "https://aimatrx.com";

describe("service-worker offline routing", () => {
  describe("study navigations", () => {
    it("claims a top-level navigation into the education surface", () => {
      expect(
        isStudyNavigationRequest("GET", "navigate", ORIGIN, "/education", ORIGIN),
      ).toBe(true);
      expect(
        isStudyNavigationRequest(
          "GET",
          "navigate",
          ORIGIN,
          "/education/flashcards/abc",
          ORIGIN,
        ),
      ).toBe(true);
    });

    it("NEVER claims a sub-resource request", () => {
      // This is the regression that ate next/dynamic chunk loads before: a
      // worker answering non-navigations can hand HTML to a script tag.
      for (const mode of ["cors", "no-cors", "same-origin", "script"]) {
        expect(
          isStudyNavigationRequest(
            "GET",
            mode,
            ORIGIN,
            "/education/flashcards",
            ORIGIN,
          ),
        ).toBe(false);
      }
    });

    it("ignores other origins, other methods, and other routes", () => {
      expect(
        isStudyNavigationRequest(
          "GET",
          "navigate",
          "https://evil.example",
          "/education",
          ORIGIN,
        ),
      ).toBe(false);
      expect(
        isStudyNavigationRequest("POST", "navigate", ORIGIN, "/education", ORIGIN),
      ).toBe(false);
      expect(
        isStudyNavigationRequest("GET", "navigate", ORIGIN, "/chat", ORIGIN),
      ).toBe(false);
    });

    it("does not claim a route that merely starts with the same letters", () => {
      // "/educationalists" is not the education surface.
      expect(
        isStudyNavigationRequest(
          "GET",
          "navigate",
          ORIGIN,
          "/educationalists",
          ORIGIN,
        ),
      ).toBe(false);
    });
  });

  describe("immutable assets", () => {
    it("claims content-hashed build output", () => {
      expect(
        isImmutableAssetRequest(
          "GET",
          ORIGIN,
          "/_next/static/chunks/main-abc12345.js",
          ORIGIN,
        ),
      ).toBe(true);
    });

    it("does NOT claim non-hashed /_next paths where a stale hit is a bug", () => {
      for (const path of [
        "/_next/data/build/page.json",
        "/_next/image",
        "/_next/webpack-hmr",
      ]) {
        expect(isImmutableAssetRequest("GET", ORIGIN, path, ORIGIN)).toBe(false);
      }
    });

    // Regression pin (adversarial review, 2026-08-17): the original rule
    // matched the /_next/static/ PREFIX, which in development is full of
    // unhashed filenames — and the worker is registerable in dev. Cache-first
    // there served stale JS forever after every edit.
    it("does NOT claim DEV filenames under /_next/static/ that carry no hash", () => {
      for (const path of [
        "/_next/static/chunks/app/layout.js",
        "/_next/static/chunks/main-app.js",
        "/_next/static/development/_buildManifest.js",
        "/_next/static/development/_ssgManifest.js",
        "/_next/static/css/app.css",
      ]) {
        expect(isImmutableAssetRequest("GET", ORIGIN, path, ORIGIN)).toBe(false);
      }
    });

    it("claims production filenames that DO carry a content hash", () => {
      for (const path of [
        "/_next/static/chunks/main-app-1a2b3c4d5e.js",
        "/_next/static/chunks/4bd1b696-9f7a2c3d4e5f6a7b.js",
        "/_next/static/css/a1b2c3d4e5f6.css",
        "/_next/static/media/logo.9f8e7d6c.svg",
      ]) {
        expect(isImmutableAssetRequest("GET", ORIGIN, path, ORIGIN)).toBe(true);
      }
    });

    it("ignores cross-origin and non-GET", () => {
      expect(
        isImmutableAssetRequest(
          "GET",
          "https://cdn.example",
          "/_next/static/chunks/a.js",
          ORIGIN,
        ),
      ).toBe(false);
      expect(
        isImmutableAssetRequest(
          "POST",
          ORIGIN,
          "/_next/static/chunks/a.js",
          ORIGIN,
        ),
      ).toBe(false);
    });
  });
});
