export type CheckoutStatus = "active" | "pending" | "unavailable";

export interface CheckoutStatusResponse {
  status: CheckoutStatus;
  message?: string;
}

export interface CheckoutReturnContext {
  kind: "success" | "cancelled";
  sessionId?: string;
  planKey?: string;
  cycle?: "monthly" | "annual";
  audience?: "personal" | "company";
}

export interface CheckoutReturnSelection {
  planKey: string;
  cycle: "monthly" | "annual";
  audience: "personal" | "company";
}

interface ReturnedCheckoutSession {
  id: string;
  mode: string | null;
  status: string | null;
  clientReferenceId: string | null;
  purpose: string | undefined;
  planKey: string | undefined;
  cycle: string | undefined;
  paymentStatus: string;
  hasSubscription: boolean;
}

/** The return URL carries selection state plus Stripe's exact session placeholder. */
export function checkoutReturnUrls(
  origin: string,
  selection: CheckoutReturnSelection,
) {
  const query = new URLSearchParams({
    plan: selection.planKey,
    cycle: selection.cycle,
    audience: selection.audience,
  });
  return {
    success: `${origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}&${query}`,
    cancelled: `${origin}/pricing?checkout=cancelled&${query}`,
  };
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

export function checkoutReturnContext(
  search: Pick<URLSearchParams, "get">,
): CheckoutReturnContext | null {
  const kind = checkoutReturnKind(search);
  if (!kind) return null;
  const planKey = search.get("plan") ?? undefined;
  const cycle = search.get("cycle") === "annual" ? "annual" : "monthly";
  const audience =
    search.get("audience") === "company" ? "company" : "personal";
  if (kind === "cancelled") return { kind, planKey, cycle, audience };
  const sessionId = search.get("session_id");
  if (!sessionId?.startsWith("cs_")) return null;
  return { kind, sessionId, planKey, cycle, audience };
}

/** The server calls this after retrieving the exact session from Stripe. */
export function isVerifiedCheckoutSession(
  expectedSessionId: string,
  userId: string,
  session: ReturnedCheckoutSession,
): boolean {
  return (
    session.id === expectedSessionId &&
    session.mode === "subscription" &&
    session.status === "complete" &&
    session.clientReferenceId === userId &&
    session.purpose === "platform_subscription" &&
    Boolean(session.planKey) &&
    (session.cycle === "monthly" || session.cycle === "annual") &&
    (session.paymentStatus === "paid" ||
      session.paymentStatus === "no_payment_required") &&
    session.hasSubscription
  );
}
