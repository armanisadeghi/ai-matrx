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
          "/_next/static/chunks/main-abc123.js",
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
