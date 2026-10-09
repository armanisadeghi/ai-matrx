// The billing-account read contract.  Financial facts come from the Stripe
// mirror; entitlement resolution remains a separate concern.

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import { billingSubscriptionSelectionPasses, terminalBillingSubscriptionStatuses } from "./billing-subscription-selection";
import { formatMoney } from "@ai-matrx/kit/format";

export type BillingScope =
  | { kind: "personal"; userId: string }
  | { kind: "organization"; organizationId: string };

export type BillingSubscription = Pick<
  Database["billing"]["Tables"]["subscription"]["Row"],
  | "id"
  | "plan_key"
  | "price_id"
  | "status"
  | "current_period_end"
  | "cancel_at_period_end"
  | "beneficiary_user_id"
>;

export type BillingPrice = Pick<
  Database["billing"]["Tables"]["price"]["Row"],
  "unit_amount" | "currency" | "interval" | "interval_count"
>;

export type BillingSummaryRead =
  | { ok: true; subscription: BillingSubscription | null; price: BillingPrice | null }
  | { ok: false; reason: string };

/**
 * Reads only the signed-in person's owned Stripe mirror row. Personal billing
 * is keyed by beneficiary; organization billing is keyed by the named member
 * organization. It deliberately never consults active organization state.
 */
export async function readBillingSummary(
  scope: BillingScope,
  livemode: boolean,
): Promise<BillingSummaryRead> {
  try {
    const billing = createClient().schema("billing");
    const subscriptionQuery = () => {
      let query = billing
        .from("subscription")
        .select("id,plan_key,price_id,status,current_period_end,cancel_at_period_end,beneficiary_user_id")
        .eq("livemode", livemode);
      return scope.kind === "personal"
        ? query.eq("beneficiary_user_id", scope.userId)
        : query.eq("organization_id", scope.organizationId).is("beneficiary_user_id", null);
    };

    let subscription: BillingSubscription | null = null;
    for (const pass of billingSubscriptionSelectionPasses) {
      const candidateQuery = pass.terminal
        ? subscriptionQuery().in("status", [...terminalBillingSubscriptionStatuses])
        : subscriptionQuery().neq("status", terminalBillingSubscriptionStatuses[0]).neq("status", terminalBillingSubscriptionStatuses[1]);
      const { data, error } = await candidateQuery
        .order("current_period_end", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { ok: false, reason: error.message || "Billing could not be read." };
      if (data) {
        subscription = data;
        break;
      }
    }
    if (!subscription?.price_id) return { ok: true, subscription, price: null };

    const { data: price, error: priceError } = await billing
      .from("price")
      .select("unit_amount,currency,interval,interval_count")
      .eq("id", subscription.price_id)
      .maybeSingle();
    if (priceError) return { ok: false, reason: priceError.message || "Billing price could not be read." };
    return { ok: true, subscription, price };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Billing could not be read." };
  }
}

export function billingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Active",
    trialing: "Trial",
    past_due: "Payment due",
    unpaid: "Payment due",
    incomplete: "Payment pending",
    incomplete_expired: "Payment expired",
    canceled: "Canceled",
    paused: "Paused",
  };
  return labels[status] ?? status;
}

/** A scheduled cancellation is not a renewal; the date means a different thing. */
export function periodEndLabel(status: string, cancelAtPeriodEnd: boolean): "Ends" | "Renews" | "Paid through" | "Ended" {
  if (status === "canceled") return "Paid through";
  if (status === "incomplete_expired") return "Ended";
  return cancelAtPeriodEnd ? "Ends" : "Renews";
}

export function priceLabel(price: BillingPrice | null): string | null {
  if (!price || price.unit_amount == null) return null;
  const amount = formatMoney(price.unit_amount, { currency: price.currency, unit: "minor", digits: "whole" });
  if (!price.interval) return amount;
  const count = price.interval_count > 1 ? `${price.interval_count} ${price.interval}s` : price.interval;
  return `${amount} / ${count}`;
}
