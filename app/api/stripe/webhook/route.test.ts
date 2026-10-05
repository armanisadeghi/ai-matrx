/** @jest-environment node */

import type Stripe from "stripe";
import type { NextRequest } from "next/server";

const stripe = { subscriptions: { retrieve: jest.fn() } };
const verifyStripeWebhook = jest.fn();
const hasProcessedStripeEvent = jest.fn();
const hasSyncedSubscription = jest.fn();
const recordStripeEvent = jest.fn();
const syncSubscription = jest.fn();
const markSubscriptionCanceled = jest.fn();
const confirmCoppaVerification = jest.fn();
const fulfillClassPurchase = jest.fn();

jest.mock("@/lib/stripe/server", () => ({ verifyStripeWebhook }));
jest.mock("@/features/entitlements/stripe/sync", () => ({
  hasProcessedStripeEvent,
  hasSyncedSubscription,
  recordStripeEvent,
  syncSubscription,
  markSubscriptionCanceled,
}));
jest.mock("@/features/entitlements/stripe/billingOwner", () => ({
  billingOwnerRefFromRow: jest.fn(),
}));
jest.mock("@/features/education/compliance/consent/verificationSync", () => ({
  COPPA_VERIFICATION_PURPOSE: "coppa_verification",
  confirmCoppaVerification,
}));
jest.mock("@/features/entitlements/stripe/connect", () => ({
  fulfillClassPurchase,
  revokeClassPurchaseByPaymentIntent: jest.fn(),
  upsertConnectAccount: jest.fn(),
  billingOwnerForConnectAccount: jest.fn(),
}));

type Route = typeof import("./route");
let POST: Route["POST"];

function request(): NextRequest {
  const { NextRequest: Request } = require("next/server") as typeof import("next/server");
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: "signed-payload",
    headers: { "stripe-signature": "sig_fixture" },
  }) as unknown as NextRequest;
}

function invoiceEvent(type: Stripe.Event.Type): Stripe.Event {
  return {
    id: `evt_${type.replaceAll(".", "_")}`,
    object: "event",
    type,
    created: 1_791_234_567,
    livemode: false,
    data: {
      object: {
        id: "in_harbor_dental_october",
        object: "invoice",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_harbor_dental" },
        },
      },
    },
  } as unknown as Stripe.Event;
}

function checkoutEvent(metadata: Record<string, string>, subscription: string | null = null): Stripe.Event {
  return {
    id: `evt_checkout_${metadata.purpose ?? metadata.kind ?? "subscription"}`,
    object: "event",
    type: "checkout.session.completed",
    created: 1_791_234_567,
    livemode: false,
    data: {
      object: {
        id: "cs_harbor_dental_october",
        object: "checkout.session",
        metadata,
        subscription,
      },
    },
  } as unknown as Stripe.Event;
}

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

beforeEach(() => {
  // Each event exercises its own delivery; previous cases are not retries of it.
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  verifyStripeWebhook.mockReturnValue({ event: invoiceEvent("invoice.payment_failed"), stripe });
  hasProcessedStripeEvent.mockResolvedValue(false);
  hasSyncedSubscription.mockResolvedValue(false);
  recordStripeEvent.mockResolvedValue(undefined);
  syncSubscription.mockResolvedValue(undefined);
  markSubscriptionCanceled.mockResolvedValue(undefined);
  confirmCoppaVerification.mockResolvedValue(undefined);
  fulfillClassPurchase.mockResolvedValue(undefined);
  stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_harbor_dental", status: "past_due" });
});

afterEach(() => jest.restoreAllMocks());

describe("POST /api/stripe/webhook invoice recovery", () => {
  it.each<Stripe.Event.Type>([
    "invoice.payment_failed",
    "invoice.payment_action_required",
    "invoice.paid",
    "invoice.upcoming",
  ])("retrieves Stripe's current subscription for %s before mirroring", async (type) => {
    verifyStripeWebhook.mockReturnValue({ event: invoiceEvent(type), stripe });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_harbor_dental");
    expect(syncSubscription).toHaveBeenCalledWith(
      { id: "sub_harbor_dental", status: "past_due" },
      1_791_234_567,
    );
    expect(recordStripeEvent).toHaveBeenCalledWith(expect.objectContaining({ type }));
  });

  it("returns retryable failure and records no receipt when the mirror write fails", async () => {
    syncSubscription.mockRejectedValue(new Error("billing mirror unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Handler failed" });
    expect(recordStripeEvent).not.toHaveBeenCalled();
  });

  it("keeps COPPA verification ahead of subscription recovery", async () => {
    const event = checkoutEvent({ purpose: "coppa_verification" }, "sub_should_not_sync");
    verifyStripeWebhook.mockReturnValue({ event, stripe });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(confirmCoppaVerification).toHaveBeenCalledWith(event.data.object, stripe);
    expect(fulfillClassPurchase).not.toHaveBeenCalled();
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it("keeps a creator class purchase out of subscription recovery", async () => {
    const event = checkoutEvent({ kind: "class_purchase" }, "sub_should_not_sync");
    verifyStripeWebhook.mockReturnValue({ event, stripe });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(fulfillClassPurchase).toHaveBeenCalledWith(event.data.object);
    expect(confirmCoppaVerification).not.toHaveBeenCalled();
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it("keeps a company subscription checkout on its existing canonical sync path", async () => {
    const event = checkoutEvent(
      { purpose: "platform_subscription", audience: "company" },
      "sub_harbor_dental_company",
    );
    verifyStripeWebhook.mockReturnValue({ event, stripe });
    stripe.subscriptions.retrieve.mockResolvedValue({
      id: "sub_harbor_dental_company",
      status: "active",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_harbor_dental_company");
    expect(syncSubscription).toHaveBeenCalledWith(
      { id: "sub_harbor_dental_company", status: "active" },
      event.created,
    );
    expect(confirmCoppaVerification).not.toHaveBeenCalled();
    expect(fulfillClassPurchase).not.toHaveBeenCalled();
  });
});
