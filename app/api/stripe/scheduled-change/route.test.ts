/** @jest-environment node */
import { NextRequest } from "next/server";

const claims = jest.fn();
const getStripe = jest.fn();
const createAdminClient = jest.fn();
const withCheckoutLease = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({}),
}));
jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient,
}));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser: claims }));
jest.mock("@/features/account-lifecycle/accountClosure", () => ({
  readClosureJournal: jest.fn(),
}));
jest.mock("@/lib/stripe/server", () => ({
  isStripeConfigured: () => true,
  requiredStripeMode: () => "test",
  getStripe,
}));
jest.mock("@/features/entitlements/stripe/checkoutLease", () => ({
  withCheckoutLease,
  CheckoutBusyError: class CheckoutBusyError extends Error {},
}));

describe("scheduled plan change route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    claims.mockResolvedValue({ data: { user: { id: "user_harbor_dental" } } });
  });

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

  it("serializes matching confirmations so a retry returns the first schedule", async () => {
    const periodEnd = 1_800_000_000;
    const targetPriceId = "price_harbor_dental_entry_month";
    const currentSubscription = (schedule: string | null) => ({
      id: "sub_harbor_dental",
      customer: { id: "cus_harbor_dental" },
      status: "active",
      schedule,
      cancel_at: null,
      cancel_at_period_end: false,
      pending_update: null,
      livemode: false,
      items: {
        data: [
          {
            id: "si_harbor_dental",
            quantity: 1,
            current_period_end: periodEnd,
            price: { id: "price_harbor_dental_pro_month" },
          },
        ],
      },
    });
    const phase = {
      add_invoice_items: [],
      application_fee_percent: null,
      automatic_tax: null,
      billing_cycle_anchor: "automatic",
      billing_thresholds: null,
      collection_method: "charge_automatically",
      currency: "usd",
      default_payment_method: null,
      default_tax_rates: [],
      description: null,
      discounts: [],
      end_date: periodEnd,
      invoice_settings: null,
      items: [
        {
          price: { id: "price_harbor_dental_pro_month" },
          quantity: 1,
          billing_thresholds: null,
          discounts: [],
          metadata: null,
          tax_rates: [],
        },
      ],
      metadata: null,
      on_behalf_of: null,
      proration_behavior: "none",
      start_date: periodEnd - 2_592_000,
      transfer_data: null,
      trial: false,
      trial_end: null,
    };
    let previewReads = 0;
    let releasePreviews: (() => void) | undefined;
    const previewsReady = new Promise<void>((resolve) => {
      releasePreviews = resolve;
    });
    let subscriptionReads = 0;
    let scheduleCreated = false;
    let scheduleCustomerId = "cus_harbor_dental";
    let targetPriceAmount = 1900;
    const createSchedule = jest.fn(async () => {
      scheduleCreated = true;
      return { id: "sub_sched_harbor_dental", phases: [phase] };
    });
    const stripe = {
      subscriptions: {
        list: jest.fn(async () => ({
          data: [{ id: "sub_harbor_dental", status: "active" }],
        })),
        retrieve: jest.fn(async () => {
          subscriptionReads += 1;
          if (subscriptionReads <= 2) {
            previewReads += 1;
            if (previewReads === 2) releasePreviews?.();
            await previewsReady;
            return currentSubscription(null);
          }
          return currentSubscription(
            scheduleCreated ? "sub_sched_harbor_dental" : null,
          );
        }),
      },
      prices: {
        retrieve: jest.fn(async (priceId: string) =>
          priceId === "price_harbor_dental_pro_month"
            ? {
                id: priceId,
                active: true,
                livemode: false,
                unit_amount: 4900,
                currency: "usd",
                metadata: { purpose: "platform_subscription", plan_key: "pro" },
                recurring: { interval: "month", interval_count: 1 },
              }
            : {
                id: targetPriceId,
                active: true,
                livemode: false,
                unit_amount: targetPriceAmount,
                currency: "usd",
                metadata: {
                  purpose: "platform_subscription",
                  plan_key: "entry",
                },
                recurring: { interval: "month", interval_count: 1 },
              },
        ),
      },
      subscriptionSchedules: {
        create: createSchedule,
        update: jest.fn(async () => ({})),
        release: jest.fn(async () => ({})),
        retrieve: jest.fn(async () => ({
          customer: { id: scheduleCustomerId },
          subscription: { id: "sub_harbor_dental" },
          metadata: { purpose: "matrx_personal_plan_change" },
          phases: [
            phase,
            {
              ...phase,
              start_date: periodEnd,
              end_date: periodEnd + 2_592_000,
              items: [{ ...phase.items[0], price: { id: targetPriceId } }],
            },
          ],
        })),
      },
    };
    getStripe.mockReturnValue(stripe);
    createAdminClient.mockReturnValue({
      auth: {
        admin: {
          getUserById: jest.fn(async () => ({
            data: { user: { app_metadata: {} } },
            error: null,
          })),
        },
      },
      schema: () => ({
        from: (table: string) => {
          let planKey: string | undefined;
          const query = {
            select: () => query,
            eq: (field: string, value: string | boolean | number) => {
              if (
                table === "plan" &&
                field === "plan_key" &&
                typeof value === "string"
              )
                planKey = value;
              return query;
            },
            is: () => query,
            contains: () => query,
            maybeSingle: async () => ({
              data:
                table === "customer"
                  ? { stripe_customer_id: "cus_harbor_dental" }
                  : table === "plan"
                    ? planKey === "pro"
                      ? {
                          plan_key: "pro",
                          rank: 2,
                          audience: "personal",
                          monthly_cents: 4900,
                          annual_cents: 49000,
                        }
                      : {
                          plan_key: "entry",
                          rank: 1,
                          audience: "personal",
                          monthly_cents: 1900,
                          annual_cents: 19000,
                        }
                    : {
                        stripe_price_id: targetPriceId,
                        unit_amount: 1900,
                        currency: "usd",
                        interval: "month",
                        interval_count: 1,
                        metadata: {
                          purpose: "platform_subscription",
                          plan_key: "entry",
                        },
                      },
              error: null,
            }),
          };
          return query;
        },
      }),
    });
    let tail = Promise.resolve();
    withCheckoutLease.mockImplementation(
      async (_customerId, _livemode, work) => {
        const prior = tail;
        let releaseLease: (() => void) | undefined;
        tail = new Promise<void>((resolve) => {
          releaseLease = resolve;
        });
        await prior;
        try {
          return await work(async () => undefined);
        } finally {
          releaseLease?.();
        }
      },
    );

    const { POST } = await import("./route");
    const request = () =>
      new NextRequest("http://localhost/api/stripe/scheduled-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          planKey: "entry",
          cycle: "monthly",
        }),
      });
    const [first, second] = await Promise.all([
      POST(request()),
      POST(request()),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
    expect(createSchedule).toHaveBeenCalledTimes(1);
    expect(withCheckoutLease).toHaveBeenCalledTimes(2);

    scheduleCustomerId = "cus_other_practice";
    const foreign = await POST(request());
    expect(foreign.status).toBe(409);
    expect(await foreign.json()).toEqual({
      error:
        "A plan change is already managed in billing. Manage it there instead.",
    });
    expect(createSchedule).toHaveBeenCalledTimes(1);

    scheduleCustomerId = "cus_harbor_dental";
    targetPriceAmount = 2000;
    const catalogMismatch = await POST(request());
    expect(catalogMismatch.status).toBe(409);
    expect(await catalogMismatch.json()).toEqual({
      error:
        "The Stripe price and platform catalog disagree. No change was made.",
    });
    expect(createSchedule).toHaveBeenCalledTimes(1);
  });
});
