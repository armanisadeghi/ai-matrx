/**
 * The work a sub-agent did under ONE `agent_call` — its thinking and its own
 * tool calls, in order — from either source:
 *
 *   - live: the parent request's wire, attributed through the `sub_agent`
 *     operation that `agent_call` owns (`toolCallId`, D209) and its timeline /
 *     reasoning ranges (`utils/child-owned-ranges.ts` gives the SAME items to
 *     this card instead of the parent's top level);
 *   - persisted: the child conversation's own rows (the server stores every
 *     child tool call with `parent_call_id` = this call's row and names the
 *     conversation as `child_conversation_id` on the result, aidream 764aafbf9d).
 *
 * Arman, 2026-10-01: nested sub-agent work is SHOWN after a reload, the same as
 * live. Both sources reduce to one item list so the one renderer
 * (`AgentCallChildTrace`) draws them identically; `agentCallTraceShape` is the
 * parity yardstick (guard: `__tests__/a-nested-agent-call-shows-its-work-live-and-after-reload.test.ts`).
 *
 * One level per card: a grandchild's work sits inside the child's nested
 * `sub_agent` range and is drawn under the CHILD's agent_call card, which is
 * itself one of these items — so depth renders by recursion, never by
 * flattening.
 */

import type {
  CompletedOperationEntry,
  OperationEntry,
  TimelineEntry,
  ToolLifecycleEntry,
} from "../../../types/request.types";
import type {
  ContentSegment,
  ContentSegmentDbTool,
} from "../active-requests/active-requests.selectors";

export type LiveTraceItem =
  | { kind: "thinking"; chunkStartIndex: number; chunkEndIndex?: number }
  | { kind: "tool"; callId: string; toolName: string };

export type PersistedTraceItem =
  | { kind: "thinking"; content: string }
  | { kind: "tool"; segment: ContentSegmentDbTool };

export interface LiveAgentCallTrace {
  items: LiveTraceItem[];
  /** From the `sub_agent` INIT metadata — the conversation the child runs in. */
  childConversationId: string | null;
  running: boolean;
}

export interface LiveTraceInput {
  callId: string;
  timeline: readonly TimelineEntry[] | undefined;
  activeOperations: Record<string, OperationEntry> | undefined;
  completedOperations: Record<string, CompletedOperationEntry> | undefined;
  toolLifecycle: Record<string, ToolLifecycleEntry> | undefined;
}

type AnyOp = OperationEntry & Partial<CompletedOperationEntry>;

export function liveAgentCallTrace(
  input: LiveTraceInput,
): LiveAgentCallTrace | null {
  const timeline = input.timeline ?? [];
  const ops = [
    ...Object.values(input.activeOperations ?? {}),
    ...Object.values(input.completedOperations ?? {}),
  ] as AnyOp[];
  const own = ops.find(
    (op) =>
      op.operation === "sub_agent" &&
      op.toolCallId === input.callId &&
      typeof op.timelineAnchor === "number",
  );
  if (!own || typeof own.timelineAnchor !== "number") return null;

  const start = own.timelineAnchor;
  const end = Math.min(own.timelineEnd ?? timeline.length, timeline.length);
  // Ranges of DEEPER sub-agents (opened inside this one) — their work belongs
  // to the deeper agent_call's card, which is itself an item here.
  const nested: Array<[number, number]> = [];
  for (const op of ops) {
    if (op === own || op.operation !== "sub_agent" || !op.toolCallId) continue;
    if (typeof op.timelineAnchor !== "number") continue;
    if (op.timelineAnchor <= start || op.timelineAnchor >= end) continue;
    nested.push([op.timelineAnchor, op.timelineEnd ?? Infinity]);
  }
  const inNested = (i: number) => nested.some(([s, e]) => i >= s && i < e);

  const items: LiveTraceItem[] = [];
  const seenCalls = new Set<string>();
  const openThinking = new Map<number, number>();
  for (let i = start; i < end; i++) {
    const entry = timeline[i];
    if (inNested(i)) continue;
    if (entry.kind === "reasoning_start") {
      openThinking.set(entry.chunkStartIndex, items.length);
      items.push({ kind: "thinking", chunkStartIndex: entry.chunkStartIndex });
    } else if (entry.kind === "reasoning_end") {
      const at = openThinking.get(entry.chunkStartIndex);
      if (at === undefined) continue;
      openThinking.delete(entry.chunkStartIndex);
      const item = items[at];
      if (item.kind === "thinking") item.chunkEndIndex = entry.chunkEndIndex;
    } else if (entry.kind === "tool_event") {
      const callId = entry.data.call_id;
      if (!callId || callId === input.callId || seenCalls.has(callId)) continue;
      seenCalls.add(callId);
      items.push({
        kind: "tool",
        callId,
        toolName:
          input.toolLifecycle?.[callId]?.toolName ?? entry.data.tool_name ?? "",
      });
    }
  }

  const meta = (own.metadata ?? {}) as { conversation_id?: unknown };
  return {
    // A closed run that produced no tokens is never persisted — drop it so the
    // live list and the reloaded one stay the same list.
    items: items.filter(
      (item) =>
        item.kind !== "thinking" ||
        item.chunkEndIndex === undefined ||
        item.chunkEndIndex > item.chunkStartIndex,
    ),
    childConversationId:
      typeof meta.conversation_id === "string" ? meta.conversation_id : null,
    running: !("completedAt" in own && typeof own.completedAt === "number"),
  };
}

/**
 * The child conversation's assistant rows, already projected by the ONE
 * persisted walker (`selectMessagesInterleavedRuns`). Its text is the answer
 * the card already shows — only thinking and tool calls are the "work".
 */
export function persistedAgentCallTrace(
  runs: readonly (readonly ContentSegment[])[],
): PersistedTraceItem[] {
  const items: PersistedTraceItem[] = [];
  for (const run of runs) {
    for (const segment of run) {
      if (segment.type === "thinking" && segment.content.trim()) {
        items.push({ kind: "thinking", content: segment.content });
      } else if (segment.type === "db_tool") {
        items.push({ kind: "tool", segment });
      }
    }
  }
  return items;
}

/** The structure both sources must agree on: `thinking` / `tool:<name>`. */
export function agentCallTraceShape(
  items: ReadonlyArray<LiveTraceItem | PersistedTraceItem>,
): string[] {
  return items.map((item) => {
    if (item.kind === "thinking") return "thinking";
    if ("segment" in item) {
      return `tool:${item.segment.record?.toolName ?? item.segment.stubName ?? ""}`;
    }
    return `tool:${item.toolName}`;
  });
}

/** `child_conversation_id` the server names on every agent_call answer. */
export function childConversationIdFromResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const value = (result as { child_conversation_id?: unknown })
    .child_conversation_id;
  return typeof value === "string" && value ? value : null;
}
