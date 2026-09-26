/**
 * Decision review — the pure half: reading a ledger row into a queue item,
 * ordering the queue, and the keyboard map.
 *
 * An item is one `platform.judge_verdict` row with `subject_kind =
 * 'decision_answer'`: one answered question of one decision turn, captured
 * server-side by the chat.message trigger (aidream migration 1170), whatever
 * surface ran the agent. Contract: aidream `services/decision_review/FEATURE.md`.
 */

import { isJsonObject } from "@/types/json";
import {
  readDecisionAnswers,
  type DecisionAnswersView,
  type DecisionMethod,
} from "@/features/agents/decision-answers/read";

export const DECISION_SUBJECT_KIND = "decision_answer" as const;

export function decisionJudgeKey(agentId: string): string {
  return `agent:${agentId}`;
}

export interface ReviewOption {
  key: string;
  label: string;
}

export interface ReviewItem {
  id: string;
  /** The item's own organization — a label is a write on THIS record, in its org. */
  organizationId: string | null;
  question: string;
  version: number;
  model: string | null;
  method: DecisionMethod | null;
  answerType: "noul" | "choice" | "score" | "unknown";
  /** The model's answer in label vocabulary (noul true|false, choice key, score level). */
  verdict: string;
  /** The model's own confidence. The queue sorts on this. */
  confidence: number | null;
  /** Probability the model gave the answer it chose. */
  pAnswer: number | null;
  options: ReviewOption[];
  instructions: string | null;
  suggestedThreshold: number | null;
  /** The human's answer, when one exists. */
  label: string | null;
  agreed: boolean | null;
  messageId: string | null;
  conversationId: string | null;
  createdAt: string;
  /** The answer as the answers primitive reads it (distribution, legend). */
  view: DecisionAnswersView | null;
}

export interface JudgeVerdictRow {
  id: string;
  organization_id?: string | null;
  question: string;
  judge_version: number;
  model: string | null;
  verdict: string;
  confidence: number | null;
  authority_verdict: string | null;
  agreed: boolean | null;
  subject_ref_id: string | null;
  created_at: string;
  metadata: unknown;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

const METHODS: DecisionMethod[] = ["native", "verbalized", "verbalized_calibrated"];

export function readReviewItem(row: JudgeVerdictRow): ReviewItem {
  const meta: Record<string, unknown> = isJsonObject(row.metadata)
    ? row.metadata
    : {};
  const answerTypeRaw = str(meta.answer_type);
  const answerType =
    answerTypeRaw === "noul" || answerTypeRaw === "choice" || answerTypeRaw === "score"
      ? answerTypeRaw
      : "unknown";
  const methodRaw = str(meta.method);
  const method = METHODS.includes(methodRaw as DecisionMethod)
    ? (methodRaw as DecisionMethod)
    : null;
  const options: ReviewOption[] = Array.isArray(meta.options)
    ? (meta.options as unknown[]).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const key = record.key == null ? null : String(record.key);
        if (key == null) return [];
        return [{ key, label: str(record.label) ?? key }];
      })
    : [];

  const view = readDecisionAnswers({
    model: row.model,
    method,
    answers: {
      [row.question]: {
        type: answerTypeRaw,
        answer: meta.answer ?? null,
        probability: meta.probability ?? null,
        probabilities: meta.probabilities ?? null,
        legend: meta.legend ?? null,
        confidence: row.confidence,
        instructions: str(meta.instructions),
        suggested_threshold: meta.suggested_threshold ?? null,
      },
    },
  });

  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    question: row.question,
    version: row.judge_version,
    model: row.model,
    method,
    answerType,
    verdict: row.verdict,
    confidence: num(row.confidence),
    pAnswer: num(meta.p_answer),
    options,
    instructions: str(meta.instructions),
    suggestedThreshold: num(meta.suggested_threshold),
    label: row.authority_verdict,
    agreed: row.agreed,
    messageId: row.subject_ref_id,
    conversationId: str(meta.conversation_id),
    createdAt: row.created_at,
    view,
  };
}

/**
 * Lowest confidence first — the answers most worth a person's minute. An
 * item with no confidence at all is least known of all, so it leads. Ties go
 * to the newest answer.
 */
export function compareQueueItems(a: ReviewItem, b: ReviewItem): number {
  const ca = a.confidence ?? -1;
  const cb = b.confidence ?? -1;
  if (ca !== cb) return ca - cb;
  return b.createdAt.localeCompare(a.createdAt);
}

export function orderQueue(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort(compareQueueItems);
}

/** How a label reads: Yes/No, the choice's key, or a score's level and meaning. */
export function optionLabel(item: ReviewItem, key: string | null): string {
  if (key == null) return "—";
  if (item.answerType === "noul") return key === "true" ? "Yes" : key === "false" ? "No" : key;
  if (item.answerType === "choice") return key;
  const found = item.options.find((o) => o.key === key);
  return found && found.label !== key ? `${key} · ${found.label}` : key;
}

export type QueueKeyAction =
  | { type: "next" }
  | { type: "previous" }
  | { type: "skip" }
  | { type: "label"; key: string }
  | null;

/**
 * The keyboard map. j/k move, s skips, 1–9 pick the n-th option; for a
 * yes-or-no question y/n work too.
 */
export function queueKeyAction(item: ReviewItem | null, key: string): QueueKeyAction {
  if (key === "j" || key === "ArrowDown") return { type: "next" };
  if (key === "k" || key === "ArrowUp") return { type: "previous" };
  if (key === "s") return { type: "skip" };
  if (!item) return null;
  if (item.answerType === "noul") {
    if (key === "y") return { type: "label", key: "true" };
    if (key === "n") return { type: "label", key: "false" };
  }
  if (/^[1-9]$/.test(key)) {
    const option = item.options[Number(key) - 1];
    return option ? { type: "label", key: option.key } : null;
  }
  return null;
}

/** True when any message of an agent definition carries a decision_questions part. */
export function agentAsksDecisions(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => {
    const content = (message as { content?: unknown } | null)?.content;
    return (
      Array.isArray(content) &&
      content.some((part) => {
        const p = part as { type?: unknown; __kind?: unknown } | null;
        return p?.type === "decision_questions" || p?.__kind === "decision_questions";
      })
    );
  });
}
