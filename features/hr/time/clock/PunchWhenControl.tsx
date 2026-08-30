/**
 * features/hr/time/clock/PunchWhenControl.tsx — *when* a manager-entered punch happened.
 *
 * 🚨 **WITHOUT THIS, MANAGER ENTRY WAS DOOR-ONLY.** Route 34 sent `source='manager_entry'`, which is
 * the lane `hr.punch_record` gates separately — but the client always stamped `new Date()`, so a
 * manager could only ever record a punch happening *right now*. The whole point of the lane is the
 * shift somebody forgot to clock: *"she started at 6am on Tuesday and nobody recorded it."*
 *
 * 🚨 **THE ZONE IS THE EMPLOYMENT'S** — `clockState.tz`, the zone the punch will be stamped in — and
 * it is named on screen. A manager in New York entering *"8:00 AM"* for a California employee means
 * California's 8am; `hr._punch_resolve_juris` derives `local_work_date` from the instant we send, so
 * a browser-zone conversion would file the punch on the wrong day without erroring.
 *
 * 🚨 **NOW IS THE DEFAULT, AND IT IS UNAMBIGUOUS.** Back-dating is a deliberate act with an audit
 * trail, not the resting state of the form. A control that quietly defaults to a typed-in date is
 * how a live punch gets recorded an hour off.
 *
 * What this control does NOT do is decide whether the manager may back-date. That is the server's:
 * `hr.punch_record` checks `working_record.read` **as of the entered date** and refuses with a
 * sentence naming that date. The refusal renders as data — see `PunchStateCards`.
 */

"use client";

import { CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";

import { stampedZoneAbbreviation } from "./stampedTime";

export interface PunchWhenValue {
  /** `YYYY-MM-DD` in the employment's zone, or `null` for "now". */
  localDate: string | null;
  /** `HH:mm` in the employment's zone, or `null` for "now". */
  localTime: string | null;
}

export function PunchWhenControl({
  value,
  timeZone,
  disabled,
  onChange,
  onUseNow,
  onChooseTime,
}: {
  value: PunchWhenValue;
  timeZone: string;
  disabled: boolean;
  onChange: (next: PunchWhenValue) => void;
  onUseNow: () => void;
  onChooseTime: () => void;
}) {
  const backdating = value.localDate !== null && value.localTime !== null;
  const zoneLabel = stampedZoneAbbreviation(new Date().toISOString(), timeZone);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">When did this happen?</h3>
        <p className="text-xs text-muted-foreground">
          {/* The zone is stated, always — an unlabelled time on a cross-zone entry is a guess. */}
          Times are this employee&apos;s local time ({timeZone.replace(/_/g, " ")}, {zoneLabel}).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={backdating ? "outline" : "default"}
          disabled={disabled}
          onClick={onUseNow}
          className="min-h-[44px]"
        >
          Now
        </Button>
        <Button
          type="button"
          variant={backdating ? "default" : "outline"}
          disabled={disabled}
          onClick={onChooseTime}
          className="min-h-[44px] gap-2"
        >
          <CalendarClock className="size-4" />
          Another time
        </Button>
      </div>

      {backdating && (
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <label htmlFor="hr-punch-date" className="text-xs font-medium text-foreground">
              Date
            </label>
            <Input
              id="hr-punch-date"
              type="date"
              value={value.localDate ?? ""}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, localDate: event.target.value })}
              className="min-h-[44px] text-base"
            />
          </div>
          <div className="flex min-w-32 flex-1 flex-col gap-1">
            <label htmlFor="hr-punch-time" className="text-xs font-medium text-foreground">
              Time
            </label>
            <Input
              id="hr-punch-time"
              type="time"
              value={value.localTime ?? ""}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, localTime: event.target.value })}
              className="min-h-[44px] text-base"
            />
          </div>
        </div>
      )}

      {backdating && (
        <p className="text-xs text-muted-foreground">
          This is recorded as entered by you, on this employee&apos;s behalf, and they are notified
          of it.
        </p>
      )}
    </section>
  );
}
