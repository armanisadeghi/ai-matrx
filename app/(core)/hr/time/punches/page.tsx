import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { PunchRegister } from "@/features/hr/time/punches/PunchRegister";

/**
 * Route 30 — `/hr/time/punches` (SPEC-UI-IA §3.4 row 30, SPEC-TIME §2.5).
 *
 * AD-11's evidence lane. **Raw punches only** — no computed interval, no rounded figure, no total
 * appears anywhere on this page. That is the entire point of it existing separately.
 *
 * No `PageHeader`: `HrTimeShell` → `HrSubShell` → `HrShell` injects the route header, the HR nav,
 * the employer switcher and the section's tab bar, and owns the scroll chain. Until it did, this
 * register was reachable only by typing the URL — the "Time" nav item redirects to the timesheet
 * grid, and nothing on that grid linked here.
 */
export const metadata = { title: "Punch register" };

export default async function PunchRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ employment?: string; scope?: string }>;
}) {
  const { employment, scope } = await searchParams;

  return (
    <HrTimeShell title="Punch register">
      <Suspense fallback={<HrLoading variant="table" rows={8} />}>
        <PunchRegister
          employmentId={employment ?? null}
          orgScope={scope === "org"}
        />
      </Suspense>
    </HrTimeShell>
  );
}
