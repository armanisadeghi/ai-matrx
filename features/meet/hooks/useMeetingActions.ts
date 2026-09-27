"use client";

// features/meet/hooks/useMeetingActions.ts
//
// EVERY MANAGEMENT WRITE, ONE PLACE. The write is a `communication.meet_*`
// database door through the package repository (the database decides who
// may); when invitees should hear about it, `announceMeeting` asks aidream to
// send what a browser cannot — the invitation / update / cancellation email
// with its `.ics` — and re-queue reminders. "Notify invitees" is on by default
// everywhere a person changes what invitees see.
//
// NOTHING FAILS SILENTLY: a write that fails throws its own sentence to the
// caller; a telling that fails after a successful write says the meeting IS
// saved and only the notice did not go out.

import {
  announceMeeting,
  asUserId,
  useMeetHost,
  type InviteeRole,
  type MeetingChanges,
  type MeetingInvitee,
  type MeetingRecord,
  type MeetingSettings,
  type RsvpAnswer,
} from "@ai-matrx/meet/react";
import { toast } from "@/lib/toast";
import {
  draftSchedule,
  type DraftInvitee,
  type MeetingDraft,
} from "@/features/meet/lib/meeting-draft";

export function errorSentence(thrown: unknown): string {
  if (thrown instanceof Error) {
    const remedy = (thrown as { remedy?: unknown }).remedy;
    return typeof remedy === "string" &&
      remedy.trim() !== "" &&
      !thrown.message.includes(remedy)
      ? `${thrown.message} ${remedy}`
      : thrown.message;
  }
  return "Something went wrong and nothing was changed.";
}

function inviteeInputs(people: readonly DraftInvitee[]) {
  return people.map((person) => ({
    ...(person.userId ? { userId: asUserId(person.userId) } : {}),
    ...(person.email ? { email: person.email } : {}),
    ...(person.displayName ? { displayName: person.displayName } : {}),
    role: (person.cohost ? "cohost" : "invitee") as InviteeRole,
  }));
}

export function useMeetingActions() {
  const host = useMeetHost();

  const require = () => {
    if (host === null || host.identity.userId === null) {
      throw new Error("Sign in to manage meetings.");
    }
    return host;
  };

  /** Tell invitees. Resolves true when it went out (or there was nothing to say). */
  const announce = async (
    meetingId: MeetingRecord["id"],
    quiet = false,
  ): Promise<boolean> => {
    const h = require();
    try {
      const result = await announceMeeting(h.api, meetingId);
      if (!quiet) {
        const told = result.invitations + result.updates + result.cancellations;
        if (told > 0) {
          toast.success(
            `${told === 1 ? "1 person was" : `${told} people were`} emailed with a calendar invitation.`,
          );
        }
      }
      return true;
    } catch (thrown) {
      toast.error(
        `The meeting is saved, but invitees were not notified: ${errorSentence(thrown)}`,
      );
      return false;
    }
  };

  return {
    ready: host !== null && host.identity.userId !== null,
    userId: host?.identity.userId ?? null,
    organizationId: host?.identity.organizationId ?? null,
    repository: host?.repository ?? null,
    announce,

    async create(
      draft: MeetingDraft,
      settings: MeetingSettings,
      notify: boolean,
    ) {
      const h = require();
      const { scheduledFor, recurrenceRule } = draftSchedule(draft);
      const meeting = await h.repository.scheduleMeeting({
        organizationId: h.identity.organizationId,
        hostUserId: h.identity.userId!,
        title: draft.title.trim(),
        scheduledFor,
        timeZone: draft.timeZone,
        durationMinutes: draft.durationMinutes,
        agenda: draft.agenda.trim() === "" ? null : draft.agenda.trim(),
        recurrenceRule,
        settings,
      });
      if (draft.invitees.length > 0) {
        await h.repository.addInvitees(
          meeting.id,
          inviteeInputs(draft.invitees),
          h.identity.userId,
        );
        if (notify) await announce(meeting.id);
      }
      return meeting;
    },

    async startInstant(title: string) {
      const h = require();
      return h.repository.getOrCreateMeeting({
        organizationId: h.identity.organizationId,
        hostUserId: h.identity.userId!,
        title,
        kind: "instant",
      });
    },

    async update(meeting: MeetingRecord, changes: MeetingChanges) {
      const h = require();
      return h.repository.updateMeeting(meeting.id, changes, {
        expectedVersion: meeting.version ?? null,
        byUserId: h.identity.userId,
      });
    },

    async applyInvitees(
      meetingId: MeetingRecord["id"],
      diff: {
        add: readonly DraftInvitee[];
        remove: readonly MeetingInvitee[];
        roleChanges: readonly { invitee: MeetingInvitee; cohost: boolean }[];
      },
    ) {
      const h = require();
      for (const invitee of diff.remove)
        await h.repository.removeInvitee(invitee.id, h.identity.userId);
      for (const change of diff.roleChanges) {
        await h.repository.setInviteeRole(
          change.invitee.id,
          change.cohost ? "cohost" : "invitee",
          h.identity.userId,
        );
      }
      if (diff.add.length > 0) {
        await h.repository.addInvitees(
          meetingId,
          inviteeInputs(diff.add),
          h.identity.userId,
        );
      }
    },

    async addInvitees(
      meetingId: MeetingRecord["id"],
      people: readonly DraftInvitee[],
    ) {
      const h = require();
      return h.repository.addInvitees(
        meetingId,
        inviteeInputs(people),
        h.identity.userId,
      );
    },

    async removeInvitee(invitee: MeetingInvitee) {
      const h = require();
      return h.repository.removeInvitee(invitee.id, h.identity.userId);
    },

    async setRole(invitee: MeetingInvitee, cohost: boolean) {
      const h = require();
      return h.repository.setInviteeRole(
        invitee.id,
        cohost ? "cohost" : "invitee",
        h.identity.userId,
      );
    },

    async cancel(meeting: MeetingRecord, reason: string | null) {
      const h = require();
      return h.repository.cancelMeeting(meeting.id, reason, h.identity.userId);
    },

    async archive(meeting: MeetingRecord) {
      const h = require();
      return h.repository.archiveMeeting(meeting.id, h.identity.userId);
    },

    async restore(meeting: MeetingRecord) {
      const h = require();
      return h.repository.restoreMeeting(meeting.id, h.identity.userId);
    },

    async setOccurrence(args: {
      meetingId: MeetingRecord["id"];
      originalStart: string;
      action: "cancel" | "move" | "restore";
      newStart?: string | null;
      newDurationMinutes?: number | null;
      reason?: string | null;
    }) {
      const h = require();
      return h.repository.setOccurrence({
        ...args,
        byUserId: h.identity.userId,
      });
    },

    async respond(meetingId: MeetingRecord["id"], answer: RsvpAnswer) {
      const h = require();
      return h.repository.respond(meetingId, answer, null);
    },
  };
}

export type MeetingActions = ReturnType<typeof useMeetingActions>;
