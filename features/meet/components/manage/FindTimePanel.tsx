"use client";

// features/meet/components/manage/FindTimePanel.tsx
//
// The answer to "Find a time" (Meet wave 4): the first open slots for everyone
// whose calendar can be read, as one row of choices, and — in words — whose
// calendar was NOT checked and why (no calendar connected, another
// organization, an email-only guest). Free/busy only; nobody's event is named.

import { X } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { durationLabel } from "@/features/meet/lib/meeting-draft";
import type { Slot } from "@/features/meet/lib/find-time";
import type { FindTimeResult } from "@/features/meet/hooks/useFindTime";

function slotLabel(slot: Slot): string {
  const [y, m, d] = slot.date.split("-").map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!, 12)).toLocaleDateString(
    "en-US",
    {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    },
  );
  const [h, min] = slot.time.split(":").map(Number);
  const clock = new Date(Date.UTC(2000, 0, 1, h!, min!)).toLocaleTimeString(
    "en-US",
    {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
    },
  );
  return `${day} · ${clock}`;
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function FindTimePanel({
  loading,
  failure,
  result,
  durationMinutes,
  horizonDays,
  emailOnlyGuests,
  nameOf,
  selected,
  onPick,
  onClose,
}: {
  loading: boolean;
  failure: string | null;
  result: FindTimeResult | null;
  durationMinutes: number;
  horizonDays: number;
  emailOnlyGuests: number;
  nameOf: (userId: string) => string;
  selected: string;
  onPick: (slot: Slot) => void;
  onClose: () => void;
}) {
  const checked =
    result?.people.filter((p) => p.visible && p.calendarConnected) ?? [];
  const noCalendar =
    result?.people.filter((p) => p.visible && !p.calendarConnected) ?? [];
  const hidden = result?.people.filter((p) => !p.visible) ?? [];
  const notes: string[] = [];
  if (checked.length > 0)
    notes.push(`Busy times read for ${list(checked.map((p) => nameOf(p.userId)))}.`);
  if (noCalendar.length > 0)
    notes.push(
      `No calendar connected: ${list(noCalendar.map((p) => nameOf(p.userId)))}.`,
    );
  if (hidden.length > 0)
    notes.push(
      `Not visible (no shared organization): ${list(hidden.map((p) => nameOf(p.userId)))}.`,
    );
  if (emailOnlyGuests > 0)
    notes.push(
      `${emailOnlyGuests === 1 ? "One guest is" : `${emailOnlyGuests} guests are`} invited by email only and not checked.`,
    );

  return (
    <div className="relative rounded-md border border-border bg-muted/30 p-2 pr-9 sm:ml-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-7 w-7"
        aria-label="Close suggestions"
        onClick={onClose}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {loading ? (
        <div
          className="flex flex-wrap gap-1.5"
          aria-busy="true"
          aria-label="Finding open times"
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-32" />
          ))}
        </div>
      ) : failure ? (
        <p role="alert" className="text-xs text-destructive">
          Availability could not be read: {failure}
        </p>
      ) : result && result.slots.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No open {durationLabel(durationMinutes)} slot in the next{" "}
          {horizonDays} days of working hours.
        </p>
      ) : result ? (
        <div className="flex flex-wrap gap-1.5">
          {result.slots.map((slot) => (
            <Button
              key={slot.start}
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-7 px-2 text-xs tabular-nums",
                selected === `${slot.date} ${slot.time}` &&
                  "border-primary bg-primary/10",
              )}
              onClick={() => onPick(slot)}
            >
              {slotLabel(slot)}
            </Button>
          ))}
        </div>
      ) : null}
      {result && notes.length > 0 ? (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {notes.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
