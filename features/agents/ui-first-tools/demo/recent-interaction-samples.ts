import type { PendingAsk } from "../redux/pending-asks.slice";
import {
  isBatchedUserArgs,
  normalizeAskOptions,
  recoverUserArgs,
  requestTakeoverArgsSchema,
  updatePlanArgsSchema,
  userArgsSchema,
  type UserSingleQuestion,
} from "../tools/schemas";

const RECENT_CONVERSATION_ID = "demo-agent-cards-recent";

export interface PersistedInteractionRow {
  id: string;
  call_id: string | null;
  tool_name: string;
  arguments: unknown;
  created_at: string;
  status: string | null;
  is_error: boolean | null;
}

function isObjectArgs(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectArgs(value: unknown): Record<string, unknown> | null {
  return isObjectArgs(value) ? value : null;
}

function baseAsk(
  row: PersistedInteractionRow,
  callId: string,
): Pick<
  PendingAsk,
  "callId" | "conversationId" | "toolName" | "status" | "createdAtMs"
> {
  return {
    callId,
    conversationId: RECENT_CONVERSATION_ID,
    toolName: row.tool_name,
    status: "pending",
    createdAtMs: Date.parse(row.created_at),
  };
}

function persistedCallId(row: PersistedInteractionRow): string {
  return `recent:${row.id}`;
}

function pendingAskFromQuestion(
  row: PersistedInteractionRow,
  question: UserSingleQuestion,
  options?: { index: number; total: number },
): PendingAsk {
  const parentCallId = persistedCallId(row);
  const callId = options ? `${parentCallId}.${options.index}` : parentCallId;
  return {
    ...baseAsk(row, callId),
    kind: question.type,
    question: question.question,
    header: question.header,
    context: question.context,
    options: normalizeAskOptions(question.options),
    allowOther:
      question.type === "choice" || question.type === "choice_many"
        ? true
        : question.allow_other,
    message: question.message,
    actions: question.actions,
    level: question.level ?? "info",
    batchId: options ? parentCallId : undefined,
    batchIndex: options?.index,
    batchTotal: options?.total,
  };
}

function userSamples(row: PersistedInteractionRow): PendingAsk[] {
  const raw = objectArgs(row.arguments);
  if (!raw) return [];
  const parsed = userArgsSchema.safeParse(recoverUserArgs(raw).args);
  if (!parsed.success) return [];

  if (isBatchedUserArgs(parsed.data)) {
    // Secret questions never leave the server-backed sample conversion. A
    // partially safe batch remains useful, but its displayed numbering is
    // rebuilt so the demo wizard stays internally consistent.
    const visible = parsed.data.questions.filter((q) => q.type !== "secret");
    if (visible.length === 0) return [];
    return visible.map((question, index) =>
      pendingAskFromQuestion(
        row,
        question,
        visible.length > 1 ? { index, total: visible.length } : undefined,
      ),
    );
  }

  const question = parsed.data as UserSingleQuestion;
  return question.type === "secret"
    ? []
    : [pendingAskFromQuestion(row, question)];
}

function planSample(row: PersistedInteractionRow): PendingAsk[] {
  const raw = objectArgs(row.arguments);
  if (!raw) return [];
  const parsed = updatePlanArgsSchema.safeParse(raw);
  if (!parsed.success) return [];
  const steps = parsed.data.steps ?? parsed.data.approach ?? [];
  return [
    {
      ...baseAsk(row, persistedCallId(row)),
      kind: "plan_approval",
      question: "Approve this plan?",
      options: [{ label: "Approve" }, { label: "Reject" }],
      plan: {
        title: parsed.data.title ?? "Plan",
        steps,
        reasoning: parsed.data.reasoning,
        estimated_minutes: parsed.data.estimated_minutes,
      },
    },
  ];
}

function takeoverSample(row: PersistedInteractionRow): PendingAsk[] {
  const raw = objectArgs(row.arguments);
  if (!raw) return [];
  const parsed = requestTakeoverArgsSchema.safeParse(raw);
  if (!parsed.success) return [];
  const question = parsed.data.expected_action
    ? `${parsed.data.reason}\n\nExpected: ${parsed.data.expected_action}`
    : parsed.data.reason;
  return [
    {
      ...baseAsk(row, persistedCallId(row)),
      kind: "takeover",
      question,
      context: parsed.data.instructions,
    },
  ];
}

function humanizeTarget(target: string): string {
  const words = target.replaceAll("_", " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Proposed change";
}

function formatProposedValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "(no value)";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function surfaceWriteSample(row: PersistedInteractionRow): PendingAsk[] {
  const args = objectArgs(row.arguments);
  const target = typeof args?.target === "string" ? args.target.trim() : "";
  if (!target) return [];
  return [
    {
      ...baseAsk(row, persistedCallId(row)),
      kind: "approval",
      approval: {
        verb: target.startsWith("append_") ? "append" : "update",
        entity: "proposed change",
        title: humanizeTarget(target),
        fields: [
          {
            label: "Proposed value",
            after: formatProposedValue(args?.value),
            block: true,
          },
        ],
      },
    },
  ];
}

/**
 * Convert persisted tool calls into inert gallery cards. The result contains no
 * output, owner, conversation identity, email body, or secret prompt, and its
 * synthetic call ids can only resolve the gallery's local resolver registry.
 */
export function buildRecentInteractionSamples(
  rows: PersistedInteractionRow[],
): PendingAsk[] {
  return rows
    .filter((row) => !row.is_error)
    .flatMap((row) => {
      switch (row.tool_name) {
        case "user":
          return userSamples(row);
        case "update_plan":
          return planSample(row);
        case "request_user_takeover":
          return takeoverSample(row);
        case "apply_surface_write":
          return surfaceWriteSample(row);
        default:
          return [];
      }
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}
