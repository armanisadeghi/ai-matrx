jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import { fillUrlFor, PLATFORM_SCOPE_FILL_URL, type NotReadyVerdict } from "./automationReadiness";

const verdict = (scope_key: string, fill_url: string): NotReadyVerdict => ({
  organization_id: "org",
  mandate_key: "seo.keyword_classifier",
  scope_key,
  summary: "Not ready: missing Business guidelines for the site",
  checked_at: "2026-10-09T00:00:00Z",
  missing: [{ key: "site_guidelines", label: "Business guidelines for the site", fill_url }],
});

describe("Not ready flag opens the fill page", () => {
  it("keeps a subject's own fill page", () => {
    const v = verdict("site:s1", "/marketing/b1/identity/guidelines");
    expect(fillUrlFor(v, v.missing[0])).toBe("/marketing/b1/identity/guidelines");
  });

  it("maps a platform-wide refusal to a specific page, never the generic /marketing", () => {
    const v = verdict("platform", "/marketing");
    expect(fillUrlFor(v, v.missing[0])).toBe(PLATFORM_SCOPE_FILL_URL);
  });
});
