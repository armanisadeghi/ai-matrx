"use client";

// features/meet/components/manage/useMeetingActionHost.tsx
//
// ONE DISPATCHER FOR EVERY MEETING ACTION, and the dialogs they open — the
// /meetings list and the meeting page run the same menu through here, so a
// "Cancel" means exactly one thing on both.

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  meetingLink,
  type MeetingInvitee,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { useShare } from "@/features/sharing/hooks/useShare";
import { meetingOrigin } from "@/features/meet/components/invite/MeetingInviteButton";
import { MeetingInviteDialog } from "@/features/meet/components/invite/MeetingInviteDialog";
import {
  MeetingFormDialog,
  type MeetingFormMode,
  type OccurrenceRef,
} from "@/features/meet/components/manage/MeetingFormDialog";
import { CancelMeetingDialog } from "@/features/meet/components/manage/CancelMeetingDialog";
import type { MeetingMenuAction } from "@/features/meet/components/manage/MeetingRowMenu";
import {
  errorSentence,
  useMeetingActions,
} from "@/features/meet/hooks/useMeetingActions";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

export function meetingHref(
  meeting: Pick<MeetingRecord, "id">,
  occurrence?: OccurrenceRef | null,
): string {
  const base = `/meetings/${meeting.id}`;
  return occurrence
    ? `${base}?at=${encodeURIComponent(occurrence.originalStart)}`
    : base;
}

type Open =
  | { kind: "form"; mode: MeetingFormMode; reschedule: boolean }
  | {
      kind: "cancel";
      meeting: MeetingRecord;
      occurrence: OccurrenceRef | null;
      hasGuests: boolean;
    }
  | { kind: "archive"; meeting: MeetingRecord; hasGuests: boolean }
  | { kind: "invite"; meeting: MeetingRecord }
  | null;

export function useMeetingActionHost({ onChanged }: { onChanged: () => void }) {
  const router = useRouter();
  const actions = useMeetingActions();
  const { copy, fallbackDialog } = useShare();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const loadInvitees = async (
    meeting: MeetingRecord,
  ): Promise<readonly MeetingInvitee[]> => {
    if (actions.repository === null) return [];
    try {
      return await actions.repository.invitees(meeting.id);
    } catch (thrown) {
      toast.error(`The guest list could not be read: ${errorSentence(thrown)}`);
      return [];
    }
  };

  // A WRITE with no organization chosen is HELD, not refused: the organization
  // picker opens, and the action runs the moment one is set.
  const [pending, setPending] = useState<Parameters<typeof perform> | null>(
    null,
  );
  const replay = useEffectEvent((args: Parameters<typeof perform>) => {
    void perform(...args);
  });
  useEffect(() => {
    if (!actions.ready || pending === null) return;
    setPending(null);
    replay(pending);
  }, [actions.ready, pending]);

  const run = async (...args: Parameters<typeof perform>) => {
    const [action] = args;
    const readOnly =
      action === "open" || action === "join" || action === "copy";
    if (!readOnly && !actions.ready) {
      setPending(args);
      try {
        await ensureOrgId(null);
      } catch {
        setPending(null);
      }
      return;
    }
    await perform(...args);
  };

  const perform = async (
    action: MeetingMenuAction,
    meeting: MeetingRecord,
    occurrence: OccurrenceRef | null = null,
    known?: readonly MeetingInvitee[],
  ) => {
    const link = meetingLink(meetingOrigin(), meeting.slug);
    if (typeof action === "object") {
      try {
        await actions.respond(meeting.id, action.rsvp);
        toast.success(
          action.rsvp === "accepted"
            ? "You're going."
            : action.rsvp === "declined"
              ? "You're not going."
              : "You might go.",
        );
        onChanged();
      } catch (thrown) {
        toast.error(errorSentence(thrown));
      }
      return;
    }
    switch (action) {
      case "open":
        startTransition(() => router.push(meetingHref(meeting, occurrence)));
        return;
      case "join":
        window.location.assign(link);
        return;
      case "copy": {
        const outcome = await copy(link, { title: "Copy meeting link" });
        if (outcome === "copied") toast.success("Meeting link copied.");
        return;
      }
      case "invite":
        setOpen({ kind: "invite", meeting });
        return;
      case "edit":
      case "reschedule":
      case "duplicate": {
        const invitees = known ?? (await loadInvitees(meeting));
        setOpen({
          kind: "form",
          reschedule: action === "reschedule",
          mode:
            action === "duplicate"
              ? { kind: "duplicate", meeting, invitees }
              : { kind: "edit", meeting, invitees, occurrence },
        });
        return;
      }
      case "cancel": {
        const invitees = known ?? (await loadInvitees(meeting));
        setOpen({
          kind: "cancel",
          meeting,
          occurrence,
          hasGuests: invitees.length > 0,
        });
        return;
      }
      case "archive": {
        const invitees = known ?? (await loadInvitees(meeting));
        setOpen({
          kind: "archive",
          meeting,
          hasGuests: invitees.some((i) => i.lastSentSequence !== null),
        });
        return;
      }
      case "restore":
        try {
          await actions.restore(meeting);
          toast.success("Meeting restored.");
          onChanged();
        } catch (thrown) {
          toast.error(errorSentence(thrown));
        }
        return;
    }
  };

  const dialogs = (
    <>
      {open?.kind === "form" ? (
        <MeetingFormDialog
          open
          onOpenChange={(v) => (!v ? setOpen(null) : undefined)}
          mode={open.mode}
          reschedule={open.reschedule}
          onSaved={(meeting) => {
            onChanged();
            if (open.mode.kind === "duplicate")
              startTransition(() => router.push(meetingHref(meeting)));
          }}
        />
      ) : null}
      {open?.kind === "cancel" ? (
        <CancelMeetingDialog
          open
          onOpenChange={(v) => (!v ? setOpen(null) : undefined)}
          meeting={open.meeting}
          occurrence={open.occurrence}
          hasGuests={open.hasGuests}
          onDone={onChanged}
        />
      ) : null}
      {open?.kind === "invite" ? (
        <MeetingInviteDialog
          open
          onOpenChange={(v) => {
            if (!v) {
              setOpen(null);
              onChanged();
            }
          }}
          meeting={open.meeting}
          link={meetingLink(meetingOrigin(), open.meeting.slug)}
          signedIn
        />
      ) : null}
      {open?.kind === "archive" ? (
        <ConfirmDialog
          open
          onOpenChange={(v) => (!v ? setOpen(null) : undefined)}
          title={`Archive “${open.meeting.title}”?`}
          description={
            open.meeting.endedAt !== null
              ? "It leaves your lists; its record, notes and recording are kept. Restore it from Archived at any time."
              : `It leaves your lists and its link stops admitting anyone${open.hasGuests ? "; everyone who was invited gets a cancellation email" : ""}. Restore it from Archived at any time.`
          }
          confirmLabel="Archive"
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await actions.archive(open.meeting);
              if (open.hasGuests && open.meeting.endedAt === null)
                await actions.announce(open.meeting.id);
              toast.success("Meeting archived.");
              setOpen(null);
              onChanged();
            } catch (thrown) {
              toast.error(errorSentence(thrown));
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {fallbackDialog}
    </>
  );

  return { run, dialogs };
}
