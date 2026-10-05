import type Stripe from "stripe";
import { randomUUID } from "node:crypto";

export class ScheduledChangeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export type ScheduledChangePreview = {
  subscriptionId: string;
  currentPlanKey: string;
  targetPlanKey: string;
  targetPriceId: string;
  targetAmount: number;
  currency: string;
  effectiveAt: number;
  quantity: number;
};

type PhaseInput = Stripe.SubscriptionScheduleUpdateParams.Phase;
type PhaseItemInput = NonNullable<PhaseInput["items"]>[number];

type ScheduleGateway = {
  create: (
    params: Stripe.SubscriptionScheduleCreateParams,
    options?: Stripe.RequestOptions,
  ) => Promise<{ id: string; phases: Stripe.SubscriptionSchedule.Phase[] }>;
  update: (
    scheduleId: string,
    params: Stripe.SubscriptionScheduleUpdateParams,
  ) => Promise<unknown>;
  retrieve: (scheduleId: string) => Promise<{
    customer: string | { id: string };
    subscription: string | { id: string } | null;
    metadata: Stripe.Metadata | null;
  }>;
  release: (scheduleId: string) => Promise<unknown>;
};

export type SchedulableSubscriptionItem = {
  id: string;
  quantity?: number | null;
  current_period_end: number;
  price: { id: string };
};

/** The exact Stripe subscription surface this scheduling contract reads. */
export type SchedulableSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  schedule: string | { id: string } | null;
  cancel_at: number | null;
  cancel_at_period_end: boolean;
  pending_update: unknown;
  items: { data: SchedulableSubscriptionItem[] };
};

function idOf(
  value: string | { id: string } | null | undefined,
): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function requiredId(
  value: string | { id: string } | null | undefined,
  label: string,
) {
  const id = idOf(value);
  if (!id)
    throw new ScheduledChangeError(
      `This subscription has an unsupported ${label}, so its contract cannot be preserved. Manage it in billing instead.`,
    );
  return id;
}

function discountsInput(
  discounts: Array<{
    discount: string | { id: string } | null;
    coupon: string | { id: string } | null;
    promotion_code: string | { id: string } | null;
  }>,
) {
  return discounts.map((discount) => {
    if (idOf(discount.discount)) return { discount: idOf(discount.discount)! };
    if (idOf(discount.coupon)) return { coupon: idOf(discount.coupon)! };
    if (idOf(discount.promotion_code))
      return { promotion_code: idOf(discount.promotion_code)! };
    throw new ScheduledChangeError(
      "This subscription has an unsupported discount, so its contract cannot be preserved. Manage it in billing instead.",
    );
  });
}

function idsInput(
  values: Array<string | { id: string } | null | undefined>,
  label: string,
) {
  return values.map((value) => requiredId(value, label));
}

/**
 * A scheduled change is deliberately narrow. `from_subscription` snapshots the
 * current contract; we then copy that phase forward rather than reconstructing
 * it from assumptions. Shapes we cannot faithfully copy fail before Stripe is
 * called, rather than quietly dropping discounts, tax, or item configuration.
 */
export function assertSchedulablePersonalSubscription(
  subscription: SchedulableSubscription,
  customerId: string,
): SchedulableSubscriptionItem {
  if (idOf(subscription.customer) !== customerId)
    throw new ScheduledChangeError(
      "This subscription does not belong to your billing account.",
      403,
    );
  if (!["active", "trialing"].includes(subscription.status))
    throw new ScheduledChangeError(
      "Only an active subscription can be changed for its next renewal.",
    );
  if (subscription.schedule)
    throw new ScheduledChangeError(
      "A scheduled change already exists. Undo it before choosing another plan.",
      409,
    );
  if (subscription.cancel_at_period_end || subscription.cancel_at)
    throw new ScheduledChangeError(
      "This subscription is already set to end and cannot be changed here.",
      409,
    );
  if (subscription.pending_update)
    throw new ScheduledChangeError(
      "This subscription has a pending Stripe update. Try again after it completes.",
      409,
    );
  if (subscription.items.data.length !== 1)
    throw new ScheduledChangeError(
      "This subscription has multiple items, so a plan change would not preserve its contract. Manage it in billing instead.",
    );
  const item = subscription.items.data[0];
  const periodEnd = item.current_period_end;
  if (
    !Number.isSafeInteger(periodEnd) ||
    periodEnd <= Math.floor(Date.now() / 1000)
  )
    throw new ScheduledChangeError(
      "The current paid-through date is unavailable. Refresh billing and try again.",
    );
  if (!Number.isSafeInteger(item.quantity ?? 1) || (item.quantity ?? 1) <= 0)
    throw new ScheduledChangeError(
      "This subscription quantity cannot be preserved safely. Manage it in billing instead.",
    );
  return item;
}

