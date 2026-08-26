/**
 * features/hr/time/kiosk/KioskPunchSurface.tsx — route 36 `/kiosk/[deviceId]`.
 *
 * The whole kiosk punch experience: idle → choose an action → PIN → the server answers → a card →
 * back to idle. Every screen it can be on is in `KioskScreens.tsx` or `KioskCards.tsx`, and the
 * frame it sits in has no way out (`KioskFrame.tsx`).
 *
 * 🚨 **NO EMPLOYEE LIST, ANYWHERE.** The idle screen names the location and nothing else. There is
 * no "who's clocked in", no recent-punch feed, no headcount. All three would be roster disclosures
 * on an unattended screen.
 *
 * 🚨 **THE ACTION IS CHOSEN BEFORE THE PIN, AND ILLEGAL KINDS ARE STILL OFFERED.** This is the one
 * place the widget's "illegal transitions are not rendered" rule cannot apply: the kiosk does not
 * know who is standing there until the PIN is accepted, so it cannot know their clock state. The
 * server refuses an illegal kind for that employee's state (§1.2) and the refusal renders verbatim.
 * The contract carries this; the courtesy cannot.
 */

"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import type { KioskDeviceSession, PunchKind } from "@/features/hr/time/api/types";

import { punchKindPresentation } from "../clock/punchVocabulary";
import {
  KioskConfirmationCard,
  KioskCorrectionRequestedScreen,
  KioskDuplicateCard,
} from "./KioskCards";
import { KioskPinPad } from "./KioskPinPad";
import {
  KioskOfflineScreen,
  KioskSkewRefusedScreen,
} from "./KioskScreens";
import { KIOSK_SKEW_REFUSAL, type KioskClockSkew } from "./kioskSkew";
import { useKioskPunch } from "./useKioskPunch";

/**
 * The acts a wall clock offers. Clock in/out are the primary pair; the four break kinds sit behind
 * them at a smaller weight because they are a fraction of the traffic.
 */
const PRIMARY_KINDS: PunchKind[] = ["clock_in", "clock_out"];
const BREAK_KINDS: PunchKind[] = ["break_start", "break_end", "meal_start", "meal_end"];

/**
 * The auto-dismiss countdown. `seconds` is the knob `kiosk_confirm_dismiss_seconds` from the
 * device's own config — never a constant. Returns the seconds left, and fires `onDone` at zero.
 */
function useAutoDismiss(active: boolean, seconds: number, onDone: () => void): number {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!active) {
      setRemaining(seconds);
      return;
    }
    setRemaining(seconds);
    const id = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(id);
          onDone();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // `onDone` is stable enough for this purpose: it only ever returns the surface to idle.
  }, [active, seconds, onDone]);

  return remaining;
}

export function KioskPunchSurface({
  session,
  deviceId,
  skew,
  mockCase,
}: {
  session: KioskDeviceSession;
  deviceId: string;
  skew: KioskClockSkew | null;
  mockCase?: HrFixtureCase;
}) {
  const punch = useKioskPunch(session, deviceId, skew, mockCase);
  const { view } = punch;

  const dismissing = view.kind === "confirmed" || view.kind === "correction";
  const remaining = useAutoDismiss(
    dismissing,
    session.config.confirmDismissSeconds,
    punch.toIdle,
  );

  if (view.kind === "offline") {
    return (
      <div className="flex flex-col items-center gap-8">
        <KioskOfflineScreen />
        <Button onClick={punch.toIdle} className="min-h-[72px] px-10 text-xl">
          Back
        </Button>
      </div>
    );
  }

  if (view.kind === "skew-refused") {
    return (
      <div className="flex flex-col items-center gap-8">
        <KioskSkewRefusedScreen message={KIOSK_SKEW_REFUSAL} />
        <Button onClick={punch.toIdle} className="min-h-[72px] px-10 text-xl">
          Back
        </Button>
      </div>
    );
  }

  if (view.kind === "refused") {
    return (
      <div className="flex flex-col items-center gap-8 text-center">
        {/* Verbatim from the server. Never elaborated — elaboration is the oracle. */}
        <h1 className="max-w-lg text-3xl font-semibold text-foreground">{view.message}</h1>
        <Button onClick={punch.toIdle} className="min-h-[72px] px-10 text-xl">
          Try again
        </Button>
      </div>
    );
  }

  if (view.kind === "confirmed") {
    return <KioskConfirmationCard result={view.result} secondsRemaining={remaining} />;
  }

  if (view.kind === "correction") {
    return <KioskCorrectionRequestedScreen result={view.result} secondsRemaining={remaining} />;
  }

  if (view.kind === "duplicate") {
    return (
      <KioskDuplicateCard
        result={view.result}
        onDispute={punch.dispute}
        onDismiss={punch.toIdle}
      />
    );
  }

  if (view.kind === "pin" || view.kind === "submitting") {
    return (
      <KioskPinPad
        pin={punch.pin}
        pinLength={session.config.pinLength}
        busy={view.kind === "submitting"}
        actionLabel={punchKindPresentation(view.punchKind).label}
        onChange={punch.setPin}
        onCancel={punch.cancel}
      />
    );
  }

  // Idle. The screen a tablet shows for eight hours a day: an invitation and nothing else.
  return (
    <section className="flex flex-col items-center gap-10">
      <h1 className="text-center text-4xl font-semibold text-foreground">
        Tap to clock in or out
      </h1>

      <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
        {PRIMARY_KINDS.map((kind) => {
          const presentation = punchKindPresentation(kind);
          const Icon = presentation.icon;
          return (
            <Button
              key={kind}
              type="button"
              onClick={() => punch.choose(kind)}
              className="min-h-[128px] gap-4 text-2xl font-semibold"
            >
              <Icon className="size-8" />
              {presentation.label}
            </Button>
          );
        })}
      </div>

      <div className="grid w-full grid-cols-2 gap-4">
        {BREAK_KINDS.map((kind) => {
          const presentation = punchKindPresentation(kind);
          return (
            <Button
              key={kind}
              type="button"
              variant="outline"
              onClick={() => punch.choose(kind)}
              className="min-h-[80px] text-lg"
            >
              {presentation.label}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
