// features/meet/lib/meeting-draft.ts
//
// WHAT THE MEETING FORM HOLDS, and how it becomes the database doors' inputs.
// One model for create, edit and duplicate — the same form everywhere (PARITY
// 1.5). Pure: the form, the detail page and the tests all read it.

import type {
  MeetingChanges,
  MeetingInvitee,
  MeetingRecord,
  MeetingSettings,
  RecordingPolicy,
} from "@ai-matrx/meet";
import {
  NO_REPEAT,
  buildRrule,
  parseRrule,
  type RecurrenceSpec,
} from "@/features/meet/lib/recurrence";
import { utcToZoned, zonedToUtcIso } from "@/features/meet/lib/zoned-time";

export interface DraftInvitee {
  /** Stable React key: the invitee row id once saved, else the address/user. */
  readonly key: string;
  /** Set once the person is on the meeting's invitation list. */
  readonly inviteeId: string | null;
  readonly userId: string | null;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly cohost: boolean;
}

export interface DraftSettings {
  readonly lobbyEnabled: boolean;
  readonly joinBeforeHost: boolean;
  readonly aiEnabled: boolean;
  readonly recordingPolicy: RecordingPolicy;
}

export interface MeetingDraft {
  readonly title: string;
  /** `YYYY-MM-DD` on the clock in `timeZone`. */
  readonly date: string;
  /** `HH:MM` on the clock in `timeZone`. */
  readonly time: string;
  readonly timeZone: string;
  readonly durationMinutes: number;
  readonly recurrence: RecurrenceSpec;
  readonly agenda: string;
  readonly invitees: readonly DraftInvitee[];
  readonly settings: DraftSettings;
}

export const DURATION_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240] as const;

export const RECORDING_POLICY_LABELS: Record<RecordingPolicy, string> = {
  "host-controlled": "Host starts it",
  "always-on": "Record automatically",
  disabled: "Never record",
};

/** The platform's own defaults — what the settings show until the person's knobs load. */
export const PLATFORM_DEFAULT_SETTINGS: DraftSettings = {
  lobbyEnabled: true,
  joinBeforeHost: true,
  aiEnabled: true,
  recordingPolicy: "host-controlled",
};

/** "30 min", "1 hr", "1 hr 30 min". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** The next half hour from `now`, on the clock in `zone` — where a new meeting starts. */
export function nextHalfHour(
  now: Date,
  zone: string,
): { date: string; time: string } {
  const step = 30 * 60_000;
  const next = new Date(Math.ceil((now.getTime() + 60_000) / step) * step);
  const parts = utcToZoned(next.toISOString(), zone);
  return { date: parts.date, time: parts.time };
}

export function emptyDraft(
  zone: string,
  now: Date = new Date(),
  defaults: DraftSettings = PLATFORM_DEFAULT_SETTINGS,
  durationMinutes = 60,
): MeetingDraft {
  const start = nextHalfHour(now, zone);
  return {
    title: "",
    date: start.date,
    time: start.time,
    timeZone: zone,
    durationMinutes,
    recurrence: NO_REPEAT,
    agenda: "",
    invitees: [],
    settings: defaults,
  };
}

export function inviteeToDraft(invitee: MeetingInvitee): DraftInvitee {
  return {
    key: invitee.id,
    inviteeId: invitee.id,
    userId: invitee.userId,
    email: invitee.email,
    displayName: invitee.displayName,
    cohost: invitee.role === "cohost",
  };
}

