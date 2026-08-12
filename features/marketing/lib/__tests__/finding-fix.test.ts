/**
 * THE VERIFICATION RULE, proven: the code pipe never emits a draft that the
 * audit check would fail on the next run, and it declines (null) rather than
 * guess whenever the fix is a judgement call.
 */

import {
  DESCRIPTION_LIMITS,
  TITLE_LIMITS,
  evaluateMetaDescription,
  evaluateMetaTitle,
} from "@/features/marketing/seo/serp/metrics";
import {
  DETERMINISTIC_FIX_KEYS,
  planDeterministicFix,
  type FindingFixEvidence,
} from "@/features/marketing/lib/finding-fix";

const LONG_TITLE =
  "Commercial Electronics Recycling and IT Asset Disposition Services for Enterprises Across California | All Green Recycling";

const LONG_DESCRIPTION =
  "We collect, transport and process end-of-life electronics for enterprises across California. Every asset is tracked from pickup to final disposition. Certified data destruction is included on every engagement. Reporting is delivered within ten business days of collection.";

function evidence(patch: Partial<FindingFixEvidence>): FindingFixEvidence {
  return { itemKey: "title_presence", ...patch };
}

describe("planDeterministicFix — titles", () => {
  it("writes a missing title from the page's own H1 and it passes the check", () => {
    const draft = planDeterministicFix(
      evidence({
        itemKey: "title_presence",
        currentTitle: null,
        h1: "Electronics Recycling in Sacramento",
        brandName: "All Green",
      }),
    );
    expect(draft).not.toBeNull();
    expect(draft?.metaTitle).toBeTruthy();
    expect(evaluateMetaTitle(draft!.metaTitle!).ok).toBe(true);
    expect(draft?.metaTitle).toContain("Electronics Recycling in Sacramento");
    expect(draft?.metaDescription).toBeUndefined();
  });

  it("drops the trailing brand suffix to bring an over-long title inside the limit", () => {
    const draft = planDeterministicFix(
      evidence({ itemKey: "title_length", currentTitle: LONG_TITLE }),
    );
    expect(draft).not.toBeNull();
    expect(draft!.metaTitle!.length).toBeLessThanOrEqual(TITLE_LIMITS.maxChars);
    expect(evaluateMetaTitle(draft!.metaTitle!).ok).toBe(true);
    expect(draft!.metaTitle).not.toContain("All Green Recycling");
    // Never mid-word.
    expect(draft!.metaTitle).toBe(draft!.metaTitle!.trim());
    expect(LONG_TITLE.startsWith(draft!.metaTitle!)).toBe(true);
  });

  it("declines a title that is merely too SHORT — that is the AI pipe's job", () => {
    expect(
      planDeterministicFix(
        evidence({ itemKey: "title_length", currentTitle: "Home" }),
      ),
    ).toBeNull();
  });

  it("declines when the page has no title and nothing to derive one from", () => {
    expect(
      planDeterministicFix(
        evidence({ itemKey: "title_presence", currentTitle: null }),
      ),
    ).toBeNull();
  });
});

describe("planDeterministicFix — descriptions", () => {
  it("reuses the page's own social description when the meta description is missing", () => {
    const draft = planDeterministicFix(
      evidence({
        itemKey: "meta_description_presence",
        currentMetaDescription: null,
        ogDescription:
          "Certified electronics recycling and IT asset disposition for California businesses, with tracked pickup and audited data destruction.",
      }),
    );
    expect(draft).not.toBeNull();
    expect(evaluateMetaDescription(draft!.metaDescription!).ok).toBe(true);
    expect(draft!.metaDescription!.length).toBeGreaterThanOrEqual(
      DESCRIPTION_LIMITS.minChars,
    );
    expect(draft?.metaTitle).toBeUndefined();
  });

  it("cuts an over-long description at a sentence boundary", () => {
    const draft = planDeterministicFix(
      evidence({
        itemKey: "meta_description_length",
        currentMetaDescription: LONG_DESCRIPTION,
      }),
    );
    expect(draft).not.toBeNull();
    const value = draft!.metaDescription!;
    expect(evaluateMetaDescription(value).ok).toBe(true);
    expect(value.length).toBeLessThanOrEqual(DESCRIPTION_LIMITS.maxChars);
    expect(/[.!?]$/.test(value)).toBe(true);
    expect(LONG_DESCRIPTION.startsWith(value)).toBe(true);
  });

  it("declines a missing description with no already-authored copy to reuse", () => {
    expect(
      planDeterministicFix(
        evidence({
          itemKey: "meta_description_presence",
          currentMetaDescription: null,
        }),
      ),
    ).toBeNull();
  });

  it("declines a description that is too short", () => {
    expect(
      planDeterministicFix(
        evidence({
          itemKey: "meta_description_length",
          currentMetaDescription: "Recycling.",
        }),
      ),
    ).toBeNull();
  });
});

describe("planDeterministicFix — safety", () => {
  it("returns null for every item key outside the deterministic set", () => {
    for (const itemKey of [
      "thin_content",
      "image_alt_presence",
      "canonical_presence",
      "some_check_invented_next_year",
    ]) {
      expect(
        planDeterministicFix(
          evidence({ itemKey, currentTitle: null, h1: "A page heading" }),
        ),
      ).toBeNull();
    }
  });

  it("never proposes a change that already matches the page's authored intent", () => {
    const first = planDeterministicFix(
      evidence({
        itemKey: "title_presence",
        currentTitle: null,
        h1: "Electronics Recycling in Sacramento",
      }),
    );
    expect(first).not.toBeNull();
    const second = planDeterministicFix(
      evidence({
        itemKey: "title_presence",
        currentTitle: null,
        h1: "Electronics Recycling in Sacramento",
        desiredTitle: first!.metaTitle,
      }),
    );
    expect(second).toBeNull();
  });

  it("declares exactly the keys it can actually plan", () => {
    expect([...DETERMINISTIC_FIX_KEYS].sort()).toEqual([
      "meta_description_length",
      "meta_description_presence",
      "title_length",
      "title_presence",
    ]);
  });
});
