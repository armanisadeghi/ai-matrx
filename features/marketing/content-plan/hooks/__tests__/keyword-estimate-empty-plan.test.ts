import { resolveEstimateFailure } from "../useSetupPasses";

/**
 * The keyword-strategy estimate endpoint answers 409 `content_plan_empty_plan`
 * BY DESIGN when a site has no planned pages. That precondition must resolve
 * to an empty estimate (the section then shows its "no planned pages yet"
 * guidance) — never surface as a thrown query error, which is what filled the
 * Error Inspector with red rows on every fresh site before 2026-08-26.
 */
describe("resolveEstimateFailure", () => {
  const SITE_ID = "05d822cd-02f1-4013-a506-9d89083683ba";

  it("resolves the designed empty-plan 409 to an empty estimate", () => {
    const estimate = resolveEstimateFailure(SITE_ID, {
      message:
        "This site has no planned pages yet — generate or build the plan first.",
      status: 409,
      serverDetail: {
        error: "content_plan_empty_plan",
        message:
          "This site has no planned pages yet — generate or build the plan first.",
        user_message:
          "This site has no planned pages yet — generate or build the plan first.",
        details: null,
        request_id: "a9c5f7b6fbec4b90a186b3dbb0b5e673",
      },
    });
    expect(estimate).toEqual({ site_id: SITE_ID, pages: 0, tiers: [] });
  });

  it("still throws a human-readable headline for any other failure", () => {
    expect(() =>
      resolveEstimateFailure(SITE_ID, {
        message: "HTTP 500",
        status: 500,
        serverDetail: {
          error: "internal_error",
          message: "estimate blew up",
        },
      }),
    ).toThrow(/estimate blew up/);
  });
});
