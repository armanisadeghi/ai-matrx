/**
 * features/hr/time/kiosk/KioskCards.tsx — what the tablet shows after the server has answered.
 *
 * 🚨 **NO OPTIMISTIC UI ON THE KIOSK** (L3-68, §3.3). Every card in this file is rendered from a
 * `KioskPunchResult` that has already come back. Nothing here is shown in anticipation. The spec
 * states the reason and it is not a style preference: *"a card that appears before the server
 * answered would let a worker walk away unpunched."*
 */

"use client";

import { AlertTriangle, Camera, CheckCircle2, MapPin, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { KioskPunchResult } from "@/features/hr/time/api/types";

import { punchKindPresentation } from "../clock/punchVocabulary";

/**
 * The confirmation. Name, action, local time — and **nothing else about the person**. §1.2: the
 * kiosk punch returns *"the employee's display name and the punch result only — never a roster,
 * never any other HR field"*, and this card is where that restraint has to hold, because it is the
 * one moment a name appears on a shared screen.
 *
 * `occurredAtLocal` is the server's own formatted local time. The kiosk does not re-format it: the
 * device's clock is exactly the thing under suspicion here (see `kioskSkew.ts`), so rendering the
 * server's string is the only honest option.
 */
export function KioskConfirmationCard({
  result,
  secondsRemaining,
}: {
  result: KioskPunchResult;
  secondsRemaining: number;
}) {
  const presentation = punchKindPresentation(result.punchKind);

  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <CheckCircle2 className="size-20 text-foreground" />
      <h1 className="text-5xl font-semibold text-foreground">{result.employeeDisplayName}</h1>
      <p className="text-3xl text-foreground">
        {presentation.pastTense} at {result.occurredAtLocal}
      </p>

      {result.replayed && (
        <p className="text-xl text-muted-foreground">
          This was already recorded — we did not record it twice.
        </p>
      )}

      {/* §4.9: the confirmation states what was captured. */}
      {result.capturedNotices.length > 0 && (
        <ul className="flex flex-col items-center gap-2">
          {result.capturedNotices.map((notice) => (
            <li
              key={notice}
              className="flex items-center gap-2 text-lg text-muted-foreground"
            >
              {notice.toLowerCase().includes("photo") ? (
                <Camera className="size-5" />
              ) : (
                <MapPin className="size-5" />
              )}
              {notice}
            </li>
          ))}
        </ul>
      )}

      {/*
        The server says a break attestation is owed for this clock-out. The kiosk CANNOT collect it:
        `hr_kiosk_punch` learns `attestationRequired` only in its own response — after the punch is
        written — and the shape of the questions (meal rule resolved, waiver permitted, the total to
        confirm) lives in `hr_clock_state`, which needs an employment id the kiosk does not have
        before the PIN. So the tablet tells the truth and points at the surface that can. This gap is
        reported, not papered over with a card that cannot be submitted.
      */}
      {result.attestationRequired && (
        <p className="max-w-lg rounded-lg border border-border bg-card p-4 text-lg text-muted-foreground">
          You still need to confirm your breaks and hours for today. Do it on your own phone or
          computer, on your timesheet.
        </p>
      )}

      <p className="text-base text-muted-foreground">
        Returning in {secondsRemaining}
        {secondsRemaining === 1 ? " second" : " seconds"}
      </p>
    </section>
  );
}

/**
 * 🚨 **THE DUPLICATE-SUSPECTED CARD** (L3-70, §3.3, §3.4). *"You already clocked in at 8:02am"* with
 * **ONE** door — *"That's not right"*. **Never a silent second punch.**
 *
 * Note what a near-duplicate actually is (§3.4): a *different* idempotency key, same kind, inside
 * the near-duplicate window. It is a **real second punch and it was written**, because refusing it
 * would lose a fact — and an exception was opened so a human decides which one to void. This card
 * is therefore not an error and not a refusal; it is a notification that a person needs to look,
 * and the single door is how the employee says "look at this one".
 */
export function KioskDuplicateCard({
  result,
  onDispute,
  onDismiss,
}: {
  result: KioskPunchResult;
  onDispute: () => void;
  onDismiss: () => void;
}) {
  const duplicate = result.duplicateSuspected;
  if (!duplicate) return null;

  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <AlertTriangle className="size-16 text-foreground" />
      <h1 className="text-4xl font-semibold text-foreground">{duplicate.message}</h1>
      <p className="text-xl text-muted-foreground">
        {result.employeeDisplayName} · {result.occurredAtLocal}
      </p>

      <div className="flex w-full max-w-md flex-col gap-4">
        {/* THE one door. There is deliberately no second option that writes anything. */}
        <Button
          type="button"
          variant="outline"
          onClick={onDispute}
          className="min-h-[72px] text-xl"
        >
          That&apos;s not right
        </Button>
        <Button type="button" onClick={onDismiss} className="min-h-[72px] text-xl">
          That&apos;s fine
        </Button>
      </div>
    </section>
  );
}

/**
 * Where *"That's not right"* leads. A kiosk has **no route to any other HR surface** (§2.8) and no
 * authenticated operator, so a correction cannot be *performed* here — it is manager-attended by
 * definition (§3.3). What the tablet can do is state the facts the manager will need and stop.
 *
 * DEBT: no contract exists for a kiosk-originated correction request — `hr_punch_correct` requires
 * manager authority an anonymous device does not have. Until one exists this screen is the honest
 * end of the path, and it is reported rather than faked with a call that would refuse.
 */
export function KioskCorrectionRequestedScreen({
  result,
  secondsRemaining,
}: {
  result: KioskPunchResult;
  secondsRemaining: number;
}) {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <UserCheck className="size-16 text-foreground" />
      <h1 className="text-4xl font-semibold text-foreground">Tell your manager.</h1>
      <p className="max-w-lg text-xl text-muted-foreground">
        Only a manager can correct a punch. Show them this: {result.employeeDisplayName},{" "}
        {punchKindPresentation(result.punchKind).pastTense.toLowerCase()} at{" "}
        {result.occurredAtLocal}.
      </p>
      <p className="text-base text-muted-foreground">
        Returning in {secondsRemaining}
        {secondsRemaining === 1 ? " second" : " seconds"}
      </p>
    </section>
  );
}
