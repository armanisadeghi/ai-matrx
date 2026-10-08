"use client";

/**
 * The waiting spend-approval count for a nav entry or button: a small pill when anything waits,
 * nothing otherwise (fixed slot width so the label never shifts). orgId null = every organization
 * (platform admin seat); a refusal or failure renders nothing — the page itself says why.
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
  if (!n) return null;
  return (
    <span
      className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold tabular-nums text-white"
      title={`${n} waiting for approval`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
