/**
 * features/hr/time/clock/PunchStatusPanel.tsx — what the employee currently IS, and since when.
 *
 * Every figure on this panel is the server's. `phase`, `elapsedWorkedMinutes`,
 * `elapsedBreakMinutes`, `dayTotalHours`, `mealMinimumMinutes` and the open exceptions all arrive
 * computed and snapshot-backed (L3-74). The only thing this component adds is the **ticker**, and
 * it carries {@link LIVE_DISPLAY_DISCLAIMER} in the same breath so a moving number is never
 * mistaken for a payable one.
 */

"use client";

import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ClockState } from "@/features/hr/time/api/types";

import {
  formatElapsedMinutes,
  LIVE_DISPLAY_DISCLAIMER,
  useLiveElapsedMinutes,
} from "./liveElapsed";
import { lastPunchAt, mealMinimumMinutes } from "./clockStateView";
import { EXCEPTION_KIND_LABELS, labelFor } from "../shared/vocabulary";
import { breakPayNotice, clockPhasePresentation, mealMinimumNotice } from "./punchVocabulary";
import { crossZoneNotice, formatStampedTimeWithZone } from "./stampedTime";

export function PunchStatusPanel({
  state,
  stateReceivedAtMs,
}: {
  state: ClockState;
  stateReceivedAtMs: number;
}) {
  const presentation = clockPhasePresentation(state.phase);
  const anchorMinutes =
    presentation.elapsedField === "worked"
      ? state.elapsedWorkedMinutes
      : presentation.elapsedField === "break"
        ? state.elapsedBreakMinutes
        : 0;

  // Anchored to the server's minute count; snaps back to it on every `clock_state` response.
  const liveMinutes = useLiveElapsedMinutes(anchorMinutes, stateReceivedAtMs);

  const payNotice = breakPayNotice(state.phase);
  const mealNotice =
    state.phase === "on_meal" ? mealMinimumNotice(mealMinimumMinutes(state)) : null;
  // `tz` is nullable on the real envelope (a blocked read can answer before a zone resolves).
  const zoneNotice = state.tz ? crossZoneNotice(state.tz) : null;
  const lastAt = lastPunchAt(state);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">{presentation.headline}</h2>
        {state.localWorkDate && <Badge variant="secondary">{state.localWorkDate}</Badge>}
      </div>

      {presentation.elapsedField && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{presentation.elapsedLabel}</p>
          <p className="text-4xl font-semibold tabular-nums text-foreground">
            {formatElapsedMinutes(liveMinutes)}
          </p>
          <p className="text-xs text-muted-foreground">{LIVE_DISPLAY_DISCLAIMER}</p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-muted-foreground">Worked so far today</dt>
          {/*
            🚨 The server sends `elapsed_worked_minutes` and NO day total (G2 F6). The old
            `dayTotalHours` was this lane's invention and rendered as "undefined hours" against the
            live function. Showing the server's own elapsed figure is the honest replacement; a
            paid-hours total is owed on this envelope and is NOT manufactured here.
          */}
          <dd className="text-lg font-medium tabular-nums text-foreground">
            {formatElapsedMinutes(state.elapsedWorkedMinutes)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Last punch</dt>
          <dd className="text-lg font-medium text-foreground">
            {lastAt && state.tz ? formatStampedTimeWithZone(lastAt, state.tz) : "None yet"}
          </dd>
        </div>
      </dl>

      {payNotice && <p className="text-sm font-medium text-foreground">{payNotice}</p>}
      {mealNotice && <p className="text-sm text-muted-foreground">{mealNotice}</p>}
      {zoneNotice && <p className="text-xs text-muted-foreground">{zoneNotice}</p>}

      {state.openExceptions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Info className="size-4" />
            Open with your manager
          </p>
          <ul className="flex flex-col gap-1">
            {state.openExceptions.map((exception) => (
              /*
                🚨 This read sends no `message` (G2 F6) — it sends `exception_kind`. Labelling it
                through the shared lexicon is honest; rendering `exception.message` printed an empty
                line, and printing the raw token would be F7's defect.
              */
              <li key={exception.id} className="text-sm text-muted-foreground">
                {labelFor(EXCEPTION_KIND_LABELS, exception.exceptionKind)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
