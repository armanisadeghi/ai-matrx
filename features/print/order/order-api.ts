/**
 * Transport for the print-order lane (`/lulu/orders*`) — contract-bound, like
 * everything else in this folder. The flow is Arman's ruled money model:
 * the server captures the live quote + the buyer's plan markup and answers
 * with a REAL Stripe Checkout URL; payment fulfils the order server-side
 * (place at Lulu), and a rejection auto-refunds. This file only moves the
 * typed shapes — no pricing math, no status invention.
 */

import { apiGet, apiPost, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

export type PrintOrder = components["schemas"]["PrintOrderPublic"];
export type PrintOrderCheckout = components["schemas"]["PrintOrderCheckout"];
export type PrintOrderCreate = components["schemas"]["PrintOrderCreateRequest"];

export async function createOrder(
  body: PrintOrderCreate,
  signal?: AbortSignal,
): Promise<PrintOrderCheckout> {
  const { data } = await apiPost("/lulu/orders", body, {
    signal,
    captureErrors: false,
  });
  return data;
}

export async function listOrders(signal?: AbortSignal): Promise<PrintOrder[]> {
  const { data } = await apiGet("/lulu/orders", { signal, captureErrors: false });
  return data;
}

export async function cancelOrder(orderId: string): Promise<PrintOrder> {
  const { data } = await apiPost(
    buildPath("/lulu/orders/{order_id}/cancel", { order_id: orderId }),
    // The cancel endpoint takes no body; the path carries everything.
    undefined as never,
    { captureErrors: false },
  );
  return data;
}

/** Orders a buyer can still back out of (refund + stop production). */
export function isCancelable(order: PrintOrder): boolean {
  return ["pending_payment", "paid", "placed"].includes(order.status);
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: "Awaiting payment",
  payment_expired: "Payment expired",
  paid: "Paid",
  placing: "Placing",
  placed: "Placed",
  in_production: "Printing",
  shipped: "Shipped",
  delivered: "Delivered",
  rejected: "Rejected",
  refund_due: "Refund on the way",
  refunded: "Refunded",
  canceled: "Canceled",
  fulfillment_failed: "Needs attention",
};
