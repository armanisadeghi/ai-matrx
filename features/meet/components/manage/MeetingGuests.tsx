"use client";

// features/meet/components/manage/MeetingGuests.tsx
//
// A MEETING'S GUESTS — Google Calendar's guest list: who is invited, what each
// answered, add by name or email, remove, make co-host, and email the
// invitation. ONE component for the meeting page's Guests section and the
// Invite panel, so the two can never disagree about who is invited.
//
// Adding goes through the invitees door (`meet_add_invitees`), which also gives
// an account the meeting's share grant (a co-host gets admin); "Email new guests
// an invitation" (on by default) then calls `announce`, which sends each person
// exactly what they have not been told, with a calendar file and Yes / No /
// Maybe links. Removing archives the grant and revokes their RSVP link.

import { useState } from "react";
import { Send } from "lucide-react";
import type { MeetingInvitee, MeetingRecord } from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import {
  GuestPicker,
  guestName,
} from "@/features/meet/components/manage/GuestPicker";
import { RsvpBadge } from "@/features/meet/components/manage/RsvpControl";
import {
  errorSentence,
  useMeetingActions,
} from "@/features/meet/hooks/useMeetingActions";
import {
  inviteeToDraft,
  type DraftInvitee,
} from "@/features/meet/lib/meeting-draft";

export function MeetingGuests({
  meeting,
  invitees,
  canManage,
  onChanged,
  compact = false,
}: {
  meeting: MeetingRecord;
  invitees: readonly MeetingInvitee[];
  canManage: boolean;
  onChanged: () => void;
  /** Inside the Invite panel: no summary line. */
  compact?: boolean;
}) {
  const actions = useMeetingActions();
  const [busy, setBusy] = useState(false);
  const [emailNew, setEmailNew] = useState(true);
  const [sending, setSending] = useState(false);
  const drafts = invitees.map(inviteeToDraft);
  const byId = new Map(invitees.map((i) => [i.id, i]));
  const untold = invitees.filter((i) => i.lastSentSequence === null).length;
  const counts = {
    accepted: invitees.filter((i) => i.rsvpState === "accepted").length,
    declined: invitees.filter((i) => i.rsvpState === "declined").length,
    tentative: invitees.filter((i) => i.rsvpState === "tentative").length,
    waiting: invitees.filter((i) => i.rsvpState === "needs_action").length,
  };
  const live = meeting.endedAt === null || !!meeting.recurrenceRule;

  const apply = async (next: DraftInvitee[]) => {
    if (busy) return;
    setBusy(true);
    try {
      const added = next.filter((d) => d.inviteeId === null);
      const removed = invitees.filter(
        (i) => !next.some((d) => d.inviteeId === i.id),
      );
      const flipped = next.filter((d) => {
        const before = d.inviteeId ? byId.get(d.inviteeId) : undefined;
        return before !== undefined && (before.role === "cohost") !== d.cohost;
      });
      await actions.applyInvitees(meeting.id, {
        add: added,
        remove: removed,
        roleChanges: flipped.map((d) => ({
          invitee: byId.get(d.inviteeId!)!,
          cohost: d.cohost,
        })),
      });
      if (added.length > 0) {
        if (emailNew && live) await actions.announce(meeting.id);
        else toast.success(`Added. Email the invitation when you're ready.`);
      }
      if (removed.length > 0)
        toast.success(`${guestName(removed[0]!)} was removed.`);
      onChanged();
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      await actions.announce(meeting.id);
      onChanged();
    } finally {
      setSending(false);
    }
  };

  if (!canManage) {
    return invitees.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        The host can add guests. You can still send anyone the link.
      </p>
    ) : (
      <ul className="divide-y divide-border rounded-md border border-border">
        {invitees.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-2 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{guestName(row)}</span>
            {row.role === "cohost" ? (
              <span className="text-xs text-primary">Co-host</span>
            ) : null}
            <RsvpBadge state={row.rsvpState} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {!compact ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium">
            {invitees.length === 0
              ? "No guests yet"
              : `${invitees.length} ${invitees.length === 1 ? "guest" : "guests"}`}
          </span>
          {invitees.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {counts.accepted} yes · {counts.tentative} maybe ·{" "}
              {counts.declined} no · {counts.waiting} awaiting
            </span>
          ) : null}
        </div>
      ) : null}
      <GuestPicker
        guests={drafts}
        onChange={(next) => void apply(next)}
        organizationId={meeting.organizationId}
        hostUserId={meeting.hostUserId}
        renderStatus={(guest) => {
          const row = guest.inviteeId ? byId.get(guest.inviteeId) : undefined;
          if (!row) return null;
          return (
            <span className="flex flex-col items-end">
              <RsvpBadge state={row.rsvpState} />
              <span className="text-[10px] text-muted-foreground">
                {row.lastSentAt
                  ? `Emailed ${new Date(row.lastSentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                  : "Not emailed"}
              </span>
            </span>
          );
        }}
      />
      {live ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={emailNew}
              onCheckedChange={(v) => setEmailNew(v === true)}
            />
            Email new guests an invitation
          </label>
          {untold > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 gap-1.5"
              onClick={() => void send()}
              disabled={sending}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Email invitation to{" "}
              {untold === 1 ? "1 guest" : `${untold} guests`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
