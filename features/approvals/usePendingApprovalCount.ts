"use client";

/**
 * How many proposals are waiting on THIS person — the shell's badge.
 *
 * One head-only count per kind against the store, no rows on the wire, so the
 * badge costs nothing to be honest. It counts the SAME rows the queue shows (the
 * complete pending read, snoozed included — snoozing is a chip concept and a
 * person who snoozed a chip has not decided anything), and it counts only kinds
 * that can read on a person-scoped mount: the keyword kinds live on each site's
 * own queue and say so there (`ApprovalKind.scopeRequirement`).
 *
 * 0 renders NO badge — never a grey zero, which reads as a broken control.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { APPROVAL_SURFACE } from "./data";

export const PENDING_APPROVALS_QUERY_KEY = ["approvals", "pending-count"];

async function countPending(userId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .schema("platform")
    .from("assists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("surface_name", APPROVAL_SURFACE)
    .eq("status", "pending")
    .is("deleted_at", null);
  if (error) {
    // The badge is a signal, not a screen: it must not throw into the shell.
    // It reports the failure and shows nothing rather than a confident 0.
    throw new Error(`[approvals] pending count failed: ${error.message}`);
  }
  return count ?? 0;
}

export function usePendingApprovalCount(): {
  count: number;
  unknown: boolean;
} {
  const userId = useAppSelector(selectUserId);
  const query = useQuery({
    queryKey: [...PENDING_APPROVALS_QUERY_KEY, userId],
    queryFn: () => countPending(userId ?? ""),
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
