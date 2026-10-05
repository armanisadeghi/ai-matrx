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

export type SchedulableSubscriptionItem = {
  id: string;
  quantity: number | null;
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
  const copy = <T>(value: T | null | undefined): T | undefined =>
    value ?? undefined;
  if (item.billing_thresholds)
    throw new ScheduledChangeError(
      "This subscription uses billing thresholds, which cannot be safely carried into a scheduled plan change. Manage it in billing instead.",
    );
  const phaseItem = {
    price: priceId,
    quantity: item.quantity ?? 1,
    ...(item.discounts.length
      ? {
          discounts: item.discounts.map((discount) => ({
            ...(idOf(discount.discount)
              ? { discount: idOf(discount.discount)! }
              : {}),
            ...(idOf(discount.coupon)
              ? { coupon: idOf(discount.coupon)! }
              : {}),
            ...(idOf(discount.promotion_code)
              ? { promotion_code: idOf(discount.promotion_code)! }
              : {}),
          })),
        }
      : {}),
    ...(copy(item.metadata) ? { metadata: item.metadata! } : {}),
    ...(item.tax_rates?.length
      ? { tax_rates: item.tax_rates.map((rate) => idOf(rate)!).filter(Boolean) }
      : {}),
  };
  const result: PhaseInput = {
    items: [phaseItem],
    start_date: startDate,
    ...(endDate ? { end_date: endDate } : {}),
    ...(copy(phase.application_fee_percent)
      ? { application_fee_percent: phase.application_fee_percent! }
      : {}),
    ...(copy(phase.automatic_tax)
      ? { automatic_tax: phase.automatic_tax! }
      : {}),
    ...(copy(phase.billing_cycle_anchor)
      ? { billing_cycle_anchor: phase.billing_cycle_anchor! }
      : {}),
    ...(copy(phase.billing_thresholds)
      ? { billing_thresholds: phase.billing_thresholds! }
      : {}),
    ...(copy(phase.collection_method)
      ? { collection_method: phase.collection_method! }
      : {}),
    ...(copy(phase.currency) ? { currency: phase.currency } : {}),
    ...(idOf(phase.default_payment_method)
      ? { default_payment_method: idOf(phase.default_payment_method)! }
      : {}),
    ...(phase.default_tax_rates?.length
      ? {
          default_tax_rates: phase.default_tax_rates
            .map((rate) => idOf(rate)!)
            .filter(Boolean),
        }
      : {}),
    ...(copy(phase.description) ? { description: phase.description! } : {}),
    ...(phase.discounts.length
      ? {
          discounts: phase.discounts.map((discount) => ({
            ...(idOf(discount.discount)
              ? { discount: idOf(discount.discount)! }
              : {}),
            ...(idOf(discount.coupon)
              ? { coupon: idOf(discount.coupon)! }
              : {}),
            ...(idOf(discount.promotion_code)
              ? { promotion_code: idOf(discount.promotion_code)! }
              : {}),
          })),
        }
      : {}),
    ...(copy(phase.invoice_settings)
      ? { invoice_settings: phase.invoice_settings! }
      : {}),
    ...(copy(phase.metadata) ? { metadata: phase.metadata! } : {}),
    ...(idOf(phase.on_behalf_of)
      ? { on_behalf_of: idOf(phase.on_behalf_of)! }
      : {}),
    proration_behavior: "none",
    ...(copy(phase.transfer_data)
      ? {
          transfer_data: {
            ...phase.transfer_data!,
            destination: idOf(phase.transfer_data!.destination)!,
          },
        }
      : {}),
    ...(phase.trial ? { trial: true } : {}),
    ...(phase.trial_end ? { trial_end: phase.trial_end } : {}),
  };
  return result;
}

export async function createScheduledPersonalChange(input: {
  stripe: Pick<Stripe, "subscriptionSchedules">;
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
  stripe: Pick<Stripe, "subscriptionSchedules">;
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
    schedule.subscription !== input.subscription.id
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
