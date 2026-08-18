import type { SeoPlanDraft } from "@/features/marketing/seo/plan/plan-model";

import { hasKeywordAssignment } from "./plan-assists-producer";
import type { RoutePlan, SitePlanIndex } from "./page-seo-plan";

function plan(overrides: Partial<SeoPlanDraft> = {}): RoutePlan {
  return {
    webPageId: "page-1",
    url: "https://example.com/page",
    routeKey: "/page",
    draft: {
      primaryKeywordId: null,
      secondaryKeywordIds: [],
      pageRole: "",
      supportsRoutes: [],
      reason: "",
      ...overrides,
    },
    primaryKeyword: overrides.primaryKeywordId
      ? { id: overrides.primaryKeywordId, phrase: "target phrase", intentClass: null }
      : null,
    secondaryKeywords: [],
    outboundLinks: [],
    metaTitle: "",
    metaDescription: "",
  };
}

function plans(entry: RoutePlan): SitePlanIndex {
  return new Map([[entry.routeKey, entry]]);
}

describe("hasKeywordAssignment", () => {
  const node = { route: "/page" };

  it("accepts a primary keyword or page role", () => {
    expect(
      hasKeywordAssignment(node, plans(plan({ primaryKeywordId: "keyword-1" }))),
    ).toBe(true);
    expect(hasKeywordAssignment(node, plans(plan({ pageRole: "supporting" })))).toBe(
      true,
    );
  });

  it("does not treat other strategist metadata as an assignment", () => {
    expect(
      hasKeywordAssignment(
        node,
        plans(
          plan({
            secondaryKeywordIds: ["secondary-1"],
            supportsRoutes: ["/money"],
            reason: "Feeds the money page",
          }),
        ),
      ),
    ).toBe(false);
  });

  it("treats an unloaded plan index as unknown, not a gap", () => {
    expect(hasKeywordAssignment(node, null)).toBe(true);
  });
});
