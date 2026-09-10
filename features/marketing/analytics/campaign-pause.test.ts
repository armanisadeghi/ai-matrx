/*
  The GA4 collection campaign gate, as `syncSiteAnalytics` consumes it.

  This suite used to assert that a plain (non-super-admin) caller is REFUSED.
  That was true while `GOOGLE_ANALYTICS_CAMPAIGN_PHASE` was `"internal_test"`.
  On 2026-08-26 the phase was deliberately flipped to `"approved"` (commit
  62e10d8fd3, "Open approved Google Analytics and YouTube access"); its two
  sibling suites — `google/ga4-campaign.test.ts` and
  `google/youtube-campaign.test.ts` — were updated in that same commit and this
  one was missed. It has been red ever since, asserting a pause the product no
  longer has. The assertion was wrong, not the production code.

  What is actually worth guarding here is the WIRING, which is phase-independent
  and is what the live defect would be: `syncSiteAnalytics` must consult the gate
  BEFORE it dispatches anything, so a refusal can never reach Google. So the gate
  module is mocked to refuse, and the test proves nothing was dispatched. The
  second test pins the live phase's real behaviour: an approved phase gets
  through to the API and the result is surfaced honestly.
*/

import { callApi } from "@/lib/api/call-api";
import type { ApiCallResult } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { syncSiteAnalytics } from "@/features/marketing/analytics/data";
import {
  GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON,
  assertGoogleAnalyticsCampaignActive,
} from "@/features/marketing/google/ga4-campaign";

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn((config: unknown) => config),
}));

jest.mock("@/features/marketing/google/ga4-campaign", () => {
  const actual = jest.requireActual("@/features/marketing/google/ga4-campaign");
  return {
    ...actual,
    assertGoogleAnalyticsCampaignActive: jest.fn(),
  };
});

const assertGate = assertGoogleAnalyticsCampaignActive as jest.MockedFunction<
  typeof assertGoogleAnalyticsCampaignActive
>;

const ORG_ID = "11111111-1111-4111-8111-111111111111";

/**
 * The real `dispatch(callApi(...))` always resolves an `ApiCallResult`; the thunk
 * has no path that resolves undefined. A mock that returns undefined is an
 * incomplete mock, not a production tolerance to add — `response?.error` would
 * turn a genuinely broken result into a silent success.
 */
function dispatchReturning(result: ApiCallResult<unknown>) {
  return jest.fn().mockResolvedValue(result) as unknown as AppDispatch;
}

describe("GA4 collection campaign pause", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assertGate.mockImplementation(() => undefined);
  });

  it("refuses a paused caller before anything is dispatched", async () => {
    assertGate.mockImplementation(() => {
      throw new Error(GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON);
    });
    const dispatch = dispatchReturning({} as ApiCallResult<unknown>);

    await expect(
      syncSiteAnalytics(dispatch, "site-1", ORG_ID),
    ).rejects.toThrow(GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON);

    expect(dispatch).not.toHaveBeenCalled();
    expect(callApi).not.toHaveBeenCalled();
  });

  it("dispatches the sync once the campaign gate admits the caller", async () => {
    const dispatch = dispatchReturning({
      success: true,
    } as unknown as ApiCallResult<unknown>);

    await expect(
      syncSiteAnalytics(dispatch, "site-1", ORG_ID),
    ).resolves.toEqual({ runId: null });

    expect(assertGate).toHaveBeenCalledWith(false);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(
      (callApi as jest.Mock).mock.calls[0][0],
    ).toMatchObject({
      path: "/seo/sites/{site_id}/analytics/sync",
      method: "POST",
      pathParams: { site_id: "site-1" },
      scopeOverrides: { organization_id: ORG_ID },
    });
  });

  it("surfaces an API error instead of reporting a successful sync", async () => {
    const dispatch = dispatchReturning({
      error: { type: "http_error", message: "GA4 property is not linked." },
    } as unknown as ApiCallResult<unknown>);

    await expect(
      syncSiteAnalytics(dispatch, "site-1", ORG_ID),
    ).rejects.toThrow("GA4 property is not linked.");
  });

  it("keeps the live phase honest: an unmocked gate admits a normal caller", () => {
    const real = jest.requireActual(
      "@/features/marketing/google/ga4-campaign",
    ) as typeof import("@/features/marketing/google/ga4-campaign");
    expect(() => real.assertGoogleAnalyticsCampaignActive(false)).not.toThrow();
  });
});
