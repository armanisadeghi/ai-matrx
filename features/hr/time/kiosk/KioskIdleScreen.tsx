/**
 * features/hr/time/kiosk/KioskIdleScreen.tsx — what a wall tablet shows when nobody is using it.
 *
 * 🚨 **NO EMPLOYEE LIST** (§3.3). The idle screen names nobody and remembers nobody. There is no
 * "last punch", no "welcome back", no recent-user row — every one of those is a roster disclosure
 * that survives on a screen in a break room.
 *
 * 🚨 **EVERY PUNCH KIND IS OFFERED, AND THAT IS DELIBERATE — IT IS NOT A DRIFT FROM `allowedKinds`.**
 * The web clock renders `clockState.allowedKinds` because it has a subject and can ask (L3-44). The
 * kiosk **has no subject until the PIN is validated inside `hr_kiosk_punch`**, and there is no
 * kiosk-callable clock-state RPC — asking one would mean identifying an employee before
 * authenticating them, which is the disclosure the PIN exists to prevent. So the tablet offers the
 * acts and the server refuses the illegal ones with its own sentence. SPEC-TIME §2.1 already rules
 * on which half is the contract: *"the button's absence is courtesy; the server's refusal is the
 * contract"* — on the kiosk only the contract half is available, and that is correct rather than
 * lax.
 *
 * `transfer` is absent: it means moving to a different position assignment, which requires choosing
 * one, which requires reading the employee's assignments — a disclosure before authentication.
 *
 * 🚨 **The clock on this screen is the tablet's own, corrected by the measured session skew** — not
 * an elapsed figure, not a total, and not anybody's hours. See `kioskSkew.ts` for why that is clock
 * synchronisation rather than the arithmetic L3-74 forbids.
 */

"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PunchKind } from "@/features/hr/time/api/types";
import { punchKindPresentation } from "@/features/hr/time/clock/punchVocabulary";

import { skewCorrectedNow, type KioskClockSkew } from "./kioskSkew";

/** The acts a tablet can offer without knowing who is standing at it. See the header on `transfer`. */
const KIOSK_PUNCH_KINDS: readonly PunchKind[] = [
  "clock_in",
  "clock_out",
  "meal_start",
  "meal_end",
  "break_start",
  "break_end",
];

export interface KioskIdleScreenProps {
  skew: KioskClockSkew | null;
  busy: boolean;
  onChoose: (kind: PunchKind) => void;
  /** Set where the device config asks for capture — said BEFORE the punch, on the surface (§4.9). */
  captureNotice: string | null;
}

export function KioskIdleScreen({ skew, busy, onChoose, captureNotice }: KioskIdleScreenProps) {
  const now = useTickingCorrectedClock(skew);

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center">
        <p className="text-7xl font-semibold tabular-nums text-foreground">
          {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(now)}
        </p>
        <p className="text-2xl text-muted-foreground">
          {new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          }).format(now)}
        </p>
      </div>

      <p className="text-2xl text-foreground">What are you doing?</p>

      <div className="grid w-full grid-cols-2 gap-4">
        {KIOSK_PUNCH_KINDS.map((kind) => {
          const presentation = punchKindPresentation(kind);
          const Icon = presentation.icon;
          return (
            <Button
              key={kind}
              type="button"
              /*
                Weight is by ACT, not by `presentation.emphasis`. That field answers "which act is
                primary in the current state", and the kiosk has no state to answer it against
                (see the header) — reading it here paints four of six controls as primary, which is
                the same as painting none. Clocking in and out is what a wall tablet is for; the
                break acts are the ones you go looking for.
              */
              variant={kind === "clock_in" || kind === "clock_out" ? "default" : "outline"}
              disabled={busy}
              onClick={() => onChoose(kind)}
              className="min-h-[96px] gap-3 text-2xl font-semibold"
            >
              <Icon className="size-8" />
              {presentation.label}
            </Button>
          );
        })}
      </div>

      {/* §4.9, ruled: where capture is on, the person is told BEFORE the punch, on the surface. */}
      {captureNotice && (
        <p className="text-center text-xl text-muted-foreground">{captureNotice}</p>
      )}
    </div>
  );
}

/**
 * The tablet's clock, corrected by the session skew, re-read once a second.
 *
 * Nothing here is derived from a punch, an interval or a stamped instant — it is `Date.now()` plus
 * the session's measured offset, which is exactly what a wall clock on the same wall would show.
 */
function useTickingCorrectedClock(skew: KioskClockSkew | null): Date {
  const [now, setNow] = useState(() => skewCorrectedNow(skew));
  useEffect(() => {
    setNow(skewCorrectedNow(skew));
    const id = window.setInterval(() => setNow(skewCorrectedNow(skew)), 1000);
    return () => window.clearInterval(id);
  }, [skew]);
  return now;
}
