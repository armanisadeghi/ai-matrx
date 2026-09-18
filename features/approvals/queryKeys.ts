/**
 * THE APPROVALS QUERY-KEY ROOT AND THE ONE INVALIDATION every decision path
 * calls (Bugbot MEDIUM, frontend PR 228, comment 4041625792 — "Approval badge
 * stays stale after decisions").
 *
 * 🚨 A LEAF MODULE, ON PURPOSE — it imports nothing from `./registry` or
 * `./data`. Every kind module (`./kinds/*`) sits downstream of `./registry`
 * (which imports every kind to build `APPROVAL_KINDS`), so a decision path
 * that needs this helper would otherwise import it from
 * `./usePendingApprovalCount` — which itself imports `./registry` — closing a
 * cycle back through `./kinds/sheet-write` → `./kinds/google-proposal`. Under
 * ts-jest/CommonJS interop that cycle left `APPROVAL_KINDS` holding `undefined`
 * entries at import time (every google-kinds test failed with "Cannot read
 * properties of undefined"), so this file exists to be importable from a kind
 * module with NOTHING upstream of it.
 *
 * A kind's own query key (`["approvals", kindId, …]`) shares the `"approvals"`
 * WORD with the badge's key but not its PREFIX — `["approvals", kindId]` and
 * `["approvals", "pending-count"]` are siblings, not parent/child, so
 * `invalidateQueries({ queryKey: kindKey })` (a prefix match) never touches the
 * badge's query, which then sat on its `staleTime: 60_000` for up to a minute
 * after every approve/reject. Every kind whose rows live on the badge's
 * surface (`APPROVAL_SURFACE`) calls `invalidateApprovals` here, never a
 * hand-typed `invalidateQueries({ queryKey: PENDING_APPROVALS_QUERY_KEY })`, so
 * the fix lives once and a new kind inherits it by construction.
 */

import type { QueryClient } from "@tanstack/react-query";

export const PENDING_APPROVALS_QUERY_KEY = ["approvals", "pending-count"];

/**
 * `kindQueryKey` is optional so a caller that has only the badge to settle
 * (no kind-list query of its own) can still use one call.
 */
export function invalidateApprovals(
  client: QueryClient,
  kindQueryKey?: readonly unknown[],
): void {
  if (kindQueryKey) {
    void client.invalidateQueries({ queryKey: kindQueryKey });
  }
  void client.invalidateQueries({ queryKey: PENDING_APPROVALS_QUERY_KEY });
}
