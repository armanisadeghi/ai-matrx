import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeaveLedgerSurface } from "@/features/hr/leave/manager/LeaveLedgerSurface";
import { notFound } from "next/navigation";
import { isFullUuid } from "@/utils/supabase-search";

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

  // 🚨 A MALFORMED ID IN THE URL IS REFUSED HERE, BEFORE ANY READ. Postgres casts
  // the route text to `uuid` inside the door and raises `22P02`, which reached the
  // person as a sentence about a value in the wrong format — on a READ, with no
  // form on screen and nothing to save (D11). The three `/hr/people/[employeeId]`
  // routes were guarded on 2026-08-28; the other nine dynamic HR routes were not.
  if (!isFullUuid(employmentId) || !isFullUuid(policyId)) notFound();
  return (
    <Suspense fallback={<HrLoading variant="table" rows={8} />}>
      <LeaveLedgerSurface employmentId={employmentId} policyId={policyId} />
    </Suspense>
  );
}
