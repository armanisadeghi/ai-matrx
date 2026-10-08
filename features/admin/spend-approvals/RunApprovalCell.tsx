"use client";

/**
 * The approval-status cell every spend board shares (agent spend board, automation costs,
 * system jobs, triggers): Waiting / Approved / Rejected linking to the approval, or
 * "Under $N" (N = the threshold of the subject's organization) when no run crossed it. One fetch per seat.
 */
import Link from "next/link";
import { Badge } from "@ai-matrx/design-system/controls";
import {
  APPROVAL_STATUS_LABEL,
  approvalFor,
  approvalHref,
  underThresholdLabel,
  useApprovalStatusIndex,
  useApprovalThreshold,
  type ApprovalSeat,
  type ApprovalStatus,
} from "./spendApprovals";

const TONE: Record<ApprovalStatus, "warning" | "success" | "destructive"> = {
  waiting: "warning",
  approved: "success",
  rejected: "destructive",
};

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
  if (error) return <span className="text-xs text-destructive" title={error}>Unavailable</span>;
  if (!index) return <span className="inline-block h-4 w-14 animate-pulse rounded bg-muted/50" />;
  const hit = approvalFor(index, subjects);
  if (hit) {
    return (
      <Link href={approvalHref(hit.id, seat, orgSlug)} className="hover:underline">
        <Badge tone={TONE[hit.status]}>{APPROVAL_STATUS_LABEL[hit.status]}</Badge>
      </Link>
    );
  }
  if (maxRunCost != null && threshold != null && maxRunCost <= threshold) {
    return <span className="text-xs text-muted-foreground">{underThresholdLabel(threshold)}</span>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}
