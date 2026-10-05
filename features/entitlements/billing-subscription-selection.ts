export const terminalBillingSubscriptionStatuses = ["canceled", "incomplete_expired"] as const;

type SubscriptionCandidate = {
  id: string;
  status: string;
  current_period_end: string | null;
  updated_at: string;
};

export function isTerminalBillingSubscription(status: string): boolean {
  return (terminalBillingSubscriptionStatuses as readonly string[]).includes(status);
}

/**
 * Keeps subscription precedence identical for the client mirror reader and
 * the server-side recovery reader. A live subscription always beats history;
 * dates and ids make ties deterministic.
 */
export function selectPreferredBillingSubscription<T extends SubscriptionCandidate>(
  subscriptions: readonly T[],
): T | null {
  return [...subscriptions].sort((left, right) => {
    const terminalDifference = Number(isTerminalBillingSubscription(left.status)) - Number(isTerminalBillingSubscription(right.status));
    if (terminalDifference !== 0) return terminalDifference;
    const periodDifference = (right.current_period_end ?? "").localeCompare(left.current_period_end ?? "");
    if (periodDifference !== 0) return periodDifference;
    const updatedDifference = right.updated_at.localeCompare(left.updated_at);
    if (updatedDifference !== 0) return updatedDifference;
    return right.id.localeCompare(left.id);
  })[0] ?? null;
}

/** Each pass returns a single ordered row; no reader truncates a broad history. */
export const billingSubscriptionSelectionPasses = [
  { terminal: false },
  { terminal: true },
] as const;
