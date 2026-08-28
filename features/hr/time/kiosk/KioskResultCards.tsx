/**
 * features/hr/time/kiosk/KioskResultCards.tsx — the confirmation and the duplicate-suspected card.
 *
 * 🚨 **THE CONFIRMATION IS THE ONLY THING THAT SAYS A PUNCH HAPPENED** (L3-68, §3.3). It is
 * rendered from a resolved server response and from nothing else. There is no optimistic path into
 * either of these components — `useKioskPunch` cannot reach them without a `KioskPunchResult` in
 * hand — because *a card that appears before the server answered lets a worker walk away unpunched*.
 *
 * 🚨 **NEVER MORE THAN THE PUNCHING EMPLOYEE'S DISPLAY NAME** (§3.3). `KioskPunchResult` carries a
 * display name, a kind, a local time and a set of notices, and that is the whole permitted surface.
 * No employee number, no department, no schedule, no totals, no hours — and nothing at all about
 * anybody who did not just authenticate.
 */

"use client";

import { AlertTriangle, CheckCircle2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { KioskPunchResult } from "@/features/hr/time/api/types";
import { formatStampedTimeWithZone } from "@/features/hr/time/clock/stampedTime";
import { punchKindPresentation } from "@/features/hr/time/clock/punchVocabulary";

/**
 * The success card. A **replay** lands here too and renders identically plus one honest line
 * (§1.1, §3.4): the key collided, the server returned the original punch and wrote nothing new.
 * Rendering a replay as an error is how a correctly-working idempotency key looks like a broken
 * time clock to the person standing in front of it.
 *
 * 🚨 The time is rendered in the punch's **stamped `tz`**, which the door returns beside the
 * instant (`punch.occurred_at`, `punch.tz`). It is deliberately NOT the tablet's own zone: a tablet
 * whose OS zone is misconfigured would otherwise print a time the timesheet disagrees with
 * (§9 rule 1) — and this device's clock is exactly the thing already under suspicion.
 */
export function KioskConfirmationCard({ result }: { result: KioskPunchResult }) {
  const presentation = punchKindPresentation(result.punch.punchKind);

  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card p-10 text-center">
      <CheckCircle2 className="size-20 text-foreground" />
      <div className="flex flex-col gap-2">
        <p className="text-4xl font-semibold text-foreground">{result.employeeDisplayName}</p>
        <p className="text-3xl text-foreground">
          {presentation.pastTense}
          {result.punch.occurredAt && result.punch.tz
            ? ` at ${formatStampedTimeWithZone(result.punch.occurredAt, result.punch.tz)}`
            : ""}
        </p>
      </div>

      {result.replayed && (
        <p className="text-xl text-muted-foreground">
          This was already recorded — we did not record it twice.
        </p>
      )}

      {/*
        🚨 §4.9 wants the confirmation to state what was captured ("Photo recorded"). The door does
        NOT send it — `hr_kiosk_punch` returns the display name, the punch's five fields, the
        resulting state and the duplicate flag, and nothing about capture. Rather than print a
        notice the server never confirmed, the kiosk says nothing here and the gap is reported.
      */}
      {/*
        🚨 THE AMENDED CLAUSE. The tablet CANNOT collect the attestation — §3.2 requires it to show
        the total it is asking about and the meal rule it asks under, and §1.2 deliberately keeps
        the clock_state block off a wall tablet. So it states plainly that one is owed and points at
        the surface that can take it. `attestation_owed` is one boolean on the wire and carries no
        rule detail, no totals and nobody else's name.
      */}
      {result.attestationOwed && (
        <p className="max-w-lg text-xl text-muted-foreground">
          You still need to confirm your hours and breaks for today. Do that on your timesheet — on
          your own phone or computer, or ask your manager.
        </p>
      )}

    </div>
  );
}

