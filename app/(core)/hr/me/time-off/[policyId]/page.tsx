// `/hr/me/time-off/[policyId]` — SPEC-LEAVE §12, the employee's own leave ledger.
//
// 🚨 THE SAME COMPONENT THE MANAGER SURFACE USES. §12 declares two routes over one
// view: `/hr/leave/balances/[employmentId]/[policyId]` for `hr_admin`,
// `payroll_admin` and the manager, and this one for the employee, `viewer=self`.
// Both mount `LeaveLedgerView`; only the doors out differ, and those are passed
// in. A second ledger table for the other viewer is the drift this prevents.
//
// The employment is NOT in this URL and must not be: the shell resolves it as of
// today for the signed-in person, and `hr.leave_ledger_view` re-checks the viewer
// itself. A route that took an employment id here would be an access surface.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { MyLeaveLedgerSurface } from "@/features/hr/leave/components/MyLeaveLedgerSurface";
import { notFound } from "next/navigation";
import { isFullUuid } from "@/utils/supabase-search";

export const metadata = { title: "Time-off ledger" };

export default async function HrMeTimeOffLedgerPage({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const { policyId } = await params;

  // 🚨 A MALFORMED ID IN THE URL IS REFUSED HERE, BEFORE ANY READ. Postgres casts
  // the route text to `uuid` inside the door and raises `22P02`, which reached the
  // person as a sentence about a value in the wrong format — on a READ, with no
  // form on screen and nothing to save (D11). The three `/hr/people/[employeeId]`
  // routes were guarded on 2026-08-28; the other nine dynamic HR routes were not.
  if (!isFullUuid(policyId)) notFound();

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Time-off ledger</h1>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MyLeaveLedgerSurface policyId={policyId} />
        </div>
      </div>
    </>
  );
}
