/**
 * features/hr/time/clock/PunchActionGrid.tsx — the punch controls, rendered from the server's own
 * `allowedKinds`.
 *
 * 🚨 **ILLEGAL TRANSITIONS ARE NOT RENDERED** (§2.1). A `clocked_in` employee has no Clock In
 * button — not a disabled one, not a greyed one, none. But note *why* that is safe to do: the
 * server refuses them anyway (§1.1). **The button's absence is courtesy; the server's refusal is the
 * contract.** So this component maps `clockState.allowedKinds` and never computes the set itself.
 * A hardcoded `["clock_out", "break_start"]` here would drift from the RPC the first time a
 * jurisdiction rule changed what is legal mid-shift.
 *
 * 🚨 Touch targets are ≥44px on every control an hourly employee uses (UI-IA §7, L3-77). The
 * primary act is deliberately much larger than that: on a phone, in a parking lot, in the rain, the
 * clock-out button should be impossible to miss.
 */

"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ClockState, PunchKind } from "@/features/hr/time/api/types";

import { geoCaptureBeforeNotice } from "./geoCapture";
import { punchKindPresentation } from "./punchVocabulary";

export interface PunchActionGridProps {
  state: ClockState;
  busy: boolean;
  onPunch: (kind: PunchKind) => void;
}

export function PunchActionGrid({ state, busy, onPunch }: PunchActionGridProps) {
  const allowed = state.allowedKinds;
  const captureNotice = geoCaptureBeforeNotice(state.capture);

  if (allowed.length === 0) {
    // Not an error and not an empty grid: the server currently accepts nothing from this person.
    // `blocked` covers the reasoned cases; this is the residual, and it still says something.
    return (
      <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        There is nothing to record right now. If that looks wrong, tell your manager.
      </p>
    );
  }

  const primary = allowed.filter((kind) => punchKindPresentation(kind).emphasis === "primary");
  const secondary = allowed.filter((kind) => punchKindPresentation(kind).emphasis === "secondary");

  return (
    <div className="flex flex-col gap-3">
      {primary.map((kind) => {
        const presentation = punchKindPresentation(kind);
        const Icon = presentation.icon;
        return (
          <Button
            key={kind}
            type="button"
            size="lg"
            disabled={busy}
            onClick={() => onPunch(kind)}
            className="min-h-[72px] w-full gap-3 text-lg font-semibold"
          >
            {busy ? <Loader2 className="size-6 animate-spin" /> : <Icon className="size-6" />}
            {presentation.label}
          </Button>
        );
      })}

      {secondary.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {secondary.map((kind) => {
            const presentation = punchKindPresentation(kind);
            const Icon = presentation.icon;
            return (
              <Button
                key={kind}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onPunch(kind)}
                className="min-h-[56px] gap-2 text-base"
              >
                <Icon className="size-5" />
                {presentation.label}
              </Button>
            );
          })}
        </div>
      )}

      {/*
        §4.9, ruled: where capture is on, the employee is told BEFORE the punch, in plain words, ON
        THE PUNCH CONTROL ITSELF — never a policy page, never a one-time consent they have
        forgotten. Where capture is off (the platform default) this renders nothing at all.
      */}
      {captureNotice && (
        <p className="text-center text-sm text-muted-foreground">{captureNotice}</p>
      )}
    </div>
  );
}
