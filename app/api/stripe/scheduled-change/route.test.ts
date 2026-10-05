/** @jest-environment node */
import { NextRequest } from "next/server";

const claims = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({}),
}));
jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: jest.fn(),
}));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser: claims }));
jest.mock("@/features/account-lifecycle/accountClosure", () => ({
  readClosureJournal: jest.fn(),
}));
jest.mock("@/lib/stripe/server", () => ({
  isStripeConfigured: () => true,
  requiredStripeMode: () => "test",
  getStripe: jest.fn(),
}));

describe("scheduled plan change route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses an invalid action before reading a customer or touching Stripe", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/stripe/scheduled-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "charge_now" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Unknown scheduled billing action.",
    });
    expect(claims).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated schedule preview", async () => {
    claims.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/stripe/scheduled-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          planKey: "personal-entry",
          cycle: "monthly",
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not authenticated" });
  });
});
