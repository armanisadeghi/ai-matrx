export type CheckoutStatus = "active" | "pending" | "unavailable";

export interface CheckoutStatusResponse {
  status: CheckoutStatus;
  message?: string;
}

/** Parse only the deliberately small contract returned by checkout-status. */
export function parseCheckoutStatus(
  value: unknown,
): CheckoutStatusResponse | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.status !== "active" &&
    record.status !== "pending" &&
    record.status !== "unavailable"
  )
    return null;
  return {
    status: record.status,
    ...(typeof record.message === "string" ? { message: record.message } : {}),
  };
}

/** URL success is a return hint, never an activation verdict. */
export function checkoutReturnKind(
  search: Pick<URLSearchParams, "get">,
): "success" | "cancelled" | null {
  const checkout = search.get("checkout");
  return checkout === "success" || checkout === "cancelled" ? checkout : null;
}