/** An existing meeting as the form's starting point. */
export function meetingToDraft(
  meeting: MeetingRecord,
  invitees: readonly MeetingInvitee[],
  fallbackZone: string,
  now: Date = new Date(),
): MeetingDraft {
  const zone = meeting.timeZone ?? fallbackZone;
  const start =
    meeting.scheduledFor !== null
      ? utcToZoned(meeting.scheduledFor, zone)
      : nextHalfHour(now, zone);
  return {
    title: meeting.title,
    date: start.date,
    time: start.time,
    timeZone: zone,
    durationMinutes: meeting.scheduledDurationMinutes ?? 60,
    recurrence: parseRrule(meeting.recurrenceRule),
    agenda: meeting.agenda ?? "",
    invitees: invitees.map(inviteeToDraft),
    settings: {
      lobbyEnabled: meeting.lobbyEnabled,
      joinBeforeHost: meeting.joinBeforeHost ?? true,
      aiEnabled: meeting.aiEnabled,
      recordingPolicy: meeting.recordingPolicy,
    },
  };
}

/** A copy for "Duplicate": same shape, next free slot, nobody invited yet. */
export function duplicateDraft(
  draft: MeetingDraft,
  now: Date = new Date(),
): MeetingDraft {
  // Same time of day. The original date if it is still ahead; otherwise the
  // next date on the SAME weekday, so a copied "every Tuesday" still starts on
  // a Tuesday.
  let date = draft.date;
  let when = zonedToUtcIso(date, draft.time, draft.timeZone);
  if (new Date(when).getTime() <= now.getTime()) {
    const weekday = utcToZoned(when, draft.timeZone).weekday;
    const today = utcToZoned(now.toISOString(), draft.timeZone);
    const [y, m, d] = today.date.split("-").map(Number);
    for (let add = 0; add <= 7; add += 1) {
      const candidate = new Date(Date.UTC(y!, m! - 1, d! + add))
        .toISOString()
        .slice(0, 10);
      when = zonedToUtcIso(candidate, draft.time, draft.timeZone);
      if (
        utcToZoned(when, draft.timeZone).weekday === weekday &&
        new Date(when).getTime() > now.getTime()
      ) {
        date = candidate;
        break;
      }
    }
  }
  return {
    ...draft,
    title: `${draft.title} (copy)`,
    date,
    invitees: draft.invitees.map((i) => ({
      ...i,
      key: i.email ?? i.userId ?? i.key,
      inviteeId: null,
    })),
  };
}

/** Start instant + rule, as the doors take them. */
export function draftSchedule(draft: MeetingDraft): {
  scheduledFor: string;
  recurrenceRule: string | null;
} {
  const scheduledFor = zonedToUtcIso(draft.date, draft.time, draft.timeZone);
  const start = utcToZoned(scheduledFor, draft.timeZone);
  return { scheduledFor, recurrenceRule: buildRrule(draft.recurrence, start) };
}

/** Settings the person CHANGED from the defaults they were shown — the rest stay knob-driven. */
export function changedSettings(
  draft: DraftSettings,
  shown: DraftSettings,
): MeetingSettings {
  const out: { -readonly [K in keyof MeetingSettings]: MeetingSettings[K] } =
    {};
  if (draft.lobbyEnabled !== shown.lobbyEnabled)
    out.lobbyEnabled = draft.lobbyEnabled;
  if (draft.joinBeforeHost !== shown.joinBeforeHost)
    out.joinBeforeHost = draft.joinBeforeHost;
  if (draft.aiEnabled !== shown.aiEnabled) out.aiEnabled = draft.aiEnabled;
  if (draft.recordingPolicy !== shown.recordingPolicy)
    out.recordingPolicy = draft.recordingPolicy;
  return out;
}

