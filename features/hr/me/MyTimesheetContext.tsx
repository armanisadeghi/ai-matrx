// features/hr/me/MyTimesheetContext.tsx
//
// Route 5's missing half: resolving "MY employment" and "the period I am in" so
// `/hr/me/timesheet` works when somebody simply clicks it.
//
// 🚨 WHAT WAS ACTUALLY WRONG, MEASURED — NOT "IT WAS NEVER WIRED".
// Round 42 found this route dead for EVERY employee, including ones whose hours exist: priya's
// employment had an `hr.pay_period_employment` row for the current period, punch's for the one
// that closed yesterday, and all three personas read *"That link is not wired up yet."* The
// resolution code was here. It was pointed at a door that cannot answer, in a shape it could not
// read, with filters that door does not have — three faults, each fatal on its own:
//
//   1. AUTHORITY. It resolved the period through `hr_pay_period_list`, whose every branch is gated
//      on `hr.capability(uid,'payroll.read',…) or hr._time_has_timecard_approve(…)`. That is a
//      MANAGER/PAYROLL door. An ordinary employee holds neither capability, so it returned zero
//      rows for exactly the people this route exists for.
//   2. ENVELOPE. `hr.pay_period_list` answers through `hr._time_ok`, which nests the payload under
//      `data`. This file read `envelope.rows` — `undefined` on every response — so even a payroll
//      admin walking the route resolved nothing.
//   3. FILTERS. It passed `{employment_id, contains}`. That door honours `pay_group_id`,
//      `organization_id`, `state`, `from`, `to` and ignores the rest, so "the current period for
//      this employment" was never the question being asked.
//
// The fix is `hr_my_timesheet_context` (`hr_c4_55`): SELF-scoped through `hr.employments_of`, with
// period membership proved by the person's OWN `hr.pay_period_employment` row, and the employment's
// own pay group disambiguating the several overlapping calendars an org can run.
//
// ♻️ IT GOES THROUGH THE TIME LANE'S ONE DOOR (`callHrTimeRpc`), which unwraps `_time_ok`'s `data`,
// camelizes, and THROWS a typed `HrRpcError` on a refusal. Calling `supabase.rpc` here by hand is
// what let fault 2 above live undetected: a hand-rolled unwrap has no shape to be wrong against.
//
// 🚨 SEARCH PARAMS STILL WIN. A manager following a deep link, or anybody re-opening a specific
// period, passes `?employment=…&period=…` and gets exactly that. Resolution is the FALLBACK for
// the bare route, never an override of an explicit request. An `?employment=` that is NOT the
// caller's own is refused BY NAME by the door (`hr_timesheet_context_not_self`) and that sentence
// is what renders — route 5 is self-only by construction (SPEC-TIME §2.2) and route 29 is where a
// manager reads a report's hours.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useHrContext } from "@/features/hr/shared/useHrContext";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { hrMeHref } from "@/features/hr/routes";
import { getMyTimesheetContext } from "@/features/hr/time/api/service";
import { HrRpcError } from "@/features/hr/time/api/rpc";
import { MyTimesheet } from "@/features/hr/time/timesheet/MyTimesheet";

type Resolution =
  | { state: "resolving" }
  | { state: "ready"; employmentId: string; payPeriodId: string; periodNote: string | null }
  /** A real employment, and a real reason there is no period. The server's sentence, verbatim. */
  | { state: "no-period"; reason: string }
  /** The door refused. `userMessage` is the page text (SPEC-ACCESS §4.2: a denial names what failed). */
  | { state: "refused"; sentence: string };

export function MyTimesheetContext({
  employmentId: employmentParam,
  payPeriodId: periodParam,
}: {
  employmentId: string | null;
  payPeriodId: string | null;
}) {
  const { orgRef, isLoading } = useHrContext();
  const [resolved, setResolved] = useState<Resolution>({ state: "resolving" });

  // Params win, always. When both are present nothing is resolved and nothing is fetched.
  const bothFromParams = Boolean(employmentParam && periodParam);

  useEffect(() => {
    if (bothFromParams) {
      setResolved({
        state: "ready",
        employmentId: employmentParam as string,
        payPeriodId: periodParam as string,
        periodNote: null,
      });
      return;
    }
    /*
      The employer context is still resolving. The door does not need it — it resolves from the
      SESSION, not from `?org=` — but rendering a resolved answer before the shell has settled
      would flash a timesheet under the wrong employer heading.
    */
    if (isLoading) {
      setResolved({ state: "resolving" });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setResolved({ state: "resolving" });

    void getMyTimesheetContext(employmentParam, { signal: controller.signal })
      .then((ctx) => {
        if (cancelled) return;
        const employment = employmentParam ?? ctx.employmentId;
        // An explicit `?period=` still wins over the resolved one.
        const period = periodParam ?? ctx.payPeriodId;
        if (!employment || !period) {
          setResolved({
            state: "no-period",
            reason:
              ctx.noPeriodReason ??
              "There is no pay period covering your hours yet, so there is nothing to show here.",
          });
          return;
        }
        setResolved({
          state: "ready",
          employmentId: employment,
          payPeriodId: period,
          // Only `most_recent` carries one, and it is the server's sentence, printed not summarised.
          periodNote: periodParam ? null : ctx.periodNote,
        });
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setResolved({
          state: "refused",
          sentence:
            err instanceof HrRpcError
              ? err.userMessage
              : "We could not reach your timesheet just now. Try again in a moment.",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bothFromParams, employmentParam, periodParam, isLoading]);

  if (resolved.state === "resolving") return <HrLoading variant="panel" rows={5} />;

  if (resolved.state === "no-period" || resolved.state === "refused") {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4">
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-base font-semibold">
            {resolved.state === "no-period"
              ? "No timesheet for you yet"
              : "We cannot show you this timesheet"}
          </h1>
          {/*
            🚨 THE SERVER'S SENTENCE, PRINTED — NOT SUMMARISED, AND NEVER "not wired up yet".
            §2.2's `no-timesheet` law is that a person who opens this route reads WHY there is
            nothing here. A product that tells someone it is unfinished, when the true answer is a
            fact about their own record, teaches them the whole module is broken.
          */}
          <p className="mt-2 text-sm text-muted-foreground">
            {resolved.state === "no-period" ? resolved.reason : resolved.sentence}
          </p>
          {/*
            ♻️ THE ORG TRAVELS ON THE LINK. `hrMeHref(orgRef)` and never a bare "/hr/me" — HR is
            strictly single-employer and a link that drops `?org=` silently lands the person in a
            different employer (`features/hr/routes.ts`). This link used to be a hardcoded
            "/hr/me": the same org-dropping class fixed elsewhere in this module.
          */}
          <Link
            href={hrMeHref(orgRef)}
            className="mt-3 inline-flex text-sm font-medium underline underline-offset-4"
          >
            Open my HR profile
          </Link>
        </section>
      </div>
    );
  }

  return (
    <MyTimesheet
      employmentId={resolved.employmentId}
      payPeriodId={resolved.payPeriodId}
      periodNote={resolved.periodNote}
    />
  );
}
