import {
  assertSchedulablePersonalSubscription,
  createScheduledPersonalChange,
  ScheduledChangeError,
  undoScheduledPersonalChange,
  type SchedulableSubscription,
} from "./scheduledChange";
import type Stripe from "stripe";

type ScheduledChangeStripe = Parameters<
  typeof createScheduledPersonalChange
>[0]["stripe"];
type ScheduleGateway = ScheduledChangeStripe["subscriptionSchedules"];

const vatTaxRate: Stripe.TaxRate = {
  id: "txr_harbor_dental_vat",
  object: "tax_rate",
  active: true,
  country: "US",
  created: 1_790_000_000,
  description: "Harbor Dental subscription tax",
  display_name: "Sales tax",
  effective_percentage: null,
  flat_amount: null,
  inclusive: false,
  jurisdiction: "California",
  jurisdiction_level: "state",
  livemode: false,
  metadata: null,
  percentage: 7.25,
  rate_type: "percentage",
  state: "CA",
  tax_type: "sales_tax",
};

const subscription: SchedulableSubscription = {
  id: "sub_personal",
  customer: "cus_personal",
  status: "active",
  schedule: null,
  cancel_at: null,
  cancel_at_period_end: false,
  pending_update: null,
  items: {
    data: [
      {
        id: "si_personal",
        quantity: 2,
        current_period_end: Math.floor(Date.now() / 1000) + 86_400,
        price: { id: "price_current" },
      },
    ],
  },
};

const phase: Stripe.SubscriptionSchedule.Phase = {
  add_invoice_items: [],
  application_fee_percent: null,
  automatic_tax: { disabled_reason: null, enabled: true, liability: null },
  billing_cycle_anchor: "automatic",
  billing_thresholds: null,
  collection_method: "charge_automatically",
  currency: "usd",
  default_payment_method: null,
  default_tax_rates: [vatTaxRate],
  description: null,
  discounts: [{ discount: "di_contract", coupon: null, promotion_code: null }],
  end_date: subscription.items.data[0].current_period_end,
  invoice_settings: null,
  items: [
    {
      price: "price_current",
      plan: "price_current",
      quantity: 2,
      billing_thresholds: null,
      discounts: [],
      metadata: null,
      tax_rates: [vatTaxRate],
    },
  ],
  metadata: null,
  on_behalf_of: null,
  proration_behavior: "create_prorations",
  start_date: Math.floor(Date.now() / 1000) - 100,
  transfer_data: null,
  trial_end: null,
};

const preview = {
  subscriptionId: "sub_personal",
  currentPlanKey: "pro",
  targetPlanKey: "entry",
  targetPriceId: "price_entry_month",
  targetAmount: 1200,
  currency: "usd",
  effectiveAt: phase.end_date,
  quantity: 2,
};

function scheduledGateway(
  overrides: Partial<ScheduleGateway>,
): ScheduleGateway {
  return {
    create: async () => ({ id: "sub_sched_default", phases: [phase] }),
    update: async () => ({}),
    retrieve: async () => ({
      customer: "cus_personal",
      subscription: "sub_personal",
      metadata: null,
    }),
    release: async () => ({}),
    ...overrides,
  };
}

