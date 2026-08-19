import { formatRemaining } from "./components/expiry";
import {
  ASSIST_URGENCY_META,
  urgencyFromPriority,
  type Assist,
  type AssistSourceKind,
} from "./types";
import {
  isSourceSuppressedUntil,
  formatAssistSourceLabel,
} from "./source-suppression";

export const ASSIST_SOURCE_KIND_OPTIONS: Array<{
  value: AssistSourceKind;
  label: string;
}> = [
  { value: "deterministic", label: "Noticed by the system" },
  { value: "agent", label: "Suggested by AI" },
  { value: "sweep", label: "Background review" },
  { value: "stream", label: "Live run" },
];

export function formatAssistDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatAssistStatus(assist: Assist, now = Date.now()): string {
  if (assist.status !== "pending") return assist.status;
  if (isSourceSuppressedUntil(assist.suppressedUntil)) {
    return "pending · source silenced";
  }
  if (assist.suppressedUntil && Date.parse(assist.suppressedUntil) > now) {
    return "pending · snoozed";
  }
  return "pending";
}

export function formatAssistExpiry(
  assist: Pick<Assist, "status" | "expiresAt">,
  now = Date.now(),
): string {
  if (assist.status === "pending" && assist.expiresAt) {
    const remaining = Date.parse(assist.expiresAt) - now;
    if (Number.isFinite(remaining) && remaining > 0) {
      return `in ${formatRemaining(remaining)}`;
    }
  }
  return formatAssistDate(assist.expiresAt);
}

export function humanAssistRow(assist: Assist): string {
  const urgency = ASSIST_URGENCY_META[urgencyFromPriority(assist.priority)];
  const sourceKind =
    ASSIST_SOURCE_KIND_OPTIONS.find(
      (option) => option.value === assist.sourceKind,
    )?.label ?? assist.sourceKind;
  return [
    `${assist.title} — ${urgency.label}`,
    assist.body ? `- Summary: ${assist.body}` : null,
    `- Producer: ${assist.sourceKey} (${formatAssistSourceLabel(assist.sourceKey)})`,
    `- Origin: ${sourceKind} · Surface: ${assist.surfaceName ?? "Global"}`,
    `- Confidence: ${typeof assist.confidence === "number" ? `${Math.round(assist.confidence * 100)}%` : "—"} · Status: ${formatAssistStatus(assist)}`,
    `- First noticed: ${formatAssistDate(assist.firstSeenAt ?? assist.createdAt)} · Expires: ${formatAssistExpiry(assist)}`,
    `- Seen: ${assist.occurrences > 1 ? `${assist.occurrences}×` : "once"} · Decided: ${formatAssistDate(assist.decidedAt)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** Compact projection of the same fields the manager row and AssistChip show. */
export function projectAssistRow(assist: Assist) {
  const urgency = ASSIST_URGENCY_META[urgencyFromPriority(assist.priority)];
  return {
    id: assist.id,
    title: assist.title,
    summary: assist.body,
    reasoning: assist.reasoning,
    producer: assist.sourceKey,
    producer_label: formatAssistSourceLabel(assist.sourceKey),
    origin:
      ASSIST_SOURCE_KIND_OPTIONS.find(
        (option) => option.value === assist.sourceKind,
      )?.label ?? assist.sourceKind,
    surface: assist.surfaceName ?? "Global",
    urgency: urgency.label,
    priority: assist.priority,
    confidence_percent:
      typeof assist.confidence === "number"
        ? Math.round(assist.confidence * 100)
        : null,
    status: formatAssistStatus(assist),
    first_noticed: assist.firstSeenAt ?? assist.createdAt,
    expires: assist.expiresAt,
    occurrences: assist.occurrences,
    decided_at: assist.decidedAt,
    evidence: assist.evidence,
  };
}
