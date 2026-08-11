/**
 * Collaboration agent_call detection + parsing (pure — unit-testable).
 *
 * Server contract: aidream `matrx_ai/tools/implementations/agent_call.py`.
 * A collaboration call is an `agent_call` whose `history_mode` argument is
 * "snapshot" or "fork" — the child agent runs WITH a conversation's persisted
 * history. Its tool output gains optional keys:
 *   history: { mode, source_conversation_id, messages_included }
 *   child_conversation_id: the conversation the specialist ran in
 *                          (in fork mode this IS the durable fork)
 *   remember: { status: "queued" | "failed", injection_id?, error? }
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

export type CollabHistoryMode = "snapshot" | "fork";

export interface CollabRemember {
  status: "queued" | "failed";
  injectionId: string | null;
  error: string | null;
}

export interface CollabCallInfo {
  historyMode: CollabHistoryMode;
  /**
   * The conversation whose history the child received. Null while only the
   * arguments are known AND the caller defaulted to its own conversation
   * (`history_conversation_id` omitted) — treat null as "this conversation".
   */
  sourceConversationId: string | null;
  /** The conversation the specialist ran in (output only; null while running). */
  childConversationId: string | null;
  messagesIncluded: number | null;
  /** The child agent's name (output only; null while running). */
  agentName: string | null;
  remember: CollabRemember | null;
  /** The specialist's final answer text, when returned inline. */
  resultText: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isCollabHistoryMode(value: unknown): value is CollabHistoryMode {
  return value === "snapshot" || value === "fork";
}

/** True when this agent_call carries conversation history (the collab card renders). */
export function isCollaborationAgentCall(entry: ToolLifecycleEntry): boolean {
  return getCollabCallInfo(entry) !== null;
}

export function getCollabCallInfo(
  entry: ToolLifecycleEntry,
): CollabCallInfo | null {
  if (entry.toolName !== "agent_call") return null;

  const args = entry.arguments ?? {};
  const output = asRecord(entry.result);
  const history = asRecord(output?.history);

  const historyMode = history?.mode ?? args.history_mode;
  if (!isCollabHistoryMode(historyMode)) return null;

  const remember = ((): CollabRemember | null => {
    const raw = asRecord(output?.remember);
    if (!raw) return null;
    const status = raw.status;
    if (status !== "queued" && status !== "failed") return null;
    return {
      status,
      injectionId: asString(raw.injection_id),
      error: asString(raw.error),
    };
  })();

  const resultText = ((): string | null => {
    const direct = output?.result;
    if (typeof direct === "string") return direct;
    const directObj = asRecord(direct);
    const nested = directObj?.result ?? directObj?.text ?? directObj?.answer;
    if (typeof nested === "string") return nested;
    // reference-mode: the stored descriptor carries a preview
    const stored = asRecord(output?.stored);
    return asString(stored?.preview);
  })();

  return {
    historyMode,
    sourceConversationId:
      asString(history?.source_conversation_id) ??
      asString(args.history_conversation_id),
    childConversationId: asString(output?.child_conversation_id),
    messagesIncluded:
      typeof history?.messages_included === "number"
        ? history.messages_included
        : null,
    agentName: asString(output?.agent_name),
    remember,
    resultText,
  };
}
