// features/meet/lib/meeting-template.ts
//
// MEETING TEMPLATES (Meet wave 4) — Zoom's meeting templates, plus the part
// Zoom cannot do: a template carries the workflows that run AFTER the meeting
// (a sales call updates the CRM and drafts the proposal; an interview writes the
// scorecard). Tiny, so knob-backed (one list per rung, no table):
//
//   meet.templates           the organization's templates (owners/admins write)
//   meet.personal_templates  the person's own templates
//
// A template is a meeting's settings without its time: title pattern, length,
// agenda, repeat rule, settings, guests, AI on/off, after-meeting workflows.
// `{date}` in the title becomes the meeting's date. Pure — tested.

import type { MeetingInvitee, MeetingRecord } from "@ai-matrx/meet";
import { NO_REPEAT, parseRrule } from "@/features/meet/lib/recurrence";
import type {
  DraftInvitee,
  DraftSettings,
  MeetingDraft,
} from "@/features/meet/lib/meeting-draft";

export type TemplateScope = "organization" | "personal";

export interface TemplateGuest {
  readonly userId: string | null;
  readonly email: string | null;
  readonly name: string | null;
  readonly cohost: boolean;
}

export interface MeetingTemplate {
  readonly id: string;
  readonly name: string;
  /** The meeting title; `{date}` becomes the meeting's date. */
  readonly title: string;
  readonly durationMinutes: number | null;
  readonly agenda: string;
  readonly recurrenceRule: string | null;
  readonly settings: Partial<DraftSettings>;
  readonly guests: readonly TemplateGuest[];
  /** `workflow.definition` ids started after each meeting made from it. */
  readonly afterWorkflows: readonly string[];
  readonly savedAt: string;
}

export interface ScopedTemplate extends MeetingTemplate {
  readonly scope: TemplateScope;
}

const POLICIES = new Set(["disabled", "host-controlled", "always-on"]);

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** One stored entry → a template, or null when it is not one (never guessed into shape). */
export function parseTemplate(raw: unknown): MeetingTemplate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const name = str(r.name);
  if (!id || !name) return null;
  const s = (
    r.settings && typeof r.settings === "object" ? r.settings : {}
  ) as Record<string, unknown>;
  const settings: { -readonly [K in keyof DraftSettings]?: DraftSettings[K] } =
    {};
  if (typeof s.lobbyEnabled === "boolean")
    settings.lobbyEnabled = s.lobbyEnabled;
  if (typeof s.joinBeforeHost === "boolean")
    settings.joinBeforeHost = s.joinBeforeHost;
  if (typeof s.aiEnabled === "boolean") settings.aiEnabled = s.aiEnabled;
  if (
    typeof s.recordingPolicy === "string" &&
    POLICIES.has(s.recordingPolicy)
  ) {
    settings.recordingPolicy =
      s.recordingPolicy as DraftSettings["recordingPolicy"];
  }
  const guests = (Array.isArray(r.guests) ? r.guests : []).flatMap((g) => {
    if (!g || typeof g !== "object") return [];
    const x = g as Record<string, unknown>;
    const userId = str(x.userId);
    const email = str(x.email)?.toLowerCase() ?? null;
    if (!userId && !email) return [];
    return [{ userId, email, name: str(x.name), cohost: x.cohost === true }];
  });
  const duration =
    typeof r.durationMinutes === "number" && r.durationMinutes > 0
      ? Math.floor(r.durationMinutes)
      : null;
  return {
    id,
    name,
    title: str(r.title) ?? name,
    durationMinutes: duration,
    agenda: typeof r.agenda === "string" ? r.agenda : "",
    recurrenceRule: str(r.recurrenceRule),
    settings,
    guests,
    afterWorkflows: (Array.isArray(r.afterWorkflows)
      ? r.afterWorkflows
      : []
    ).filter((w): w is string => typeof w === "string" && w.trim() !== ""),
    savedAt: str(r.savedAt) ?? "",
  };
}

export function parseTemplateList(raw: unknown): MeetingTemplate[] {
  return (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const t = parseTemplate(entry);
    return t ? [t] : [];
  });
}

/** `{date}` → the meeting's date, written the way a person reads it. */
export function resolveTitle(pattern: string, date: string): string {
  if (!pattern.includes("{date}")) return pattern;
  const [y, m, d] = date.split("-").map(Number);
  const words = Number.isFinite(y)
    ? new Date(Date.UTC(y!, m! - 1, d!, 12)).toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      })
    : date;
  return pattern.replaceAll("{date}", words);
}

/** A template poured into the form: its time stays the form's own. */
export function applyTemplate(
  draft: MeetingDraft,
  template: MeetingTemplate,
): MeetingDraft {
  const invitees: DraftInvitee[] = template.guests.map((g) => ({
    key: g.email ?? g.userId ?? g.name ?? Math.random().toString(36),
    inviteeId: null,
    userId: g.userId,
    email: g.email,
    displayName: g.name,
    cohost: g.cohost,
  }));
  return {
    ...draft,
    title: resolveTitle(template.title, draft.date),
    durationMinutes: template.durationMinutes ?? draft.durationMinutes,
    agenda: template.agenda || draft.agenda,
    recurrence: template.recurrenceRule
      ? parseRrule(template.recurrenceRule)
      : NO_REPEAT,
    invitees,
    settings: { ...draft.settings, ...template.settings },
  };
}

/** A saved meeting (and its guests and workflows) as a new template. */
export function templateFromMeeting(
  meeting: MeetingRecord,
  invitees: readonly MeetingInvitee[],
  name: string,
  afterWorkflows: readonly string[],
  now: Date = new Date(),
): MeetingTemplate {
  return {
    id: `tpl_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    title: meeting.title,
    durationMinutes: meeting.scheduledDurationMinutes ?? null,
    agenda: meeting.agenda ?? "",
    recurrenceRule: meeting.recurrenceRule ?? null,
    settings: {
      lobbyEnabled: meeting.lobbyEnabled,
      joinBeforeHost: meeting.joinBeforeHost ?? true,
      aiEnabled: meeting.aiEnabled,
      recordingPolicy: meeting.recordingPolicy,
    },
    guests: invitees.map((i) => ({
      userId: i.userId ?? null,
      email: i.email ?? null,
      name: i.displayName ?? null,
      cohost: i.role === "cohost",
    })),
    afterWorkflows: [...afterWorkflows],
    savedAt: now.toISOString(),
  };
}

/** The list with `template` added (a template of the same name is replaced). */
export function withTemplate(
  list: readonly MeetingTemplate[],
  template: MeetingTemplate,
): MeetingTemplate[] {
  const name = template.name.toLowerCase();
  return [
    ...list.filter(
      (t) => t.name.toLowerCase() !== name && t.id !== template.id,
    ),
    template,
  ];
}

export function withoutTemplate(
  list: readonly MeetingTemplate[],
  id: string,
): MeetingTemplate[] {
  return list.filter((t) => t.id !== id);
}
