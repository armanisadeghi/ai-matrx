"use client";

// features/meet/components/manage/CancelMeetingDialog.tsx
//
// CANCEL — a STATE, never a delete: the link keeps resolving and says the
// meeting was cancelled (with the reason), nobody can join, and every guest who
// was told about it gets a cancellation that removes it from their calendar.
// A recurring meeting asks first: this occurrence (an exception) or the whole
// series. The consequence is named before the click, per the platform's
// destructive-actions law.

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
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/lib/toast";
import {
  errorSentence,
  useMeetingActions,
} from "@/features/meet/hooks/useMeetingActions";
import {
  formatLongDate,
  formatTimeRange,
} from "@/features/meet/lib/zoned-time";
import type { OccurrenceRef } from "@/features/meet/components/manage/MeetingFormDialog";

export function CancelMeetingDialog({
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
  /** Set when the person started from one occurrence of a series. */
  occurrence?: OccurrenceRef | null;
  hasGuests: boolean;
  onDone: () => void;
}) {
  const actions = useMeetingActions();
  const series = !!meeting.recurrenceRule;
  const [scope, setScope] = useState<"occurrence" | "series">(
    occurrence && series ? "occurrence" : "series",
  );
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const zone = meeting.timeZone ?? "UTC";

  const run = async () => {
    setBusy(true);
    try {
      if (series && occurrence && scope === "occurrence") {
        await actions.setOccurrence({
          meetingId: meeting.id,
          originalStart: occurrence.originalStart,
          action: "cancel",
          reason: reason.trim() || null,
        });
        toast.success(
          "That occurrence is cancelled. The rest of the series is unchanged.",
        );
      } else {
        await actions.cancel(meeting, reason.trim() || null);
        toast.success("Meeting cancelled. Its link now says so.");
      }
      if (notify && hasGuests) await actions.announce(meeting.id);
      onDone();
      onOpenChange(false);
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    } finally {
      setBusy(false);
    }
  };

  const occurrenceWords = occurrence
    ? `${formatLongDate(occurrence.occurrenceStart, zone)}, ${formatTimeRange(occurrence.occurrenceStart, occurrence.durationMinutes, zone)}`
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (!busy ? onOpenChange(v) : undefined)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Cancel “{meeting.title}”?
          </DialogTitle>
          <DialogDescription>
            {series && occurrence && scope === "occurrence"
              ? "Only this date is taken off the series; every other occurrence and the link stay as they are"
              : "Nobody can join a cancelled meeting. The link stays and tells anyone who opens it that it was cancelled"}
            {hasGuests
              ? ". Guests who were invited get a cancellation that updates their calendar."
              : "."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {series && occurrence ? (
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as "occurrence" | "series")}
              className="space-y-2"
            >
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="occurrence" className="mt-0.5" />
                <span>
                  This occurrence
                  {occurrenceWords ? (
                    <span className="block text-xs text-muted-foreground">
                      {occurrenceWords}
                    </span>
                  ) : null}
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="series" /> The whole series
              </label>
            </RadioGroup>
          ) : null}
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional, guests see it)"
            rows={2}
            aria-label="Reason"
          />
          {hasGuests ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={notify}
                onCheckedChange={(v) => setNotify(v === true)}
              />
              Email guests the cancellation
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Keep meeting
          </Button>
          <Button
            variant="destructive"
            onClick={() => void run()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {series && occurrence && scope === "occurrence"
              ? "Cancel this occurrence"
              : "Cancel meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