/**
 * 🚨 **THE DUPLICATE-SUSPECTED CARD** (L3-70, §3.3, §3.4). A *different* key, same kind, inside the
 * near-duplicate window: a **real second punch**, which **was written**, because refusing it would
 * lose a fact. The card says what already exists — *"You already clocked in at 8:02am"* — and
 * offers exactly **ONE** door.
 *
 * 🚨 **It does not auto-dismiss.** Every other kiosk card does, because a tablet left showing one is
 * a tablet the next person cannot use — but this one carries a decision, and a card that expires
 * while somebody is reading it takes their only door with it.
 *
 * **WHAT THE DOOR CAN BE, HONESTLY.** §3.3 says it *"opens a manager-attended correction"*. A kiosk
 * has no user session and no correction RPC it may call — `hr_punch_correct` is a manager's,
 * authenticated, and putting it behind an anon device token would be a second, weaker correction
 * path into an immutable ledger. So the door does the only thing a device with no session can do
 * honestly: it hands the worker the exact facts a manager needs and returns the tablet to idle.
 * **DEBT, named in the report:** the kiosk lane needs a device-callable way to raise the correction
 * (a `hr_kiosk_dispute`-shaped RPC) before this door can do more than instruct.
 */
export function KioskDuplicateCard({
  result,
  onAcknowledge,
  onDispute,
}: {
  result: KioskPunchResult;
  onAcknowledge: () => void;
  onDispute: () => void;
}) {
  const duplicate = result.duplicateSuspected;
  if (!duplicate) return null;

  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card p-10 text-center">
      <AlertTriangle className="size-20 text-muted-foreground" />
      <div className="flex flex-col gap-2">
        <p className="text-4xl font-semibold text-foreground">{result.employeeDisplayName}</p>
        {/*
          🚨 The door sends a BOOLEAN — `exists(... detector = 'near_duplicate')` — and no previous
          punch time. The card therefore states the fact it actually has and does NOT invent
          "you already clocked in at 8:02am"; a fabricated time on a record a manager will act on is
          worse than a plainer sentence.
        */}
        <p className="text-3xl text-foreground">
          This looks like a second punch a moment after your last one.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <Button
          type="button"
          size="lg"
          onClick={onAcknowledge}
          className="min-h-[80px] text-2xl font-semibold"
        >
          That&apos;s fine
        </Button>
        {/* 🚨 ONE door. Never a second punch button, and never a silent write. */}
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onDispute}
          className="min-h-[80px] text-2xl"
        >
          That&apos;s not right
        </Button>
      </div>
    </div>
  );
}

/**
 * What the one door opens onto. Not a form and not a correction — the tablet has no session to make
 * one with. It hands over the exact facts a manager needs to void the right punch, in words the
 * person can repeat, and gets out of the way.
 */
export function KioskDisputeInstructions({
  result,
  onDone,
}: {
  result: KioskPunchResult;
  onDone: () => void;
}) {
  const duplicate = result.duplicateSuspected;

  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card p-10 text-center">
      <p className="text-3xl font-semibold text-foreground">
        Both punches were kept, so nothing was lost.
      </p>
      <p className="max-w-xl text-2xl text-muted-foreground">
        Your manager has to decide which one is right — nothing on this tablet can change it. Tell
        them:
      </p>
      <div className="w-full rounded-xl border border-border bg-muted/40 p-6 text-left">
        <p className="text-2xl text-foreground">
          {/* The PAST-tense register, not the button label: this is a report of what happened, and
              "clock in at 8:03 AM" reads as an instruction rather than a record. */}
          {result.employeeDisplayName} — {punchKindPresentation(result.punch.punchKind).pastTense.toLowerCase()}{" "}
          {result.punch.occurredAt && result.punch.tz
            ? `at ${formatStampedTimeWithZone(result.punch.occurredAt, result.punch.tz)}`
            : "just now"}
          {duplicate ? ", twice in quick succession" : ""}.
        </p>
      </div>
      <Button
        type="button"
        size="lg"
        onClick={onDone}
        className="min-h-[80px] w-full text-2xl font-semibold"
      >
        Done
      </Button>
    </div>
  );
}
