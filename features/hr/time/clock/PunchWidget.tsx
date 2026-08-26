/**
 * features/hr/time/clock/PunchWidget.tsx — THE punch widget. Routes 6 and 34 both mount this one
 * component; the kiosk (route 36) is a different lane by design (no session, no shell, no doors)
 * and lives in `../kiosk/`.
 *
 * 🚨 **IT RENDERS `hr_clock_state` AND DERIVES NO STATE OF ITS OWN** (L3-44, §2.1). Everything on
 * screen below is either a server fact or a transport fact this browser knows. There is no place in
 * this file where a phase, an allowed punch kind, an eligibility or an hour is worked out.
 *
 * 🚨 **NO CLIENT COMPUTES HOURS** (L3-74). The only moving number is the display-only ticker in
 * `PunchStatusPanel`, anchored to the server's own elapsed minutes and labelled as a live display.
 *
 * The eight states of §2.1 are the `PunchClockView` union, and this component's whole job is to be
 * exhaustive over it. `loading` and `no-subject` are the two extra arms the union carries so a
 * surface that has not resolved a subject yet cannot silently render as `clocked_out` — which would
 * show a person a **Clock in** button for nobody.
 */

"use client";

import { Loader2 } from "lucide-react";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import type { PunchSource } from "@/features/hr/time/api/types";

import { ClockOutAttestationCard } from "./ClockOutAttestationCard";
import { PunchActionGrid } from "./PunchActionGrid";
import { PunchConfirmationCard } from "./PunchConfirmationCard";
import { PunchBlockedCard, PunchErrorCard, PunchOfflineCard } from "./PunchStateCards";
import { PunchStatusPanel } from "./PunchStatusPanel";
import { usePunchClock } from "./usePunchClock";

export interface PunchWidgetProps {
  /** `null` until a subject is resolved — route 6 resolves it from the session, route 34 by search. */
  employmentId: string | null;
  /**
   * `web` on route 6. `manager_entry` on route 34, which is what makes the server stamp
   * `actor_type='manager'` with the **operator** as the actor and never the subject (§2.1).
   */
  source: PunchSource;
  /** The mandatory device/session segment of the idempotency key (§14 D4 / U-14). */
  deviceOrSession: string;
  /** Shown above the widget on route 34 so an operator can never punch for the wrong person. */
  subjectName?: string | null;
  /** Mock-lane case selector. Inert unless `NEXT_PUBLIC_HR_MOCK=1`. */
  mockCase?: HrFixtureCase;
}

export function PunchWidget({
  employmentId,
  source,
  deviceOrSession,
  subjectName,
  mockCase,
}: PunchWidgetProps) {
  const clock = usePunchClock({ employmentId, source, deviceOrSession, mockCase });
  const { view } = clock;

  return (
    <div className="flex flex-col gap-4">
      {subjectName && (
        <p className="text-sm text-muted-foreground">
          Recording time for <span className="font-medium text-foreground">{subjectName}</span>.
        </p>
      )}

      {view.kind === "loading" && (
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-border bg-card">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {view.kind === "no-subject" && (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Search for the person whose time you are recording.
        </p>
      )}

      {/* A server fact: a sentence AND a door, always. */}
      {view.kind === "blocked" && <PunchBlockedCard blocked={view.blocked} />}

      {view.kind === "offline" && (
        <>
          {view.state && (
            <PunchStatusPanel state={view.state} stateReceivedAtMs={clock.stateReceivedAtMs} />
          )}
          <PunchOfflineCard intent={view.intent} busy={clock.busy} onRetry={clock.retry} />
        </>
      )}

      {view.kind === "error" && (
        <>
          {view.state && (
            <PunchStatusPanel state={view.state} stateReceivedAtMs={clock.stateReceivedAtMs} />
          )}
          <PunchErrorCard
            error={view.error}
            intent={view.intent}
            busy={clock.busy}
            onRetry={clock.retry}
          />
        </>
      )}

      {/*
        `attesting`. The punch has NOT been written yet — the card collects the answer set and the
        submit writes it. The action grid is deliberately not rendered underneath: a second punch
        control while an attestation is open is how a double punch happens.
      */}
      {view.kind === "attesting" && (
        <>
          <PunchStatusPanel state={view.state} stateReceivedAtMs={clock.stateReceivedAtMs} />
          <ClockOutAttestationCard
            state={view.state}
            busy={clock.busy}
            onSubmit={clock.submitAttestation}
            onCancel={clock.cancelAttestation}
          />
        </>
      )}

      {view.kind === "ready" && (
        <>
          <PunchStatusPanel state={view.state} stateReceivedAtMs={clock.stateReceivedAtMs} />
          {/*
            A replay renders here as an ordinary confirmation — never an error (§1.1, §3.4). The
            confirmation sits above the controls so the last thing that happened is the first thing
            read.
          */}
          {clock.confirmation && (
            <PunchConfirmationCard
              confirmation={clock.confirmation}
              onDismiss={clock.dismissConfirmation}
            />
          )}
          <PunchActionGrid state={view.state} busy={clock.busy} onPunch={clock.punch} />
        </>
      )}
    </div>
  );
}
