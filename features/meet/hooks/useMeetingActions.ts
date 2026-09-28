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

import { useState } from "react";
import {
  announceMeeting,
  createMeetRepository,
  asUserId,
  useMeetHost,
  type InviteeRole,
  type MeetingChanges,
  type MeetingInvitee,
  type MeetingRecord,
  type MeetingSettings,
  type RsvpAnswer,
} from "@ai-matrx/meet/react";
import { mergeJsonColumn } from "@ai-matrx/data/db";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { respondThroughServer } from "@/features/meet/lib/in-app-rsvp";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
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
  // READS need no organization (access is personal); without one the Meet
  // provider is inert, so reads go through a plain repository on the same client.
  const [plainRepository] = useState(() =>
    createMeetRepository({ client: supabase }),
  );
  const reduxUserId = useAppSelector(selectUserId);

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

  /**
   * Meet wave 4 — "Run a workflow after this meeting": the host's chosen
   * `workflow.definition` ids on `metadata.after_meeting_workflows`, merged
   * under the row's version CAS (a concurrent note-taker write is never lost).
   * aidream `services/meet/outcome.py` starts each one as the host when the
   * meeting's outcome is known.
   */
  const setAfterWorkflows = async (
    meetingId: MeetingRecord["id"],
    definitionIds: readonly string[],
  ): Promise<void> => {
    const db = supabase.schema("communication");
    const result = await mergeJsonColumn<{
      id: string;
      version: number;
      metadata: unknown;
    }>({
      fetchCurrent: () =>
        db
          .from("meet_meetings")
          .select("id, version, metadata")
          .eq("id", meetingId)
          .maybeSingle(),
      readColumn: (row) => row.metadata,
      merge: (current) => ({
        ...current,
        after_meeting_workflows: [...new Set(definitionIds)].map((id) => ({
          definition_id: id,
        })),
      }),
      applyUpdate: ({ value, expectedVersion, nextVersion }) =>
        db
          .from("meet_meetings")
          .update({ metadata: value as never, version: nextVersion })
          .eq("id", meetingId)
          .eq("version", expectedVersion)
          .select("id, version, metadata")
          .maybeSingle(),
    });
    if (result.status === "saved") return;
    throw new Error(
      result.status === "not_found"
        ? "This meeting could not be found or you cannot change it."
        : result.status === "conflict"
          ? "The meeting was changing while this was saved. Try again."
          : "The workflows could not be saved.",
    );
  };

  return {
    ready: host !== null && host.identity.userId !== null,
    userId: host?.identity.userId ?? reduxUserId,
    organizationId: host?.identity.organizationId ?? null,
    repository: host?.repository ?? plainRepository,
    announce,
    setAfterWorkflows,

    async create(
      draft: MeetingDraft,
      settings: MeetingSettings,
      notify: boolean,
      afterWorkflows: readonly string[] = [],
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
      if (afterWorkflows.length > 0) {
        try {
          await setAfterWorkflows(meeting.id, afterWorkflows);
        } catch (thrown) {
          toast.error(
            `The meeting is scheduled, but its after-meeting workflows were not saved: ${errorSentence(thrown)}`,
          );
        }
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

    /**
     * Going? — through aidream, which writes `meet_respond` for this person AND
     * tells the host when the answer changed (in-app-rsvp.ts). A server that does
     * not have the route yet (a deploy in flight) falls back to the database door
     * and SAYS so: the answer is saved, the host is not told.
     */
    async respond(meetingId: MeetingRecord["id"], answer: RsvpAnswer) {
      // ANSWERING NEEDS NO ORGANIZATION (access is personal). With none active the
      // Meet provider is inert, so there is no org-scoped aidream client; the answer
      // goes through the database door as the signed-in person. Before, this threw
      // "Sign in to manage meetings." at a signed-in invitee (2026-09-27).
      if (host === null || host.identity.userId === null) {
        if (!reduxUserId) throw new Error("Sign in to answer.");
        await plainRepository.respond(meetingId, answer, null);
        return { routeMissing: true, hostNotified: false };
      }
      const h = host;
      const result = await respondThroughServer(h.api, meetingId, answer, null);
      if (!result.routeMissing) return result;
      console.warn(
        "[meet] POST /api/v1/meet/meetings/{id}/rsvp did not take the answer (no route yet, or " +
          "a server failure) — it was saved through the database door and the host was NOT " +
          "notified. Remedy: deploy aidream with services/meet/rsvp.py::respond_in_app working.",
      );
      await h.repository.respond(meetingId, answer, null);
      return result;
    },
  };
}

export type MeetingActions = ReturnType<typeof useMeetingActions>;
