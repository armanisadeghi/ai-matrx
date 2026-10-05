/** @jest-environment node */
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockClaims = jest.fn();
const mockReadSubscription = jest.fn();
const mockRetrieveSubscription = jest.fn();
const mockListInvoices = jest.fn();
const mockFilters: unknown[][] = [];
jest.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mockClaims } }) }));
jest.mock("@/utils/supabase/resolveUser", () => jest.requireActual("@/utils/supabase/claimsUser"));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: () => ({ schema: () => ({ from: () => {
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => { mockFilters.push(args); return query; },
    neq: () => query, in: () => query, order: () => query, limit: () => query,
    maybeSingle: mockReadSubscription,
  };
  return query;
} }) }) }));
jest.mock("@/lib/stripe/server", () => ({
  isStripeConfigured: () => true, requiredStripeMode: () => "test",
  getStripe: () => ({ subscriptions: { retrieve: mockRetrieveSubscription }, invoices: { list: mockListInvoices } }),
}));

function request() {
  return new NextRequest("http://localhost/api/stripe/billing-summary", { method: "POST", headers: { "Content-Type": "application/json", "X-Organization-Id": "company-navigation" }, body: JSON.stringify({ scope: "personal" }) });
}

describe("billing invoice support reader", () => {
  beforeEach(() => {
    jest.clearAllMocks(); mockFilters.length = 0;
    mockClaims.mockResolvedValue({ data: { claims: { sub: "person-1" } }, error: null });
    mockReadSubscription.mockResolvedValue({ data: { stripe_subscription_id: "sub_personal" }, error: null });
    mockRetrieveSubscription.mockResolvedValue({ id: "sub_personal", latest_invoice: { id: "in_latest", hosted_invoice_url: null, status: "paid", payments: { data: [] } } });
    mockListInvoices.mockResolvedValue({ data: [{ id: "in_latest", status: "paid", number: "INV-1", created: 1700000000, metadata: { secret: "omit" } }] });
  });
  it("lists only the exact personal subscription, not the company in navigation", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mockFilters).toContainEqual(["beneficiary_user_id", "person-1"]);
    expect(mockFilters).toContainEqual(["livemode", false]);
    expect(mockFilters).not.toContainEqual(["organization_id", "company-navigation"]);
    expect(mockListInvoices).toHaveBeenCalledWith({ subscription: "sub_personal", limit: 20 });
    expect(await response.json()).toEqual({ invoice: { id: "in_latest", url: null, status: "paid", requiresAction: false }, supportInvoices: [{ id: "in_latest", status: "paid", number: "INV-1", created: 1700000000 }] });
  });
  it("does not fall through to company billing without a personal subscription", async () => {
    mockReadSubscription.mockResolvedValue({ data: null, error: null });
    const response = await POST(request());
    expect(await response.json()).toEqual({ invoice: null });
    expect(mockRetrieveSubscription).not.toHaveBeenCalled();
    expect(mockListInvoices).not.toHaveBeenCalled();
  });
  it("does not read any financial record when identity is absent", async () => {
    mockClaims.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(mockReadSubscription).not.toHaveBeenCalled();
  });
  it("reports an invoice-provider failure rather than claiming complete data", async () => {
    mockListInvoices.mockRejectedValue(new Error("provider unavailable"));
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(request())).status).toBe(500);
    log.mockRestore();
  });
});
