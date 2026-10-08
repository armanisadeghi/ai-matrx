// record-view: none — an admin approval register
// Billing › Spend approvals: every agent, mandate and automation whose single run cost more
// than the approval threshold, waiting first, with Approve / Reject (features/admin/spend-approvals).
// billing.run_approval_list(null) refuses anyone who is not a platform admin.
"use client";

import { Suspense } from "react";
import { SpendApprovalsBoard } from "@/features/admin/spend-approvals/SpendApprovalsBoard";

export default function SpendApprovalsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted/50" />}>
        <SpendApprovalsBoard orgId={null} seat="admin" />
      </Suspense>
    </div>
  );
}
