/**
 * features/hr/time/clock/MyClockSurface.tsx — route 6 `/hr/me/clock`, the employee's own web punch.
 *
 * 🚨 **MOBILE-FIRST, NOT MOBILE-TOLERANT** (UI-IA §7, L3-77). This is one of the three surfaces
 * UI-IA names as *"genuinely excellent on a phone, not merely functional, because employees will use
 * them on phones on day one, months before any native app"*. So the layout is designed at 375px and
 * widened for desktop — the inverse of the rest of the app — every punch control clears 44px by a
 * wide margin, and the column is capped so a 27" monitor does not stretch a two-button surface
 * across a metre of glass.
 *
 * ♻️ The subject is lane L1's `useHrContext()` (`hr_my_context`), not a second resolution of "who am
 * I". `active.employment_id` is documented as *"null when there is no active spell today"*, and that
 * null is rendered as a sentence with somewhere to go — never as an empty clock.
 */

"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { webPunchSessionSegment } from "@/features/hr/time/api/idempotencyKey";

import { PunchWidget } from "./PunchWidget";

export function MyClockSurface({ mockCase }: { mockCase?: HrFixtureCase }) {
  const hr = useHrContext();

  return (
    // pb-safe keeps the primary punch control clear of the iOS home indicator — an employee
    // clocking out one-handed should not have to fight the gesture bar for it.
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-safe pt-4 sm:max-w-lg">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">My time clock</h1>
        <p className="text-sm text-muted-foreground">
          Record your own time. Your hours are calculated from these punches.
        </p>
      </header>

      {hr.isLoading && (
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-border bg-card">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* The server's own refusal sentence, never a generic one. */}
      {!hr.isLoading && hr.error && (
        <section className="rounded-xl border border-border bg-card p-6">
          <p className="text-base text-foreground">
            {hr.error.kind === "denied"
              ? (hr.error.detail ?? "You do not have access to a time clock here.")
              : hr.error.message}
          </p>
        </section>
      )}

      {/*
        No active employment today. This is not `blocked` — the server was never asked, because
        there is nobody to ask about. It still gets a sentence and a door: "no dead ends" applies
        hardest to the person who has been told no.
      */}
      {!hr.isLoading && !hr.error && !hr.active?.employment_id && (
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          <p className="text-base text-foreground">
            You do not have an active job here today, so there is no time clock to use.
          </p>
          <Button asChild variant="outline" className="min-h-[48px] w-fit">
            <Link href="/hr/me">Open my HR record</Link>
          </Button>
        </section>
      )}

      {hr.active?.employment_id && (
        <PunchWidget
          employmentId={hr.active.employment_id}
          /* Route 6 is the employee punching for themselves. */
          source="web"
          deviceOrSession={webPunchSessionSegment()}
          mockCase={HR_MOCK_ENABLED ? mockCase : undefined}
        />
      )}
    </div>
  );
}
