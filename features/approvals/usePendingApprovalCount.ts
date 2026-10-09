"use client";

/**
 * How many proposals are waiting on THIS person — the shell's badge.
 *
 * 🚨 ONE READER, AND ONE PREDICATE. The count comes from
 * `countPendingProposals` in the store seam, asking the same "will this row
 * render" question (`./rendered.ts`) over the same kinds the `/approvals` mount
 * carries — `mountedApprovalKinds(APPROVAL_KINDS, this person's scope)`, which is
 * literally the filter the queue applies. A badge counted in SQL counted rows
 * the queue drops (Bugbot HIGH, frontend PR 228), and a badge that narrowed only
 * the ACTION still counted a row whose `proposalKind` no registered kind renders
 * — "1 waiting" over an empty screen, a second way (round-2 verification § A-i).
 *
 * It counts the SAME rows the queue shows (the complete pending read, snoozed
 * included — snoozing is a chip concept and a person who snoozed a chip has not
 * decided anything), and only kinds that can read on a person-scoped mount: the
 * keyword kinds live on each site's own queue and say so there
 * (`ApprovalKind.scopeRequirement`).
 *
 * 0 renders NO badge — never a grey zero, which reads as a broken control.
 */

import { useQuery } from "@tanstack/react-query";
import { useIdleReady } from "@ai-matrx/kit/idle-scheduler";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { countPendingProposals } from "./data";
import { countStoreApprovals } from "./store-door";
import { mountedApprovalKinds } from "./rendered";
import { APPROVAL_KINDS } from "./registry";
// 🚨 `PENDING_APPROVALS_QUERY_KEY` and `invalidateApprovals` now live in
// `./queryKeys` — a LEAF module with no import of `./registry` or `./data` —
// re-exported here for every existing caller of this module. A kind module
// (downstream of `./registry`) must import them from `./queryKeys` directly,
// never from here: importing THIS module from a kind closes a cycle back
// through `./registry` → `./kinds/*` (see `./queryKeys` for the incident).
import {
  invalidateApprovals,
  PENDING_APPROVALS_QUERY_KEY,
} from "./queryKeys";

export { PENDING_APPROVALS_QUERY_KEY, invalidateApprovals };

export function usePendingApprovalCount(): {
  count: number;
  unknown: boolean;
  /**
   * The record store's share of `count` — the `custom.work_inbox` decisions the `store_change`
   * kind lists. The bell also counts them through `custom.inbox_counts`, so its sum subtracts
   * this to count each waiting change once.
   */
  storeCount: number;
} {
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectActiveOrganizationId);
  // The shell's header badge mounts on every page: both counts wait for the idle flush.
  const idleReady = useIdleReady();
  // The badge stands for the `/approvals` mount, so it counts that mount's kinds.
  const scope = {
    key: userId ?? "",
    organizationId,
    userId,
  };
  const mounted = mountedApprovalKinds(APPROVAL_KINDS, scope);
  const query = useQuery({ // org-filter: server-call the organization only decides which kinds can act through an org-scoped server call; rows are never matched on it
    queryKey: [...PENDING_APPROVALS_QUERY_KEY, userId],
    // The badge's count is judged against the SAME mount the `/approvals` page
    // is — its kinds AND its scope (Bugbot round 10 #1).
    queryFn: () => countPendingProposals(userId ?? "", mounted, scope), // org-filter: server-call the organization only decides which kinds can act through an org-scoped server call; rows are never matched on it
    enabled: Boolean(userId) && idleReady,
    staleTime: 60_000,
    // A count that cannot be read is UNKNOWN, and the caller shows no badge —
    // "0" would be a claim nobody verified.
    retry: 1,
  });
  // THE STORE'S SHARE, counted by the same read and the same filter the `store_change` kind
  // lists with (`./store-door`), across every organization the person belongs to.
  const store = useQuery({
    queryKey: [...PENDING_APPROVALS_QUERY_KEY, "store", userId],
    queryFn: () => countStoreApprovals(userId ?? ""),
    enabled: Boolean(userId) && idleReady,
    staleTime: 60_000,
    retry: 1,
  });
  const unknown =
    query.isError || query.data === undefined || store.isError || store.data === undefined;
  return {
    count: (query.data ?? 0) + (store.data ?? 0),
    unknown,
    storeCount: store.data ?? 0,
  };
}