/** The edit, as a `meet_update_meeting` patch carrying ONLY what changed. */
export function draftChanges(
  meeting: MeetingRecord,
  draft: MeetingDraft,
): MeetingChanges {
  const { scheduledFor, recurrenceRule } = draftSchedule(draft);
  const changes: { -readonly [K in keyof MeetingChanges]: MeetingChanges[K] } =
    {};
  const title = draft.title.trim();
  if (title !== meeting.title) changes.title = title;
  const agenda = draft.agenda.trim() === "" ? null : draft.agenda.trim();
  if (agenda !== (meeting.agenda ?? null)) changes.agenda = agenda;
  if (draft.timeZone !== (meeting.timeZone ?? draft.timeZone))
    changes.timeZone = draft.timeZone;
  if (
    meeting.scheduledFor === null ||
    new Date(meeting.scheduledFor).getTime() !==
      new Date(scheduledFor).getTime()
  ) {
    changes.scheduledFor = scheduledFor;
  }
  if (draft.durationMinutes !== meeting.scheduledDurationMinutes) {
    changes.scheduledDurationMinutes = draft.durationMinutes;
  }
  if ((recurrenceRule ?? null) !== (meeting.recurrenceRule ?? null))
    changes.recurrenceRule = recurrenceRule;
  const settings = changedSettings(draft.settings, {
    lobbyEnabled: meeting.lobbyEnabled,
    joinBeforeHost: meeting.joinBeforeHost ?? true,
    aiEnabled: meeting.aiEnabled,
    recordingPolicy: meeting.recordingPolicy,
  });
  return { ...changes, ...settings };
}

/** True when the edit moves WHEN the meeting happens (the part a single occurrence can take). */
export function changesTiming(changes: MeetingChanges): boolean {
  return (
    changes.scheduledFor !== undefined ||
    changes.scheduledDurationMinutes !== undefined
  );
}

/**
 * True when an edit moves a SERIES itself — its first start, its rule or its
 * zone — which is when the database re-homes (or archives) every per-date
 * change. Mirrors `v_series_changed` in `communication.meet_update_meeting`.
 */
export function movesSeries(
  meeting: Pick<MeetingRecord, "recurrenceRule" | "scheduledFor" | "timeZone">,
  changes: MeetingChanges,
): boolean {
  if (!meeting.recurrenceRule) return false;
  const moved = (a: string | null | undefined, b: string | null | undefined) =>
    a !== undefined && (a ?? null) !== (b ?? null);
  return (
    (changes.scheduledFor !== undefined &&
      changes.scheduledFor !== null &&
      meeting.scheduledFor !== null &&
      Date.parse(changes.scheduledFor) !== Date.parse(meeting.scheduledFor)) ||
    moved(changes.recurrenceRule, meeting.recurrenceRule) ||
    moved(changes.timeZone, meeting.timeZone)
  );
}

/** Invitee changes: who to add (and as what), who to remove, whose role flips. */
export function inviteeDiff(
  saved: readonly MeetingInvitee[],
  draft: readonly DraftInvitee[],
): {
  add: DraftInvitee[];
  remove: MeetingInvitee[];
  roleChanges: { invitee: MeetingInvitee; cohost: boolean }[];
} {
  const draftIds = new Set(
    draft.map((d) => d.inviteeId).filter((id): id is string => id !== null),
  );
  const remove = saved.filter((s) => !draftIds.has(s.id));
  const add = draft.filter((d) => d.inviteeId === null);
  const roleChanges = draft.flatMap((d) => {
    const before = saved.find((s) => s.id === d.inviteeId);
    if (!before) return [];
    return (before.role === "cohost") !== d.cohost
      ? [{ invitee: before, cohost: d.cohost }]
      : [];
  });
  return { add, remove, roleChanges };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

/** Why the form cannot be saved yet, or null. */
export function draftProblem(draft: MeetingDraft): string | null {
  if (draft.title.trim() === "") return "Give the meeting a title.";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    !/^\d{2}:\d{2}$/.test(draft.time)
  ) {
    return "Choose a date and a start time.";
  }
  if (
    draft.recurrence.frequency === "weekly" &&
    draft.recurrence.interval < 1
  ) {
    return "Repeat every 1 week or more.";
  }
  if (
    draft.recurrence.ends.kind === "on" &&
    draft.recurrence.ends.date < draft.date
  ) {
    return "The repeat end date is before the first meeting.";
  }
  if (
    draft.recurrence.ends.kind === "after" &&
    draft.recurrence.ends.count < 1
  ) {
    return "End after at least one occurrence.";
  }
  return null;
}