describe("scheduled personal plan changes", () => {
  it("refuses unsupported subscription shapes before creating a Stripe schedule", () => {
    expect(() =>
      assertSchedulablePersonalSubscription(
        {
          ...subscription,
          items: {
            data: [...subscription.items.data, subscription.items.data[0]],
          },
        },
        "cus_personal",
      ),
    ).toThrow("multiple items");
    expect(() =>
      assertSchedulablePersonalSubscription(
        { ...subscription, schedule: "sub_sched_other" },
        "cus_personal",
      ),
    ).toThrow("already exists");
  });

  it("creates a next-period schedule that retains quantity, tax, and discounts without a proration", async () => {
    const create = jest.fn(async () => ({
      id: "sub_sched_ours",
      phases: [phase],
    }));
    const update = jest.fn(async () => ({}));
    const release = jest.fn(async () => ({}));
    const retrieve = jest.fn(async () => ({
      customer: "cus_personal",
      subscription: "sub_personal",
      metadata: null,
    }));
    await createScheduledPersonalChange({
      stripe: {
        subscriptionSchedules: scheduledGateway({
          create,
          update,
          retrieve,
          release,
        }),
      },
      preview,
      subscription,
      customerId: "cus_personal",
    });
    expect(create).toHaveBeenCalledWith(
      { from_subscription: "sub_personal" },
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("sub_personal"),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      "sub_sched_ours",
      expect.objectContaining({
        metadata: { purpose: "matrx_personal_plan_change" },
        phases: expect.arrayContaining([
          expect.objectContaining({ end_date: phase.end_date }),
          expect.objectContaining({
            start_date: phase.end_date,
            proration_behavior: "none",
            items: [
              expect.objectContaining({
                price: "price_entry_month",
                quantity: 2,
                tax_rates: [vatTaxRate.id],
              }),
            ],
            discounts: [{ discount: "di_contract" }],
          }),
        ]),
      }),
    );
    expect(release).not.toHaveBeenCalled();
  });

  it("releases its new schedule if Stripe refuses the second, contract-preserving update", async () => {
    const release = jest.fn(async () => ({}));
    const retrieve = jest.fn(async () => ({
      customer: "cus_personal",
      subscription: "sub_personal",
      metadata: null,
    }));
    await expect(
      createScheduledPersonalChange({
        stripe: {
          subscriptionSchedules: scheduledGateway({
            create: jest.fn(async () => ({
              id: "sub_sched_ours",
              phases: [phase],
            })),
            update: jest.fn(async () => {
              throw new Error("bad phase");
            }),
            retrieve,
            release,
          }),
        },
        preview,
        subscription,
        customerId: "cus_personal",
      }),
    ).rejects.toThrow("bad phase");
    expect(release).toHaveBeenCalledWith("sub_sched_ours");
  });

  it("creates a fresh operation after its own scheduled change is undone", async () => {
    let sequence = 0;
    const createCalls: Parameters<ScheduleGateway["create"]>[] = [];
    const releasedScheduleIds: string[] = [];
    const create: ScheduleGateway["create"] = async (...args) => {
      createCalls.push(args);
      return { id: `sub_sched_operation_${++sequence}`, phases: [phase] };
    };
    const update: ScheduleGateway["update"] = async () => ({});
    const release: ScheduleGateway["release"] = async (scheduleId) => {
      releasedScheduleIds.push(scheduleId);
    };
    const retrieve: ScheduleGateway["retrieve"] = async (scheduleId) => ({
      customer: "cus_personal",
      subscription: "sub_personal",
      metadata:
        scheduleId === "sub_sched_operation_1"
          ? { purpose: "matrx_personal_plan_change" }
          : { purpose: "other" },
    });
    const stripe = {
      subscriptionSchedules: scheduledGateway({
        create,
        update,
        retrieve,
        release,
      }),
    };

    const first = await createScheduledPersonalChange({
      stripe,
      preview,
      subscription,
      customerId: "cus_personal",
    });
    await undoScheduledPersonalChange({
      stripe,
      subscription: { ...subscription, schedule: first.scheduleId },
      customerId: "cus_personal",
    });
    const second = await createScheduledPersonalChange({
      stripe,
      preview,
      subscription,
      customerId: "cus_personal",
    });

    expect(first.scheduleId).toBe("sub_sched_operation_1");
    expect(second.scheduleId).toBe("sub_sched_operation_2");
    expect(releasedScheduleIds).toEqual([first.scheduleId]);
    const [, firstOptions] = createCalls[0];
    const [, secondOptions] = createCalls[1];
    expect(firstOptions?.idempotencyKey).not.toBe(
      secondOptions?.idempotencyKey,
    );
  });

  it("releases only a schedule this surface owns", async () => {
    const release = jest.fn(async () => ({}));
    await undoScheduledPersonalChange({
      stripe: {
        subscriptionSchedules: scheduledGateway({
          retrieve: jest.fn(async () => ({
            customer: "cus_personal",
            subscription: "sub_personal",
            metadata: { purpose: "matrx_personal_plan_change" },
          })),
          release,
        }),
      },
      subscription: { ...subscription, schedule: "sub_sched_ours" },
      customerId: "cus_personal",
    });
    expect(release).toHaveBeenCalledWith("sub_sched_ours");
    await expect(
      undoScheduledPersonalChange({
        stripe: {
          subscriptionSchedules: scheduledGateway({
            retrieve: jest.fn(async () => ({
              customer: "cus_personal",
              subscription: "sub_personal",
              metadata: { purpose: "other" },
            })),
            release,
          }),
        },
        subscription: { ...subscription, schedule: "sub_sched_other" },
        customerId: "cus_personal",
      }),
    ).rejects.toBeInstanceOf(ScheduledChangeError);
  });
});
