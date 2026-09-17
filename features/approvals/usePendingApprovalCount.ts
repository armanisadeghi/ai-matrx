"use client";

/**
 * How many proposals are waiting on THIS person — the shell's badge.
 *
 * 🚨 ONE READER. The count comes from `countPendingProposals` in the store seam,
 * which narrows every pending row on this surface exactly as the queue's kinds
 * do — because a badge counted in SQL counts rows the queue drops, and "3
 * waiting" over an empty screen is the badge lying (Bugbot HIGH, frontend PR
 * 228). It counts the SAME rows the queue shows (the complete pending read,
 * snoozed included — snoozing is a chip concept and a person who snoozed a chip
 * has not decided anything), and only kinds that can read on a person-scoped
 * mount: the keyword kinds live on each site's own queue and say so there
 * (`ApprovalKind.scopeRequirement`).
 *
 * 0 renders NO badge — never a grey zero, which reads as a broken control.
 */

import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { countPendingProposals } from "./data";

export const PENDING_APPROVALS_QUERY_KEY = ["approvals", "pending-count"];

export function usePendingApprovalCount(): {
  count: number;
  unknown: boolean;
} {
  const userId = useAppSelector(selectUserId);
  const query = useQuery({
    queryKey: [...PENDING_APPROVALS_QUERY_KEY, userId],
    queryFn: () => countPendingProposals(userId ?? ""),
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
