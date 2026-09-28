/**
 * Surface manifest — Meeting (`matrx-user/meeting`).
 *
 * ONE meeting, before, during and after it: its home at `/meetings/[id]` and a
 * meeting on the Board. Both mount the same host, `MeetingSurfaceHost`
 * (`features/meet/agent-surface/`), which reads the meeting, its guests and
 * occurrences from the page's own load, and — once the meeting has happened —
 * its durable record (summary, decisions, action items, notes, transcript)
 * from the package's `useMeetingRecord`, the same bundle the Record tab reads.
 *
 * WRITE: only what the meeting feature's canonical write path
 * (`useMeetingActions` → the package repository's `updateMeeting`) can do, and
 * only where the page's own Edit / Settings controls would let this viewer:
 * the title, the agenda, and the AI note-taker. Invitees are told, as the
 * page's own edit does. Deliberately NOT targets: the schedule (a reschedule
 * re-sends every invitation — a person decides), guests (who is invited is a
 * person's call), cancel / archive, and the meeting's notes, decisions and
 * action items — those are written by the note-taker and the wrap-up on the
 * server, and the client has no canonical write for them.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "meeting_identity",
    label: "Meeting",
    sortOrder: 100,
    description: "Which meeting this is, when it happens, and where it stands.",
  },
  {
    key: "meeting_people",
    label: "People",
    sortOrder: 200,
    description: "Who is invited, how they answered, and who ran it.",
  },
  {
    key: "meeting_plan",
    label: "Plan and settings",
    sortOrder: 300,
    description: "The agenda, the host's prepared brief, and the meeting's settings.",
  },
  {
    key: "meeting_record",
    label: "What happened",
    sortOrder: 400,
    description:
      "After the meeting: the wrap-up summary, decisions, action items, notes as it happened, who attended, and the transcript.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Meeting ──────────────────────────────────────────────────────────
  {
    name: "meeting_id",
    label: "Meeting id",
    description: "UUID of the meeting on screen. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "meeting_identity",
    sortOrder: 300,
  },
  {
    name: "meeting_title",
    label: "Meeting title",
    description: "The meeting's title, as its page shows it. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    group: "meeting_identity",
    sortOrder: 310,
  },
  {
    name: "meeting_status",
    label: "Meeting status",
    description:
      "Where the meeting stands: scheduled | live | ended | cancelled | archived | unscheduled. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    group: "meeting_identity",
    sortOrder: 320,
  },
  {
    name: "meeting_kind",
    label: "Meeting kind",
    description: "instant | scheduled | recurring. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    group: "meeting_identity",
    sortOrder: 330,
  },
  {
    name: "scheduled_for",
    label: "Scheduled for",
    description:
      "ISO start of the meeting (for a series, of its first occurrence). Empty for an instant meeting with no scheduled time.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "meeting_identity",
    sortOrder: 340,
  },
  {
    name: "duration_minutes",
    label: "Length (minutes)",
    description: "The scheduled length in minutes. Empty when none was set.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "meeting_identity",
    sortOrder: 350,
  },
  {
    name: "time_zone",
    label: "Time zone",
    description: "The IANA zone the meeting's time is authored in (e.g. America/Los_Angeles). Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "meeting_identity",
    sortOrder: 360,
  },
  {
    name: "recurrence_rule",
    label: "Repeats",
    description: "The series' RFC 5545 RRULE (e.g. FREQ=WEEKLY;BYDAY=MO). Empty for a one-off meeting.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "meeting_identity",
    sortOrder: 370,
  },
  {
    name: "next_occurrences",
    label: "Next occurrences",
    description:
      "For a series: the upcoming occurrences the page lists, [{ original_start, occurrence_start, state }]. Empty array for a one-off meeting or when none are upcoming.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 600,
    autoContext: false,
    group: "meeting_identity",
    sortOrder: 380,
  },
  {
    name: "meeting_link",
    label: "Meeting link",
    description: "The link people use to join. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    group: "meeting_identity",
    sortOrder: 390,
  },
  {
    name: "started_at",
    label: "Started at",
    description: "ISO time the meeting actually started. Empty until it has started.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "meeting_identity",
    sortOrder: 400,
  },
  {
    name: "ended_at",
    label: "Ended at",
    description: "ISO time the meeting ended. Empty until it has ended.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "meeting_identity",
    sortOrder: 410,
  },
  {
    name: "cancellation_reason",
    label: "Cancellation reason",
    description: "Why the meeting was cancelled, when it was and a reason was given.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "meeting_identity",
    sortOrder: 420,
  },

  // ── People ───────────────────────────────────────────────────────────
  {
    name: "viewer_role",
    label: "Your role",
    description:
      "The signed-in person's role in this meeting: host | cohost | invitee | member (can see it without being invited). Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "meeting_people",
    sortOrder: 300,
  },
  {
    name: "can_manage",
    label: "Can manage",
    description:
      "True when the signed-in person is the host or a co-host — the people who may edit the meeting (and so the only ones whose agent writes are accepted).",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "meeting_people",
    sortOrder: 310,
  },
  {
    name: "participants",
    label: "Guests",
    description:
      "Everyone invited: [{ name, email, role (invitee|cohost), rsvp (needs_action|accepted|declined|tentative), rsvp_note }]. Always an array (empty when nobody was invited).",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    group: "meeting_people",
    sortOrder: 320,
  },
  {
    name: "participant_count",
    label: "Guest count",
    description: "How many people are invited. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "meeting_people",
    sortOrder: 330,
  },
  {
    name: "attendees",
    label: "Who attended",
    description:
      "After it happened: who was in the room [{ name, role, joined_at, left_at }], from the durable attendance record. Absent before the meeting has happened or when the record is not readable.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "meeting_people",
    sortOrder: 340,
  },

  // ── Plan and settings ────────────────────────────────────────────────
  {
    name: "agenda",
    label: "Agenda",
    description: "The meeting's agenda / description text (markdown). Empty when none was written.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "meeting_plan",
    sortOrder: 300,
  },
  {
    name: "brief",
    label: "Prepared brief",
    description:
      "The host's pre-meeting brief, when one has been prepared (the page's Prepare action). Empty otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    group: "meeting_plan",
    sortOrder: 310,
  },
  {
    name: "meeting_settings",
    label: "Meeting settings",
    description:
      "{ waiting_room, join_before_host, ai_note_taker, recording_policy (disabled|host-controlled|always-on) }. Always present.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 120,
    group: "meeting_plan",
    sortOrder: 320,
  },

  // ── What happened ────────────────────────────────────────────────────
  {
    name: "summary",
    label: "Summary",
    description:
      "The wrap-up summary written after the meeting. Absent before the meeting has happened, while the wrap-up is still being written, or when this reader may not see it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    group: "meeting_record",
    sortOrder: 300,
  },
  {
    name: "decisions",
    label: "Decisions",
    description:
      "What the meeting decided — the wrap-up's authoritative set, one string each. Absent before the record exists.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "meeting_record",
    sortOrder: 310,
  },
  {
    name: "action_items",
    label: "Action items",
    description:
      "The wrap-up's action items: [{ id, text, owner }]. Absent before the record exists. The person turns one into a task from the page.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "meeting_record",
    sortOrder: 320,
  },
  {
    name: "notes",
    label: "Notes as it happened",
    description:
      "The note-taker's live notes, one per window, in order. Absent before the record exists or when the meeting had no note-taker.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    group: "meeting_record",
    sortOrder: 330,
  },
  {
    name: "transcript_excerpt",
    label: "Transcript excerpt",
    description:
      "The start of the durable transcript as \"Speaker: line\" text, bounded to a few thousand characters (the whole transcript is on the page). Absent when the meeting has no transcript or it is not readable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    group: "meeting_record",
    sortOrder: 340,
  },
  {
    name: "record_restrictions",
    label: "What you cannot see",
    description:
      "Parts of the record this reader was refused (a guest's limited access, a failed read), as the page states them. Absent when everything was readable — an absent summary is then genuinely absent.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "meeting_record",
    sortOrder: 350,
  },
];

/**
 * Every target is `mode: "entity"` (the meeting page has no draft buffer — its
 * Edit dialog and Settings rows save on commit) and `applyPolicy: "ask"`
 * (changing what invitees see emails them). Each handler refuses in `validate`
 * when the page itself would not let this viewer make the change.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "meeting_title",
    label: "Meeting title",
    description:
      "Renames the meeting immediately through its canonical update, and tells invitees as the page's own Edit does. Value: a non-empty plain-text title. Refused unless can_manage is true and the meeting is not ended, cancelled or archived.",
    valueType: "string",
    updatesValue: "meeting_title",
    mode: "entity",
    applyPolicy: "ask",
    group: "meeting_identity",
    sortOrder: 100,
  },
  {
    name: "meeting_agenda",
    label: "Meeting agenda",
    description:
      "Replaces the meeting's whole agenda (markdown) immediately through its canonical update, and tells invitees as the page's own Edit does. Value: the full agenda text; an empty string clears it. Read agenda first and include what should stay. Refused unless can_manage is true and the meeting is not ended, cancelled or archived.",
    valueType: "string",
    updatesValue: "agenda",
    approvalComparison: "text-replacement",
    mode: "entity",
    applyPolicy: "ask",
    group: "meeting_plan",
    sortOrder: 100,
  },
  {
    name: "ai_note_taker",
    label: "AI note-taker",
    description:
      "Turns the meeting's AI note-taker on (true) or off (false), saved immediately — the same switch as the page's Settings. Refused unless can_manage is true and the meeting is not cancelled or archived.",
    valueType: "boolean",
    updatesValue: "meeting_settings",
    mode: "entity",
    applyPolicy: "ask",
    group: "meeting_plan",
    sortOrder: 110,
  },
];

export const meetingManifest: SurfaceManifest = {
  surfaceName: "matrx-user/meeting",
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "One meeting — its time, guests, agenda and settings, and after it happened, its summary, decisions, action items, notes and transcript.",
  readiness: "partial",
  readinessNote:
    "Values, write targets and the shared host are wired on /meetings/[id] and a meeting on the Board. Not yet certified (S1–S18) and no bound-agent Matrx-vs-matrix walk has been run.",
  label: "Meeting",
  urlPattern: "/meetings/[id]",
  intro: `<surface_intro>
You are on ONE meeting's home — before, during and after it.
meeting_title, meeting_status, scheduled_for / time_zone / recurrence_rule and meeting_link say what the meeting is and when. participants is everyone invited with their answer; viewer_role and can_manage say what the person looking at it may change.
agenda and brief are the plan; meeting_settings its switches.
Once it has happened, summary, decisions, action_items, notes and transcript_excerpt are what it produced, from the durable record. record_restrictions names anything this person may not read — never treat a refused part as empty.
meeting_title, meeting_agenda and ai_note_taker change the meeting exactly like the page's own controls, and the person approves each one; invitees are told of a title or agenda change.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  // Which record, at a glance.
  briefValues: ["meeting_title", "meeting_status", "scheduled_for", "participant_count"],
  writeTargets,
};

/** One guest as emitted in `participants`. */
export interface MeetingParticipantEntry {
  name: string;
  email: string | null;
  role: string;
  rsvp: string;
  rsvp_note: string | null;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createMeetingScope(values: {
  // alwaysAvailable: true → required
  meeting_id: string;
  meeting_title: string;
  meeting_status: string;
  meeting_kind: string;
  next_occurrences: Array<{ original_start: string; occurrence_start: string; state: string }>;
  meeting_link: string;
  viewer_role: string;
  can_manage: boolean;
  participants: MeetingParticipantEntry[];
  participant_count: number;
  meeting_settings: {
    waiting_room: boolean;
    join_before_host: boolean;
    ai_note_taker: boolean;
    recording_policy: string;
  };
  // alwaysAvailable: false → optional
  scheduled_for?: string;
  duration_minutes?: number;
  time_zone?: string;
  recurrence_rule?: string;
  started_at?: string;
  ended_at?: string;
  cancellation_reason?: string;
  attendees?: Array<{ name: string; role: string; joined_at: string | null; left_at: string | null }>;
  agenda?: string;
  brief?: string;
  summary?: string;
  decisions?: string[];
  action_items?: Array<{ id: string; text: string; owner: string | null }>;
  notes?: string[];
  transcript_excerpt?: string;
  record_restrictions?: string[];
  selection?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
