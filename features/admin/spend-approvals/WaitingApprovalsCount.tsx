"use client";

/**
 * The waiting spend-approval count for a nav entry or button. The slot is always rendered at a
 * fixed width, so the count arriving (or being zero) never moves its neighbours. orgId null =
 * every organization (platform admin seat); a refusal or failure leaves the slot empty.
 */
import { useEffect, useState } from "react";
import { fetchWaitingApprovalCount } from "./spendApprovals";

export function WaitingApprovalsCount({ orgId }: { orgId: string | null }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetchWaitingApprovalCount(orgId)
      .then((v) => live && setN(v))
      .catch(() => live && setN(null));
    return () => {
      live = false;
    };
  }, [orgId]);
  return (
    <span
      data-testid="waiting-approvals-slot"
      className="ml-auto inline-flex h-4 w-7 shrink-0 items-center justify-center"
      aria-hidden={!n}
    >
      {n ? (
        <span
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold tabular-nums text-white"
          title={`${n} waiting`}
        >
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </span>
  );
}
