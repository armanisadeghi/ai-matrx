"use client";

/**
 * The approval-status cell every spend board shares (agent spend board, automation costs,
 * system jobs, triggers): Waiting / Approved / Rejected linking to the approval, or
 * "Under $N" (N = the threshold of the subject's organization) when no run crossed it. One fetch per seat.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { ApprovalStatusSelect } from "./ApprovalStatusSelect";
import {
  APPROVAL_STATUS_LABEL,
  approvalFor,
  approvalHref,
  decideSpendApproval,
  refreshApprovalStatus,
  underThresholdLabel,
  useApprovalStatusIndex,
  useApprovalThreshold,
  type ApprovalSeat,
  type ApprovalStatus,
} from "./spendApprovals";

const DOT: Record<ApprovalStatus, string> = {
  waiting: "bg-warning",
  approved: "bg-success",
  rejected: "bg-destructive",
};

/** An approval status as plain text with a small status dot — never a bordered pill in a table row. */
export function ApprovalStatusText({ status }: { status: ApprovalStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[status]}`} />
      {APPROVAL_STATUS_LABEL[status]}
    </span>
  );
}

export function RunApprovalCell({
  orgId,
  subjects,
  maxRunCost,
  seat,
  orgSlug,
  thresholdOrgId,
}: {
  /** null = every organization (platform admin seat). */
  orgId: string | null;
  /** [subject_kind, subject_id], most specific first. */
  subjects: [string, string | null | undefined][];
  maxRunCost: number | null | undefined;
  seat: ApprovalSeat;
  orgSlug?: string;
  /** The subject's own organization, for its threshold; null = platform default. */
  thresholdOrgId?: string | null;
}) {
  const { index, error } = useApprovalStatusIndex(orgId);
  const threshold = useApprovalThreshold(thresholdOrgId ?? orgId);
  const hit = approvalFor(index, subjects);
  // Optimistic status for this cell; cleared when the shared index is replaced or the write is refused.
  const [optimistic, setOptimistic] = useState<ApprovalStatus | null>(null);
  useEffect(() => setOptimistic(null), [index]);
  if (error) return <span className="text-xs text-destructive" title={error}>Unavailable</span>;
  if (!index) return <span className="inline-block h-4 w-14 animate-pulse rounded bg-muted/50" />;
  if (hit && hit.can_decide) {
    return (
      <ApprovalStatusSelect
        status={optimistic ?? hit.status}
        name={hit.subject_name ?? subjects.find(([, id]) => id)?.[1] ?? "this subject"}
        costPerRun={hit.avg_cost_since ?? hit.first_run_cost}
        estMonthly={hit.est_monthly_cost}
        onDecide={async (decision, next, note) => {
          const before = optimistic;
          setOptimistic(next);
          try {
            await decideSpendApproval(hit.id, decision, { note });
            toast.success(`${APPROVAL_STATUS_LABEL[next]}: ${hit.subject_name ?? "approval"}`);
            void refreshApprovalStatus(orgId).catch(() => undefined);
          } catch (e: unknown) {
            setOptimistic(before);
            toast.error(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    );
  }
  if (hit) {
    return (
      <Link href={approvalHref(hit.id, seat, orgSlug)} className="hover:underline">
        <ApprovalStatusText status={hit.status} />
      </Link>
    );
  }
  if (maxRunCost != null && threshold != null && maxRunCost <= threshold) {
    return <span className="whitespace-nowrap text-xs text-muted-foreground">{underThresholdLabel(threshold)}</span>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}
