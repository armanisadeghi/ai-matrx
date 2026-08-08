import { describe, expect, it } from "vitest";

import {
  HTML_CONTENT_TYPE,
  PAGE_CONTENT_TYPE_OR_FILTER,
  isPageContentType,
  isResourceContentType,
} from "./page-content-class";

describe("page content classification", () => {
  it("treats not-yet-crawled rows as pages, never as resources", () => {
    // 8.5k live rows carry NULL here (sitemap/GSC-declared, never fetched).
    // Classifying them as assets would hide most of the registry.
    expect(isResourceContentType(null)).toBe(false);
    expect(isResourceContentType(undefined)).toBe(false);
    expect(isPageContentType(null)).toBe(true);
  });

  it("treats html as a page", () => {
    expect(isResourceContentType(HTML_CONTENT_TYPE)).toBe(false);
    expect(isPageContentType("html")).toBe(true);
  });

  it.each(["image", "json", "xml", "pdf", "txt", "md", "other"])(
    "treats %s as a resource",
    (contentType) => {
      expect(isResourceContentType(contentType)).toBe(true);
      expect(isPageContentType(contentType)).toBe(false);
    },
  );

  it("keeps the PostgREST filter in step with the predicate", () => {
    expect(PAGE_CONTENT_TYPE_OR_FILTER).toBe(
      "content_type_last.is.null,content_type_last.eq.html",
    );
  });
});
