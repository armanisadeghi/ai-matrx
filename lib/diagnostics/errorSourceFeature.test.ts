import {
  sourceFeatureForRoute,
  UNMAPPED_CLIENT_SOURCE_FEATURE,
} from "@/lib/diagnostics/errorSourceFeature";
import { isSourceFeature } from "@/types/python-generated/source-attribution";

describe("sourceFeatureForRoute", () => {
  it("names the feature for a mapped surface", () => {
    expect(sourceFeatureForRoute("/cms/sites/abc")).toBe("cms");
    expect(sourceFeatureForRoute("/chat")).toBe("chat");
    expect(sourceFeatureForRoute("/administration/errors")).toBe("admin");
  });

  it("separates the education products instead of folding them together", () => {
    expect(sourceFeatureForRoute("/education/fastfire/run")).toBe(
      "education-fastfire",
    );
    expect(sourceFeatureForRoute("/education/tutor")).toBe("education-tutor");
    // A sibling nobody mapped must NOT borrow another education product's slug.
    expect(sourceFeatureForRoute("/education/some-new-thing")).toBe(
      UNMAPPED_CLIENT_SOURCE_FEATURE,
    );
  });

  it("reads a pathname, a query string and a full URL the same way", () => {
    expect(sourceFeatureForRoute("/notes?id=1")).toBe("notes");
    expect(sourceFeatureForRoute("https://app.example.com/notes/7#top")).toBe(
      "notes",
    );
    expect(sourceFeatureForRoute("/Notes")).toBe("notes");
  });

  it("calls the app root what it is: platform chrome", () => {
    expect(sourceFeatureForRoute("/")).toBe("system");
  });

  it("is LOUD, not silent, about a route it cannot map", () => {
    expect(sourceFeatureForRoute("/some-brand-new-surface")).toBe(
      UNMAPPED_CLIENT_SOURCE_FEATURE,
    );
    expect(sourceFeatureForRoute(null)).toBe(UNMAPPED_CLIENT_SOURCE_FEATURE);
    expect(sourceFeatureForRoute("")).toBe(UNMAPPED_CLIENT_SOURCE_FEATURE);
  });

  it("never returns a slug the platform registry does not hold", () => {
    const routes = [
      "/",
      "/chat",
      "/cms",
      "/education/flashcards",
      "/agents/1/run",
      "/data-tables",
      "/nothing-like-this",
      "",
    ];
    for (const route of routes) {
      expect(isSourceFeature(sourceFeatureForRoute(route))).toBe(true);
    }
  });
});
