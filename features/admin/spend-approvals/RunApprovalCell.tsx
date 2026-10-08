"use client";

/**
 * The approval-status cell every spend board shares (agent spend board, automation costs,
 * system jobs, triggers): Waiting / Approved / Rejected linking to the approval, or
 * "Under $1" when no run crossed the threshold (auto-approved). One fetch per seat.
 */
import Link from "next/link";
import { Badge } from "@ai-matrx/design-system/controls";
import { SPEND_FLAG_LIMITS } from "@/features/scheduling/service/automationCosts";
import {
  APPROVAL_STATUS_LABEL,
  approvalFor,
  approvalHref,
  useApprovalStatusIndex,
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
}: {
  /** null = every organization (platform admin seat). */
  orgId: string | null;
  /** [subject_kind, subject_id], most specific first. */
  subjects: [string, string | null | undefined][];
  maxRunCost: number | null | undefined;
  seat: ApprovalSeat;
  orgSlug?: string;
}) {
  const { index, error } = useApprovalStatusIndex(orgId);
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
  if (maxRunCost != null && maxRunCost <= SPEND_FLAG_LIMITS.runCostUsd) {
    return <span className="text-xs text-muted-foreground" title="No run crossed the approval threshold">Under $1</span>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}
