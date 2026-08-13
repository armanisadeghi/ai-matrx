/**
 * The `site_editor_draft` target stages authored copy into ONE row of a
 * portfolio that can hold dozens of client websites. The failures these tests
 * exist to prevent are landing the copy on the WRONG website, and letting a
 * JSON-shaped value through into a prose field.
 */

import {
  resolveSiteForWrite,
  SITE_DESCRIPTION_MAX,
  SITE_NAME_MAX,
  validateSiteEditorDraftWrite,
  type SiteWriteCandidate,
} from "@/features/marketing/lib/site-write-targets";

const CANDIDATES: SiteWriteCandidate[] = [
  { site_id: "site-1", name: "Acme Plumbing", domain: "acmeplumbing.com" },
  { site_id: "site-2", name: "Acme Roofing", domain: "acmeroofing.com" },
  { site_id: "site-3", name: "Northgate Dental", domain: "northgate.dev" },
];

describe("validateSiteEditorDraftWrite", () => {
  it("accepts a site selector plus either prose field", () => {
    expect(
      validateSiteEditorDraftWrite({
        site: " acmeplumbing.com ",
        description: "  Booking and service pages for the East Bay team.  ",
      }),
    ).toEqual({
      site: "acmeplumbing.com",
      patch: { description: "Booking and service pages for the East Bay team." },
    });
  });

  it("accepts both fields together", () => {
    const result = validateSiteEditorDraftWrite({
      site: "site-2",
      name: "Acme Roofing Co.",
      description: "Roofing marketing site.",
    });
    expect(result.patch).toEqual({
      name: "Acme Roofing Co.",
      description: "Roofing marketing site.",
    });
  });

  it("treats an empty description as a deliberate clear", () => {
    expect(
      validateSiteEditorDraftWrite({ site: "site-1", description: "" }).patch,
    ).toEqual({ description: "" });
  });

  it("refuses a value that is not an object", () => {
    expect(() => validateSiteEditorDraftWrite("acmeplumbing.com")).toThrow(
      /expects an object value/,
    );
    expect(() => validateSiteEditorDraftWrite(null)).toThrow(/received null/);
    expect(() => validateSiteEditorDraftWrite([])).toThrow(/received an array/);
  });

  it("refuses undeclared keys by name", () => {
    expect(() =>
      validateSiteEditorDraftWrite({
        site: "site-1",
        description: "x",
        root_url: "https://evil.example",
      }),
    ).toThrow(/does not accept "root_url"/);
    expect(() =>
      validateSiteEditorDraftWrite({ site: "site-1", status: "paused" }),
    ).toThrow(/does not accept "status"/);
  });

  it("names the JSON trap in the throw when prose arrives structured", () => {
    expect(() =>
      validateSiteEditorDraftWrite({
        site: "site-1",
        description: { text: "Booking pages" },
      }),
    ).toThrow(/plain text string, not JSON and not JSON-encoded/);
    expect(() =>
      validateSiteEditorDraftWrite({ site: "site-1", name: ["Acme"] }),
    ).toThrow(/received an array/);
  });

  it("requires a site selector", () => {
    expect(() =>
      validateSiteEditorDraftWrite({ site: "   ", description: "x" }),
    ).toThrow(/site is required/);
    expect(() => validateSiteEditorDraftWrite({ description: "x" })).toThrow(
      /plain text string/,
    );
  });

  it("requires at least one field to stage", () => {
    expect(() => validateSiteEditorDraftWrite({ site: "site-1" })).toThrow(
      /at least one of "name" or "description"/,
    );
  });

  it("refuses a blank name but allows omitting it", () => {
    expect(() =>
      validateSiteEditorDraftWrite({ site: "site-1", name: "  " }),
    ).toThrow(/name cannot be empty/);
  });

  it("enforces the advertised maximum lengths", () => {
    expect(() =>
      validateSiteEditorDraftWrite({
        site: "site-1",
        name: "a".repeat(SITE_NAME_MAX + 1),
      }),
    ).toThrow(new RegExp(`the maximum is ${SITE_NAME_MAX}`));
    expect(() =>
      validateSiteEditorDraftWrite({
        site: "site-1",
        description: "a".repeat(SITE_DESCRIPTION_MAX + 1),
      }),
    ).toThrow(new RegExp(`the maximum is ${SITE_DESCRIPTION_MAX}`));
  });
});

describe("resolveSiteForWrite", () => {
  it("resolves an exact site id", () => {
    expect(resolveSiteForWrite("site-3", CANDIDATES).domain).toBe(
      "northgate.dev",
    );
  });

  it("resolves a domain regardless of scheme, www, case, or trailing slash", () => {
    for (const selector of [
      "acmeplumbing.com",
      "ACMEPlumbing.com",
      "https://www.acmeplumbing.com/",
      "www.acmeplumbing.com",
    ]) {
      expect(resolveSiteForWrite(selector, CANDIDATES).site_id).toBe("site-1");
    }
  });

  it("resolves an exact name case-insensitively", () => {
    expect(resolveSiteForWrite("northgate dental", CANDIDATES).site_id).toBe(
      "site-3",
    );
  });

  it("resolves a unique partial", () => {
    expect(resolveSiteForWrite("roofing", CANDIDATES).site_id).toBe("site-2");
  });

  it("refuses an ambiguous partial and lists the matches", () => {
    expect(() => resolveSiteForWrite("acme", CANDIDATES)).toThrow(
      /matches more than one loaded website/,
    );
    expect(() => resolveSiteForWrite("acme", CANDIDATES)).toThrow(
      /acmeplumbing\.com/,
    );
  });

  it("refuses an unknown site and lists what IS loaded", () => {
    expect(() => resolveSiteForWrite("nope.example", CANDIDATES)).toThrow(
      /is not a managed website in the currently loaded sites list/,
    );
    expect(() => resolveSiteForWrite("nope.example", CANDIDATES)).toThrow(
      /northgate\.dev/,
    );
  });

  it("refuses when nothing is loaded", () => {
    expect(() => resolveSiteForWrite("acmeplumbing.com", [])).toThrow(
      /no managed websites are loaded/,
    );
  });
});
