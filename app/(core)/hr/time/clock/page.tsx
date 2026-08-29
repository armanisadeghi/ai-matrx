// Route 34 — `/hr/time/clock`. The shared desk clock for a manager or a front-desk machine
// (SPEC-UI-IA §3.4 row 34, SPEC-TIME §2.1).
//
// 🚨 NOT a kiosk. It runs inside the app shell, under the operator's own login, and every punch it
// writes is stamped `actor_type='manager'` with the operator as the actor. The kiosk is routes 35
// and 36 in the `(kiosk)` group, which has no session and no way back into HR.
//
// 🚨 AND BECAUSE IT RUNS INSIDE THE APP SHELL, IT GETS THE APP SHELL. It mounted a bare
// `PageHeader`, so the one surface in HR whose whole premise is "you are signed in as yourself, on
// a shared machine" showed neither the HR nav nor the employer switcher — and had no builder and no
// link anywhere, making it reachable only by typing the URL.

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { DeskClockSurface } from "@/features/hr/time/clock/DeskClockSurface";
import { mockCaseFromParam } from "@/features/hr/time/clock/mockCaseParam";

export const metadata = { title: "Shared time clock" };

export default async function DeskClockPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; punchCase?: string }>;
}) {
  const params = await searchParams;

  return (
    <HrTimeShell title="Shared time clock">
      <DeskClockSurface
        mockCase={mockCaseFromParam(params.case)}
        punchMockCase={mockCaseFromParam(params.punchCase)}
      />
    </HrTimeShell>
  );
}
