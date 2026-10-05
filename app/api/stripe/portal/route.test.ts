/** @jest-environment node */
import { NextRequest } from "next/server";

const mockPersonal = jest.fn();
const mockOpenPortal = jest.fn();
const mockOwner = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({}),
}));
jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: mockPersonal }) }),
        }),
      }),
    }),
  }),
}));
jest.mock("@/lib/stripe/server", () => ({
  isStripeConfigured: () => true,
  requiredStripeMode: () => "test",
}));
jest.mock("@/utils/supabase/resolveUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "billing-admin-test" } } }),
}));
jest.mock("@/features/entitlements/stripe/portal", () => ({
  openSubscriptionPortal: mockOpenPortal,
}));
jest.mock("@/features/entitlements/stripe/billingOwner", () => ({
  billingOwnerRef: mockOwner,
}));

describe("personal billing portal targeting", () => {
  beforeEach(() => jest.clearAllMocks());
  it("never falls through to company billing when a personal customer is absent", async () => {
    mockPersonal.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Organization-Id": "company-in-navigation",
        },
        body: JSON.stringify({ scope: "personal" }),
      }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "No personal billing account",
    });
    expect(mockOwner).not.toHaveBeenCalled();
    expect(mockOpenPortal).not.toHaveBeenCalled();
  });
});
