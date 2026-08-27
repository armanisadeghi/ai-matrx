"use client";

// features/hr/people/profile/tabs/CompensationTab.tsx — SPEC-EMPLOYEES §2.3.4
//
// 🚨 `comp_visibility` DRIVES THIS TAB, AND `'none'` NEVER REACHES IT.
//
//   'none'      → the server did not put `compensation` in `profile.tabs`, so
//                 the tab is not in the tab bar and this component never mounts.
//                 If it somehow does, it renders NOTHING — not a wall, not an
//                 explanation. An explanation is a disclosure.
//   'band_only' → the range and where they sit in it. NO AMOUNT, anywhere, in
//                 any form, including a rounded one or an "approximately".
//   'full'      → every concurrent component with its own window.
//
// 🚨 THE PAGE NEVER SUMS DIFFERENTIALS INTO A FAKE SINGLE RATE. A person on a
// base plus a shift differential plus a bilingual allowance has THREE rates with
// three windows; adding them produces a number that is not true on any day and
// that somebody will quote in a wage claim.
//
// 🚨 `annualized_amount` IS COMPUTED, NEVER TYPED. There is no input for it here
// and there must never be one.
//
// ⚠️ READ DOOR MISSING — stated out loud rather than faked. `hr_employee_profile`
// carries no compensation rows (read live 2026-08-26), and
// `hr_confidential_list('hr_compensation', …)` filters ONLY by
// `organization_id`: using it here would record a whole-org audited list read
// against this viewer for a one-person purpose, which corrupts the very audit
// trail this tier exists to produce. So the tab says what it can prove and
// registers the gap (`hr.people.compensation-history`).

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { cn } from "@/lib/utils";

import { hrStructureFocusHref, type HrOrgRef } from "../../../routes";
import type { HrEmployeeProfile } from "../../../types";
import { useHrStructure } from "../../shared/useHrStructure";

export function CompensationTab({
  profile,
  org,
  className,
}: {
  profile: HrEmployeeProfile;
  org: HrOrgRef;
  className?: string;
}) {
  // Defence in depth. The server already omitted the tab; this is the second
  // lock, and it renders NOTHING rather than a sentence about what is hidden.
  if (profile.comp_visibility === "none") return null;

  return (
    <div className={cn("space-y-6 p-3 sm:p-4", className)}>
      {profile.comp_visibility === "band_only" ? (
        <BandOnly profile={profile} org={org} />
      ) : (
        <FullVisibility profile={profile} />
      )}
    </div>
  );
}

// ── band_only ───────────────────────────────────────────────────────────────

function BandOnly({
  profile,
  org,
}: {
  profile: HrEmployeeProfile;
  org: HrOrgRef;
}) {
  const jobTitleId = profile.header.job_title_id;
  const structure = useHrStructure(
    jobTitleId ? profile.organization_id : null,
  );

  const title = jobTitleId
    ? (structure.data?.job_titles.find((t) => t.id === jobTitleId) ?? null)
    : null;

  if (jobTitleId && structure.isLoading) return null;

  // 🚨 `pay_range_min` / `pay_range_max` are ABSENT (undefined) on the payload
  // for a viewer without `comp.read` — never zero, never masked. `in` is the
  // test, not truthiness: a real range of 0 is a range.
  const hasRange =
    title !== null &&
    "pay_range_min" in title &&
    "pay_range_max" in title &&
    typeof title.pay_range_min === "number" &&
    typeof title.pay_range_max === "number";

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Pay band</h3>
      <p className="text-sm text-muted-foreground">
        You can see the range for this role, not what this person is paid.
      </p>

      {hasRange && title ? (
        <div className="max-w-md space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">{title.title}</span>
            <Link
              href={hrStructureFocusHref(title.id, org)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              Open this job title
            </Link>
          </div>
          <div className="flex items-center justify-between text-sm text-foreground">
            <span>{formatMoney(title.pay_range_min)}</span>
            <span>{formatMoney(title.pay_range_max)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted" aria-hidden />
          <p className="text-[0.6875rem] text-muted-foreground">
            Where this person sits in the band is part of their pay, so it is not
            shown here either.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This role has no pay range set, so there is no band to show.
        </p>
      )}
    </section>
  );
}

// ── full ────────────────────────────────────────────────────────────────────

function FullVisibility({ profile }: { profile: HrEmployeeProfile }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Compensation</h3>

      <div className="max-w-prose space-y-2 rounded-lg border border-dashed border-border p-3">
        <p className="text-sm text-foreground">
          This person&apos;s pay components aren&apos;t readable from here yet.
        </p>
        <p className="text-sm text-muted-foreground">
          Reading pay is an audited, per-person action, and the door that does it
          for one employee hasn&apos;t shipped. Showing an approximation here
          would be worse than showing nothing — a rate that is not the rate is
          the number somebody quotes in a dispute.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          onClick={() => void announceComingSoon("hr.people.compensation-history")}
        >
          What is missing?
        </Button>
      </div>

      <ul className="max-w-prose space-y-1 text-xs text-muted-foreground">
        <li>
          Someone on several rates will show every one of them, each with its own
          effective window — never one number that added them together.
        </li>
        <li>
          Annualized pay is calculated from the components; nobody types it.
        </li>
        <li>
          Every change carries its reason and the approval it came from.
        </li>
      </ul>

      {profile.worker_class_machinery.payroll ? null : (
        <p className="max-w-prose text-xs text-muted-foreground">
          This person isn&apos;t on payroll — their rate is a contract rate, and
          the employee payroll machinery does not apply to them.
        </p>
      )}
    </section>
  );
}

function formatMoney(value: number | null | undefined): string {
  if (typeof value !== "number") return "";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
