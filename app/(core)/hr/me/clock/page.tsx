// Route 6 — `/hr/me/clock`. The employee's own web punch (SPEC-UI-IA §3.4 row 6, SPEC-TIME §2.1).
//
// Mobile-first (UI-IA §7): this is one of the three HR surfaces that must be genuinely excellent on
// a phone, because hourly employees will use it on phones on day one, months before any native app.
// The body owns its own scroll chain — `flex flex-col` all the way down to the `min-h-0 flex-1`
// scroller, which is the only shape `pnpm check:scroll-chain` accepts.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { MyClockSurface } from "@/features/hr/time/clock/MyClockSurface";
import { mockCaseFromParam } from "@/features/hr/time/clock/mockCaseParam";

export default async function MyClockPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium text-foreground">My time clock</span>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MyClockSurface mockCase={mockCaseFromParam(params.case)} />
        </div>
      </div>
    </>
  );
}
