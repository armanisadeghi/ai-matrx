// features/hr/shared/HrPillarSurface.tsx
//
// THE HONEST DESTINATION FOR AN HR PILLAR THE NAV ALREADY OFFERS AND NOBODY HAS
// BUILT YET.
//
// 🚨 WHY THIS EXISTS. `resolveHrNav` is one resolver with two callers — the left
// rail (`HrShell`) and the home card grid (`app/(core)/hr/page.tsx`) — so a nav
// entry pointing at an unbuilt route costs TWO dead controls, one of them on the
// first screen a user sees. Measured 2026-08-28: an hr_admin had 17 rail items
// of which 9 were 404s and 16 home cards of which the same 9 were 404s. The
// owner's own report was "the menus don't all work".
//
// SPEC-UI-IA §4.2's never-performable law gives exactly two honest endings for a
// control that cannot work: ABSENT, or PRESENT AND SAYING WHY. Both are used
// here, and they are not interchangeable:
//
//   • ABSENT is for a person who would never use this surface. That is
//     `requires` in `hr-nav.ts` — a contractor and a person with no employer
//     were being offered org-wide Performance and Engagement, and now are not.
//   • THIS COMPONENT is the second ending, for the person who legitimately WILL
//     use the pillar the day it lands. They get the registered promise, the
//     stage it is at, the blocker if there is one, and the whole HR shell around
//     it — so the page is a place they can navigate onward from, not a dead end
//     wearing better copy.
//
// 🚨 NEVER A BARE "COMING SOON" STRING. The text comes from
// `lib/coming-soon/registry.ts`, which is what makes every promise the product
// shows countable and reviewable like a found defect. An unregistered id cannot
// reach this component — `promiseKey` is typed against the registry.
//
// 🚨 TO THE PILLAR LANE THAT COMES TO BUILD THIS: delete the route's call to
// this component and mount your surface, then delete the registry entry in the
// same commit. A Coming Soon left standing over a screen that exists is a
// promise the product is already keeping — see the `hr.period-approval-progress`
// note in the registry for why that one is removed on sight.

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { hrHref } from "../routes";
import { STAGE_LINE } from "@/lib/coming-soon/announce";
import { COMING_SOON } from "@/lib/coming-soon/registry";

import { HrShell } from "./HrShell";
import { useHrContext } from "./useHrContext";

export function HrPillarSurface({
  promiseKey,
  /** The nav label this page was reached by. Kept identical so the breadcrumb
      leaf and the item the user clicked are the same word. */
  title,
  /** The pillar spec that owes this. Named, so nobody rebuilds it somewhere else. */
  owner,
}: {
  promiseKey: keyof typeof COMING_SOON;
  title: string;
  owner: string;
}) {
  const { orgRef } = useHrContext();
  const promise = COMING_SOON[promiseKey];
  const stageLine = STAGE_LINE[promise.stage] ?? "";

  return (
    <HrShell title={title}>
      <div className="mx-auto w-full max-w-xl p-4 sm:p-6">
        <div
          className="rounded-lg border border-border bg-card p-4 sm:p-6"
          data-hr-pillar-promise={promise.id}
          data-hr-pillar-stage={promise.stage}
        >
          <h2 className="text-sm font-semibold text-foreground">
            {promise.label}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {promise.promise}
          </p>

          {stageLine ? (
            <p className="mt-3 text-xs font-medium text-foreground">
              {stageLine}
            </p>
          ) : null}

          {/* A blocked promise with no named blocker is an untracked defect
              wearing a nicer hat — the registry requires one, so show it. */}
          {promise.blockedBy ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {promise.blockedBy}
            </p>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            Built by the {owner} part of HR.
          </p>

          {/* Somewhere real to go. The rail above is the full answer; this is
              the one-click version for a person who arrived by typed URL. */}
          <Link
            href={hrHref(orgRef)}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary sm:min-h-9"
          >
            Back to your HR home
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </HrShell>
  );
}
