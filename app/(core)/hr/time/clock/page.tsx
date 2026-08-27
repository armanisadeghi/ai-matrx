// Route 34 — `/hr/time/clock`. The shared desk clock for a manager or a front-desk machine
// (SPEC-UI-IA §3.4 row 34, SPEC-TIME §2.1).
//
// 🚨 NOT a kiosk. It runs inside the app shell, under the operator's own login, and every punch it
// writes is stamped `actor_type='manager'` with the operator as the actor. The kiosk is routes 35
// and 36 in the `(kiosk)` group, which has no session and no way back into HR.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { DeskClockSurface } from "@/features/hr/time/clock/DeskClockSurface";
import { mockCaseFromParam } from "@/features/hr/time/clock/mockCaseParam";

export default async function DeskClockPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; punchCase?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium text-foreground">Shared time clock</span>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DeskClockSurface
            mockCase={mockCaseFromParam(params.case)}
            punchMockCase={mockCaseFromParam(params.punchCase)}
          />
        </div>
      </div>
    </>
  );
}
