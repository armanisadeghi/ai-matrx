// features/hr/me/MyTimesheetContext.tsx
//
// Route 5's missing half: resolving "MY employment" and "the period I am in" so
// `/hr/me/timesheet` works when somebody simply clicks it.
//
// 🚨 WHY THIS IS L1's AND NOT THE TIME LANE'S. SPEC-EMPLOYEES §2.1 fixes exactly this for routes
// 4–9: they "mount inside `HrShell` with the same persona resolution, the same employer context,
// and the same identity header as route 2; they resolve the viewer's `employment_id` through
// `hr.employment_as_of(employee_id, current_date)` and **never** through
// `hr.employee.current_employment_id`". That resolution is the shell contract this lane owes the
// sibling pillars — the timesheet GRID is L3's and is not touched here.
//
// SPEC-TIME §2.2 writes the read as `hr.timesheet_get(self, current_period)`; the live door takes
// two concrete uuids. Rather than change a frozen contract, the two ids are resolved here and
// handed down.
//
// 🚨 IT READS THE PROVIDER, NOT THE DOOR. `hr_my_context` is already resolved once for the whole
// `/hr` tree by `<HrProvider>` in `app/(core)/hr/layout.tsx`. Calling it again here would be a
// second round trip and — worse — a second answer, which in a strictly single-employer module is
// a data-integrity problem rather than a performance one. `employment_id` on the active employer
// is the SERVER's as-of resolution (`hr._l1_self_employment` reads the live spell, never
// `current_employment_id`), so §2.1's rule is honoured at the source.
//
// 🚨 SEARCH PARAMS STILL WIN. A manager following a deep link, or anybody re-opening a specific
// period, passes `?employment=…&period=…` and gets exactly that. Resolution is the FALLBACK for
// the bare route, never an override of an explicit request.

"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/utils/supabase/client";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { MyTimesheet } from "@/features/hr/time/timesheet/MyTimesheet";

type Resolution =
  | { state: "resolving" }
  | { state: "ready"; employmentId: string; payPeriodId: string | null }
  | { state: "no-employment" }
  | { state: "no-period"; employmentId: string };

/**
 * The current pay period for one employment.
 *
 * `hr_pay_period_list` is the Time lane's own door, filtered to the employment and to the period
 * containing today. Returning `null` is a real answer — a brand-new hire whose first period has
 * not opened has no timesheet yet, and §2.2's `no-timesheet` state says so far better than an
 * error would.
 */
async function resolveCurrentPeriod(employmentId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("hr_pay_period_list" as never, {
    p_filters: { employment_id: employmentId, contains: new Date().toISOString().slice(0, 10) },
    p_page: { page: 1, pageSize: 1 },
  } as never);
  if (error) return null;

  const envelope =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  // A refusal is data, not a throw — and here it is indistinguishable from "no period", which is
  // the honest thing to render either way.
  if (envelope.ok === false) return null;

  const rows = Array.isArray(envelope.rows) ? envelope.rows : [];
  const first = rows[0];
  if (!first || typeof first !== "object") return null;
  const id = (first as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

export function MyTimesheetContext({
  employmentId: employmentParam,
  payPeriodId: periodParam,
}: {
  employmentId: string | null;
  payPeriodId: string | null;
}) {
  const { active, isLoading } = useHrContext();
  const [resolved, setResolved] = useState<Resolution>({ state: "resolving" });

  // Params win, always. When both are present nothing is resolved and nothing is fetched.
  const bothFromParams = Boolean(employmentParam && periodParam);
  const employmentId = employmentParam ?? active?.employment_id ?? null;

  useEffect(() => {
    if (bothFromParams) {
      setResolved({
        state: "ready",
        employmentId: employmentParam as string,
        payPeriodId: periodParam,
      });
      return;
    }
    if (isLoading) {
      setResolved({ state: "resolving" });
      return;
    }
    if (!employmentId) {
      // No active spell today. §2.1: a persona with no active spell sees the nav item ABSENT, and
      // reaching the route directly gets an honest sentence — never an empty grid.
      setResolved({ state: "no-employment" });
      return;
    }
    if (periodParam) {
      setResolved({ state: "ready", employmentId, payPeriodId: periodParam });
      return;
    }

    let cancelled = false;
    setResolved({ state: "resolving" });
    void resolveCurrentPeriod(employmentId).then((periodId) => {
      if (cancelled) return;
      setResolved(
        periodId
          ? { state: "ready", employmentId, payPeriodId: periodId }
          : { state: "no-period", employmentId },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [bothFromParams, employmentParam, periodParam, employmentId, isLoading]);

  if (resolved.state === "resolving") return <HrLoading variant="panel" rows={5} />;

  if (resolved.state === "no-employment") {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4">
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-base font-semibold">You have no timesheet here</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are not set up as an employee in this organization today, so there are no hours to
            show. If that looks wrong, HR can check how your record is set up.
          </p>
        </section>
      </div>
    );
  }

  // A real employment with no open period: hand it to L3 with a null period so its own
  // `no-timesheet` state — which says why, in its own words — is what renders.
  return (
    <MyTimesheet
      employmentId={resolved.employmentId}
      payPeriodId={resolved.state === "ready" ? resolved.payPeriodId : null}
    />
  );
}