function phaseInput(
  phase: Stripe.SubscriptionSchedule.Phase,
  item: Stripe.SubscriptionSchedule.Phase.Item,
  priceId: string,
  startDate: number,
  endDate?: number,
): PhaseInput {
  if (phase.add_invoice_items.length)
    throw new ScheduledChangeError(
      "This subscription includes additional invoice items, which cannot be safely carried into a scheduled plan change. Manage it in billing instead.",
    );
  if (phase.items.length !== 1)
    throw new ScheduledChangeError(
      "This subscription has multiple items, so a plan change would not preserve its contract. Manage it in billing instead.",
    );
  const sourcePrice = idOf(item.price);
  if (!sourcePrice)
    throw new ScheduledChangeError(
      "The subscription price is unavailable. Refresh billing and try again.",
    );
  const present = <T>(value: T | null | undefined): value is T =>
    value !== null && value !== undefined;
  if (item.billing_thresholds)
    throw new ScheduledChangeError(
      "This subscription uses billing thresholds, which cannot be safely carried into a scheduled plan change. Manage it in billing instead.",
    );
  const phaseItem: PhaseItemInput = {
    price: priceId,
    quantity: item.quantity ?? 1,
    ...(item.discounts.length
      ? { discounts: discountsInput(item.discounts) }
      : {}),
    ...(present(item.metadata) ? { metadata: item.metadata } : {}),
    ...(item.tax_rates?.length
      ? { tax_rates: idsInput(item.tax_rates, "tax rate") }
      : {}),
  };
  const result: PhaseInput = {
    items: [phaseItem],
    start_date: startDate,
    ...(endDate ? { end_date: endDate } : {}),
    ...(present(phase.application_fee_percent)
      ? { application_fee_percent: phase.application_fee_percent }
      : {}),
    ...(present(phase.automatic_tax)
      ? {
          automatic_tax: {
            enabled: phase.automatic_tax.enabled,
            ...(phase.automatic_tax.liability
              ? {
                  liability: {
                    type: phase.automatic_tax.liability.type,
                    ...(phase.automatic_tax.liability.account
                      ? {
                          account: requiredId(
                            phase.automatic_tax.liability.account,
                            "automatic tax account",
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(present(phase.billing_cycle_anchor)
      ? { billing_cycle_anchor: phase.billing_cycle_anchor }
      : {}),
    ...(present(phase.billing_thresholds)
      ? {
          billing_thresholds: {
            ...(present(phase.billing_thresholds.amount_gte)
              ? { amount_gte: phase.billing_thresholds.amount_gte }
              : {}),
            ...(present(phase.billing_thresholds.reset_billing_cycle_anchor)
              ? {
                  reset_billing_cycle_anchor:
                    phase.billing_thresholds.reset_billing_cycle_anchor,
                }
              : {}),
          },
        }
      : {}),
    ...(present(phase.collection_method)
      ? { collection_method: phase.collection_method }
      : {}),
    ...(present(phase.currency) ? { currency: phase.currency } : {}),
    ...(idOf(phase.default_payment_method)
      ? {
          default_payment_method: requiredId(
            phase.default_payment_method,
            "default payment method",
          ),
        }
      : {}),
    ...(phase.default_tax_rates?.length
      ? {
          default_tax_rates: idsInput(
            phase.default_tax_rates,
            "default tax rate",
          ),
        }
      : {}),
    ...(present(phase.description) ? { description: phase.description } : {}),
    ...(phase.discounts.length
      ? { discounts: discountsInput(phase.discounts) }
      : {}),
    ...(present(phase.invoice_settings)
      ? {
          invoice_settings: {
            ...(phase.invoice_settings.account_tax_ids?.length
              ? {
                  account_tax_ids: idsInput(
                    phase.invoice_settings.account_tax_ids,
                    "invoice tax ID",
                  ),
                }
              : {}),
            ...(phase.invoice_settings.custom_fields?.length
              ? { custom_fields: phase.invoice_settings.custom_fields }
              : {}),
            ...(present(phase.invoice_settings.days_until_due)
              ? { days_until_due: phase.invoice_settings.days_until_due }
              : {}),
            ...(present(phase.invoice_settings.description)
              ? { description: phase.invoice_settings.description }
              : {}),
            ...(present(phase.invoice_settings.footer)
              ? { footer: phase.invoice_settings.footer }
              : {}),
            ...(phase.invoice_settings.issuer
              ? {
                  issuer: {
                    type: phase.invoice_settings.issuer.type,
                    ...(phase.invoice_settings.issuer.account
                      ? {
                          account: requiredId(
                            phase.invoice_settings.issuer.account,
                            "invoice issuer",
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(present(phase.metadata) ? { metadata: phase.metadata } : {}),
    ...(idOf(phase.on_behalf_of)
      ? { on_behalf_of: requiredId(phase.on_behalf_of, "connected account") }
      : {}),
    proration_behavior: "none",
    ...(present(phase.transfer_data)
      ? {
          transfer_data: {
            ...(present(phase.transfer_data.amount_percent)
              ? { amount_percent: phase.transfer_data.amount_percent }
              : {}),
            destination: requiredId(
              phase.transfer_data!.destination,
              "transfer destination",
            ),
          },
        }
      : {}),
    ...(phase.trial ? { trial: true } : {}),
    ...(present(phase.trial_end) ? { trial_end: phase.trial_end } : {}),
  };
  return result;
}

export async function createScheduledPersonalChange(input: {
  stripe: { subscriptionSchedules: ScheduleGateway };
  preview: ScheduledChangePreview;
  subscription: SchedulableSubscription;
  customerId: string;
}): Promise<{ scheduleId: string; effectiveAt: number }> {
  const subscriptionItem = assertSchedulablePersonalSubscription(
    input.subscription,
    input.customerId,
  );
  if (input.preview.subscriptionId !== input.subscription.id)
    throw new ScheduledChangeError(
      "The subscription changed while this confirmation was open. Review the new billing details first.",
      409,
    );
  const schedule = await input.stripe.subscriptionSchedules.create(
    { from_subscription: input.subscription.id },
    {
      // The retry-safe path is the active owned schedule lookup in the route.
      // A released schedule must never poison a later, new change request.
      idempotencyKey: `matrx-scheduled-change-${input.subscription.id}-${randomUUID()}`,
    },
  );
  const phase =
    schedule.phases.find(
      (candidate) =>
        candidate.start_date <= subscriptionItem.current_period_end &&
        candidate.end_date >= subscriptionItem.current_period_end,
    ) ?? schedule.phases.at(-1);
  if (!phase || phase.end_date !== subscriptionItem.current_period_end) {
    // Do not mutate a schedule whose phase boundary disagrees with the exact
    // subscription we previewed. Releasing it avoids trapping the contract.
    await input.stripe.subscriptionSchedules.release(schedule.id);
    throw new ScheduledChangeError(
      "Stripe returned a different paid-through date. No plan change was kept; refresh billing and try again.",
      409,
    );
  }
  try {
    await input.stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      metadata: { purpose: "matrx_personal_plan_change" },
      phases: [
        phaseInput(
          phase,
          phase.items[0],
          idOf(phase.items[0].price)!,
          phase.start_date,
          subscriptionItem.current_period_end,
        ),
        phaseInput(
          phase,
          phase.items[0],
          input.preview.targetPriceId,
          subscriptionItem.current_period_end,
        ),
      ],
    });
  } catch (error) {
    await input.stripe.subscriptionSchedules.release(schedule.id);
    throw error;
  }
  return {
    scheduleId: schedule.id,
    effectiveAt: subscriptionItem.current_period_end,
  };
}

export async function undoScheduledPersonalChange(input: {
  stripe: { subscriptionSchedules: ScheduleGateway };
  subscription: SchedulableSubscription;
  customerId: string;
}): Promise<void> {
  const scheduleId =
    typeof input.subscription.schedule === "string"
      ? input.subscription.schedule
      : input.subscription.schedule?.id;
  if (!scheduleId)
    throw new ScheduledChangeError(
      "There is no scheduled plan change to undo.",
      404,
    );
  if (idOf(input.subscription.customer) !== input.customerId)
    throw new ScheduledChangeError(
      "This subscription does not belong to your billing account.",
      403,
    );
  const schedule =
    await input.stripe.subscriptionSchedules.retrieve(scheduleId);
  if (
    idOf(schedule.customer) !== input.customerId ||
    idOf(schedule.subscription) !== input.subscription.id
  )
    throw new ScheduledChangeError(
      "This scheduled change does not belong to your billing account.",
      403,
    );
  if (schedule.metadata?.purpose !== "matrx_personal_plan_change")
    throw new ScheduledChangeError(
      "This scheduled change was not created here, so it cannot be undone here. Manage it in billing instead.",
      409,
    );
  await input.stripe.subscriptionSchedules.release(scheduleId);
}
