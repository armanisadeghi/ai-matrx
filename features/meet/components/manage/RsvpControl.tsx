"use client";

// features/meet/components/manage/RsvpControl.tsx
//
// "GOING?" — Yes / No / Maybe for a signed-in invitee, the way Google Calendar
// puts it at the bottom of an event. The answer goes through the database door
// `meet_respond` (the invitation IS the access decision: only a live invitee
// row for this person answers). Used on the meeting page and the pre-join
// screen; the emailed-link lane is `/rsvp/<secret>`.

import { useState } from "react";
import { Check, HelpCircle, X } from "lucide-react";
import type {
  MeetingRecord,
  RsvpAnswer,
  RsvpState,
} from "@ai-matrx/meet/react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  errorSentence,
  useMeetingActions,
} from "@/features/meet/hooks/useMeetingActions";

export const RSVP_WORDS: Record<RsvpState, string> = {
  accepted: "Yes",
  declined: "No",
  tentative: "Maybe",
  needs_action: "Awaiting reply",
};

const CHOICES: { answer: RsvpAnswer; label: string; icon: typeof Check }[] = [
  { answer: "accepted", label: "Yes", icon: Check },
  { answer: "declined", label: "No", icon: X },
  { answer: "tentative", label: "Maybe", icon: HelpCircle },
];

export function RsvpControl({
  meetingId,
  value,
  onAnswered,
  tone = "default",
  className,
}: {
  meetingId: MeetingRecord["id"];
  value: RsvpState | null;
  onAnswered?: (answer: RsvpAnswer) => void;
  /** `stage` = light glass on the dark meeting stage (the pre-join screen). */
  tone?: "default" | "stage";
  className?: string;
}) {
  const actions = useMeetingActions();
  const [current, setCurrent] = useState<RsvpState | null>(value);
  const [busy, setBusy] = useState<RsvpAnswer | null>(null);

  const answer = async (next: RsvpAnswer) => {
    if (busy !== null || next === current) return;
    setBusy(next);
    try {
      await actions.respond(meetingId, next);
      setCurrent(next);
      onAnswered?.(next);
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      role="group"
      aria-label="Going?"
    >
      <span
        className={cn(
          "mr-1 text-sm",
          tone === "stage"
            ? "text-[color:var(--mx-meet-stage-text)]"
            : "text-muted-foreground",
        )}
      >
        Going?
      </span>
      {CHOICES.map(({ answer: choice, label, icon: Icon }) => {
        const active = current === choice;
        return (
          <button
            key={choice}
            type="button"
            aria-pressed={active}
            onClick={() => void answer(choice)}
            disabled={busy !== null}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-60",
              tone === "stage"
                ? active
                  ? "bg-white text-black"
                  : "border border-white/30 bg-white/10 text-[color:var(--mx-meet-stage-text)] hover:bg-white/20"
                : active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-accent",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** A compact RSVP state label with a tone, for invitee lists. */
export function RsvpBadge({ state }: { state: RsvpState }) {
  const tone =
    state === "accepted"
      ? "text-emerald-600 dark:text-emerald-400"
      : state === "declined"
        ? "text-destructive"
        : state === "tentative"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";
  const Icon =
    state === "accepted" ? Check : state === "declined" ? X : HelpCircle;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", tone)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {RSVP_WORDS[state]}
    </span>
  );
}
