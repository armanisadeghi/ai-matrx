import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeaveLedgerSurface } from "@/features/hr/leave/manager/LeaveLedgerSurface";

/**
 * Route 44a (SPEC-LEAVE §12, §18 AR-6) — the ledger audit view for one employment on one
 * policy. The same component `/hr/me/time-off/[policyId]` renders, with `viewer="delegated"`.
 *
 * The subject's NAME is deliberately kept out of the tab title: a browser tab reading
 * "Dana Ruiz | Time off" discloses whose balance is being audited to anyone glancing at the
 * screen.
 */
export const metadata = { title: "Leave ledger" };

export default async function Page({
  params,
}: {
  params: Promise<{ employmentId: string; policyId: string }>;
}) {
  const { employmentId, policyId } = await params;
  return (
    <Suspense fallback={<HrLoading variant="table" rows={8} />}>
      <LeaveLedgerSurface employmentId={employmentId} policyId={policyId} />
    </Suspense>
  );
}
