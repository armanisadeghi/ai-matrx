"use client";

// features/meet/components/manage/MoveOccurrenceDialog.tsx
//
// MOVE ONE OCCURRENCE of a series — an exception row (`meet_set_occurrence`
// action `move`, keyed by the start the rule generated); the series and every
// other occurrence are untouched, and the link stays the same. Guests who were
// told get the updated calendar entry for just that date.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { MeetingRecord } from "@ai-matrx/meet/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  errorSentence,
  useMeetingActions,
} from "@/features/meet/hooks/useMeetingActions";
import {
  DURATION_CHOICES,
  durationLabel,
} from "@/features/meet/lib/meeting-draft";
import {
  formatLongDate,
  formatTimeRange,
  utcToZoned,
  zoneLabel,
  zonedToUtcIso,
} from "@/features/meet/lib/zoned-time";
import type { OccurrenceRef } from "@/features/meet/components/manage/MeetingFormDialog";

export function MoveOccurrenceDialog({
  open,
  onOpenChange,
  meeting,
  occurrence,
  hasGuests,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingRecord;
  occurrence: OccurrenceRef;
  hasGuests: boolean;
  onDone: () => void;
}) {
  const actions = useMeetingActions();
  const zone = meeting.timeZone ?? "UTC";
  const start = utcToZoned(occurrence.occurrenceStart, zone);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [duration, setDuration] = useState(
    occurrence.durationMinutes ?? meeting.scheduledDurationMinutes ?? 60,
  );
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const move = async () => {
    setBusy(true);
    try {
      await actions.setOccurrence({
        meetingId: meeting.id,
        originalStart: occurrence.originalStart,
        action: "move",
        newStart: zonedToUtcIso(date, time, zone),
        newDurationMinutes: duration,
      });
      toast.success("Occurrence moved. The rest of the series is unchanged.");
      if (notify && hasGuests) await actions.announce(meeting.id);
      onDone();
      onOpenChange(false);
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (!busy ? onOpenChange(v) : undefined)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Move one occurrence</DialogTitle>
          <DialogDescription>
            {formatLongDate(occurrence.occurrenceStart, zone)},{" "}
            {formatTimeRange(
              occurrence.occurrenceStart,
              occurrence.durationMinutes,
              zone,
            )}
            . Only this date changes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-40"
              aria-label="New date"
            />
            <Input
              type="time"
              step={300}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-9 w-32"
              aria-label="New start time"
            />
            <Select
              value={String(duration)}
              onValueChange={(v) => setDuration(Number(v))}
            >
              <SelectTrigger className="h-9 w-28" aria-label="Duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...DURATION_CHOICES, duration])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {durationLabel(m)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Times in {zoneLabel(zone, occurrence.occurrenceStart)}, the
            meeting&apos;s own zone.
          </p>
          {hasGuests ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={notify}
                onCheckedChange={(v) => setNotify(v === true)}
              />
              Email guests the new time
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={() => void move()} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
