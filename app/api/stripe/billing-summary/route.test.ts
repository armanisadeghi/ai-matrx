/** @jest-environment node */
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockClaims = jest.fn();
const mockReadSubscription = jest.fn();
const mockRetrieveSubscription = jest.fn();
const mockListInvoices = jest.fn();
const mockRetrieveInvoice = jest.fn();
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
  getStripe: () => ({ subscriptions: { retrieve: mockRetrieveSubscription }, invoices: { list: mockListInvoices, retrieve: mockRetrieveInvoice } }),
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
    mockRetrieveInvoice.mockResolvedValue({ id: "in_latest", hosted_invoice_url: null, status: "paid", payments: { data: [] } });
    mockListInvoices.mockResolvedValue({ data: [{ id: "in_latest", status: "paid", number: "INV-1", created: 1700000000, metadata: { secret: "omit" } }] });
  });
  it("lists only the exact personal subscription, not the company in navigation", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mockFilters).toContainEqual(["beneficiary_user_id", "person-1"]);
    expect(mockFilters).toContainEqual(["livemode", false]);
    expect(mockFilters).not.toContainEqual(["organization_id", "company-navigation"]);
    expect(mockListInvoices).toHaveBeenCalledWith({ subscription: "sub_personal", limit: 20 });
    expect(mockRetrieveSubscription).toHaveBeenCalledWith("sub_personal");
    expect(mockRetrieveInvoice).toHaveBeenCalledWith("in_latest", { expand: ["payments.data.payment.payment_intent"] });
    expect(await response.json()).toEqual({ invoice: { id: "in_latest", url: null, status: "paid", requiresAction: false }, supportInvoices: [{ id: "in_latest", status: "paid", number: "INV-1", created: 1700000000 }] });
  });
  it("reads authentication recovery from the invoice root within Stripe's expansion limit", async () => {
    mockRetrieveSubscription.mockResolvedValue({ id: "sub_personal", latest_invoice: "in_latest" });
    mockRetrieveInvoice.mockResolvedValue({ id: "in_latest", status: "open", hosted_invoice_url: "https://invoice.stripe.com/recovery", payments: { data: [{ payment: { type: "payment_intent", payment_intent: { status: "requires_action" } } }] } });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).invoice.requiresAction).toBe(true);
    expect(mockRetrieveSubscription.mock.calls[0][1]).toBeUndefined();
    expect(mockRetrieveInvoice.mock.calls[0][1].expand.every((path: string) => path.split(".").length <= 4)).toBe(true);
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
