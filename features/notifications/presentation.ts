/**
 * features/notifications/presentation.ts — how a notice reads on a row.
 *
 * Pure functions, one home: the bell, the page, the phone sheet and the detail
 * pane all word a notice through these, so the three surfaces can never disagree
 * about a title or a time.
 *
 * - `bucketFor` mirrors the defaults `notifications_inbox_triage.sql` writes into
 *   `notification_event_type.config.bucket`. The door's value wins; this answers
 *   only for rows read through the pre-triage door, which carries no bucket.
 * - `categoryFor` picks the type icon and context word from the event family.
 * - `noticeTitle` falls back to the event type's label, never to the event key
 *   (RESEARCH.md T4: "hr › workflow › step_assigned" on screen).
 * - `noticePreview` is plain text on one line, links and markup stripped (T1).
 */
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Bell,
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileSignature,
  Globe,
  Inbox,
  KeyRound,
  Mail,
  MessageSquare,
  Newspaper,
  Printer,
  Share2,
  ShieldAlert,
  Table2,
  Trash2,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";
import { AGENT_ICON, INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import type { InboxNotification, NoticeBucket } from "./types";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { formatRelativeTime } from "@ai-matrx/kit/format";

const UPDATES_PREFIX =
  /^(records\.changed|news\.monitor\.|masterwork\.daily_drip|hr\.digest\.|knowledge\.saved_view_alert|pipeline\.stage_entered|personal_staff\.ack|print\.order_status_changed|hr\.recognition\.team_post|hr\.schedule\.(re)?published|hr\.announcement\.published|meet\.rsvp_received|custom\.form\.response|custom\.booking\.made|custom\.capture\.arrived|cms\.form_submission|esign\.signer_viewed)/;
const UPDATES_SUFFIX = /(campaign_progress|cost_warning|run_digest)$/;
const NEEDS_YOU_SUFFIX =
  /(_due|_overdue|_requested|_assigned|_reminder|_deadline|action_required|approval_needed|request_received|link_sent|link_requested|candidate_ready|prediction_outcome_due|request_needs_attention|request_changed|step_timeout_warning|step_escalated|step_delegated|inbox\.reminder|inbox\.snooze_ended|invitation|swap_requested|claim_submitted|request_submitted|failure_raised|verification_needed)$/;

/** The default bucket of an event key — the same three rules the migration seeds. */
export function bucketFor(eventKey: string): NoticeBucket {
  if (UPDATES_PREFIX.test(eventKey) || UPDATES_SUFFIX.test(eventKey)) return "updates";
  if (NEEDS_YOU_SUFFIX.test(eventKey)) return "needs_you";
  return "direct";
}

export function isNoticeBucket(value: unknown): value is NoticeBucket {
  return value === "needs_you" || value === "direct" || value === "updates";
}

export interface NoticeCategory {
  key: string;
  label: string;
  icon: LucideIcon;
}

const CATEGORIES: ReadonlyArray<readonly [RegExp, NoticeCategory]> = [
  [/^hr\.workflow\./, { key: "hr_workflow", label: "HR request", icon: Workflow }],
  [/^hr\.schedule\./, { key: "hr_schedule", label: "Schedule", icon: CalendarDays }],
  [/^hr\./, { key: "hr", label: "HR", icon: Users }],
  [/^(records\.|custom\.|pipeline\.)/, { key: "records", label: "Tables", icon: Table2 }],
  [/^news\./, { key: "news", label: "News monitor", icon: Newspaper }],
  [/^masterwork\./, { key: "masterwork", label: "Masterwork", icon: BookOpen }],
  [/^mandates\./, { key: "mandates", label: "Intelligence", icon: INTELLIGENCE_ICON }],
  [/^(agent\.|personal_staff\.)/, { key: "agents", label: "Agents", icon: AGENT_ICON }],
  [/^meet\./, { key: "meet", label: "Meetings", icon: CalendarDays }],
  [/^(share\.|iam\.invitation)/, { key: "sharing", label: "Sharing", icon: Share2 }],
  [/^platform\.access\./, { key: "access", label: "Access", icon: ShieldAlert }],
  [/^(esign\.|custom\.signature)/, { key: "esign", label: "Signatures", icon: FileSignature }],
  [/^(comment\.)/, { key: "comments", label: "Comments", icon: MessageSquare }],
  [/^task\./, { key: "tasks", label: "Tasks", icon: CheckSquare }],
  [/^print\./, { key: "print", label: "Print", icon: Printer }],
  [/^question_desk\./, { key: "question_desk", label: "Question desk", icon: Inbox }],
  [/^secure_delivery\./, { key: "secure", label: "Secure delivery", icon: KeyRound }],
  [/^cms\./, { key: "cms", label: "Website", icon: Globe }],
  [/^trash\./, { key: "trash", label: "Trash", icon: Trash2 }],
  [/^knowledge\./, { key: "knowledge", label: "Knowledge", icon: Mail }],
  [/reminder$/, { key: "reminder", label: "Reminder", icon: AlarmClock }],
  [/invit/, { key: "invite", label: "Invitation", icon: UserPlus }],
];
const FALLBACK_CATEGORY: NoticeCategory = { key: "other", label: "Notice", icon: Bell };

export function categoryFor(eventKey: string): NoticeCategory {
  for (const [pattern, category] of CATEGORIES) {
    if (pattern.test(eventKey)) return category;
  }
  return FALLBACK_CATEGORY;
}

/** A last resort that still reads as words: "hr.workflow.step_assigned" → "Step assigned". */
function humanizeKey(eventKey: string): string {
  const last = eventKey.split(".").pop() ?? eventKey;
  return humanizeIdentifier(last) || "Notice";
}

export function noticeTitle(row: Pick<InboxNotification, "subject" | "event_label" | "event_key">): string {
  return row.subject?.trim() || row.event_label?.trim() || humanizeKey(row.event_key);
}

/** One plain line: no markdown, no URLs, no mention markup. */
export function plainPreview(body: string | null, max = 140): string {
  if (!body) return "";
  const text = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/@\[([^\]]+)\]\([^)]*\)/g, "@$1")
    .replace(/[*_`#>~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Second line: context · preview. */
export function noticeContext(row: InboxNotification): string {
  const parts = [categoryFor(row.event_key).label];
  if (row.organization_name) parts.push(row.organization_name);
  return parts.join(" · ");
}

/** "now", "14m", "3h", "2d", then "Sep 3" / "Sep 3, 2025". */
export function shortTime(iso: string, now: Date = new Date()): string {
  return formatRelativeTime(iso, {
    suffix: false,
    minUnit: "minute",
    absoluteAfter: 7 * 86_400_000,
    absolute: "monthDay",
    now: now.getTime(),
    fallback: "",
  });
}

/** A FUTURE moment, short: "10:12 PM" today, otherwise "Oct 3". */
export function untilTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fullTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type TimeBucket = "Today" | "Yesterday" | "This week" | "Earlier";

export function timeBucketOf(iso: string, now: Date = new Date()): TimeBucket {
  const date = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = date.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 86_400_000) return "Yesterday";
  if (t >= startOfToday - 6 * 86_400_000) return "This week";
  return "Earlier";
}

/** Snooze choices (RESEARCH.md §3.5 `H`): 1 hour · Tomorrow 9am · Next week. */
export function snoozeChoices(now: Date = new Date()): { key: string; label: string; until: Date }[] {
  const inHour = new Date(now.getTime() + 3_600_000);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  nextWeek.setHours(9, 0, 0, 0);
  return [
    { key: "hour", label: "In 1 hour", until: inHour },
    { key: "tomorrow", label: "Tomorrow, 9 AM", until: tomorrow },
    { key: "next_week", label: "Next week", until: nextWeek },
  ];
}
