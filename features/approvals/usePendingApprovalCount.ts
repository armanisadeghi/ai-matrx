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
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { countPendingProposals } from "./data";
import { mountedApprovalKinds } from "./rendered";
import { APPROVAL_KINDS } from "./registry";

export const PENDING_APPROVALS_QUERY_KEY = ["approvals", "pending-count"];

export function usePendingApprovalCount(): {
  count: number;
  unknown: boolean;
} {
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectActiveOrganizationId);
  // The badge stands for the `/approvals` mount, so it counts that mount's kinds.
  const mounted = mountedApprovalKinds(APPROVAL_KINDS, {
    key: userId ?? "",
    organizationId,
    userId,
  });
  const query = useQuery({
    queryKey: [...PENDING_APPROVALS_QUERY_KEY, userId],
    queryFn: () => countPendingProposals(userId ?? "", mounted),
    enabled: Boolean(userId),
    staleTime: 60_000,
    // A count that cannot be read is UNKNOWN, and the caller shows no badge —
    // "0" would be a claim nobody verified.
    retry: 1,
  });
  return {
    count: query.data ?? 0,
    unknown: query.isError || query.data === undefined,
  };
}
