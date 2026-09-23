import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import type { MessageRole } from "@/features/agents/types/agent-message-types";
import type { AssistantTurnGroupMember } from "./assistant/AssistantTurnGroup";
import {
  extractFlatText,
  isFailedRecord,
  selectConversationMessages,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";

export interface DisplayEntry {
  key: string;
  role: MessageRole;
  messageId: string | null;
  requestId: string | null;
  isStreamActive: boolean;
  isFailed: boolean;
  canRetry: boolean;
  streamSlotStart?: number;
  streamSlotEnd?: number;
  /** True for a delivered agent-collaboration note (see isCollabNoteRecord). */
  isCollabNote?: boolean;
  /** A few-shot turn the author flagged `example` — collapsed with its run. */
  isExample?: boolean;
}

function recordFlags(rec: MessageRecord): Record<string, unknown> {
  const meta = rec.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const flags = (meta as Record<string, unknown>).flags;
  return flags && typeof flags === "object" && !Array.isArray(flags)
    ? (flags as Record<string, unknown>)
    : {};
}

/**
 * A delivered collaboration note: a user-role cx_message row written by the
 * turn-boundary inbox drain from an `agent_call` `remember=true` write-back
 * (source='agent_collab'). Detected by the server's canonical text prefix
 * (agent_call.py stamps `[Collaboration note] Agent '<name>' …`) or by the
 * drained injection's provenance under metadata.agent_collab. These must
 * NEVER render as a plain user bubble — the user didn't type them.
 * (Hidden notes never reach this code: every message read path filters
 * `is_visible_to_user = true`.)
 */
export function isCollabNoteRecord(rec: MessageRecord): boolean {
  if (rec.role !== "user") return false;
  const meta = rec.metadata;
  if (
    meta &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    "agent_collab" in meta
  ) {
    return true;
  }
  return extractFlatText(rec).startsWith("[Collaboration note]");
}

export type DisplayGroup =
  | { kind: "user"; key: string; messageId: string }
  | {
      kind: "examples";
      key: string;
      members: Array<{ role: "user" | "assistant"; messageId: string }>;
    }
  | { kind: "collab-note"; key: string; messageId: string }
  | {
      kind: "assistant";
      key: string;
      members: AssistantTurnGroupMember[];
    }
  | {
      kind: "assistant-failed";
      key: string;
      messageId: string | null;
      requestId: string | null;
      isStreamActive: boolean;
      canRetry: boolean;
    };

interface BuildDisplayEntriesArgs {
  messages: MessageRecord[];
  isActive: boolean;
  latestRequestId: string | null | undefined;
  isErrorPhase: boolean;
}

function isEmptyReservedAssistant(record: {
  role: string;
  status: string;
  content: unknown;
}): boolean {
  if (record.role !== "assistant") return false;
  if (record.status !== "reserved") return false;
  return Array.isArray(record.content) && record.content.length === 0;
}

export function buildDisplayEntries({
  messages,
  isActive,
  latestRequestId,
  isErrorPhase,
}: BuildDisplayEntriesArgs): DisplayEntry[] {
  // Which record IS the live stream, if one exists yet.
  //
  // This used to inspect only the LAST assistant record and give up if that
  // one did not carry `latestRequestId` — which renders the same turn TWICE
  // whenever another assistant record sits after the streaming one. The
  // ordinary way that happens: the next turn's empty `reserved` record is
  // created while the current turn is still streaming. The scan stopped on
  // the reserved record, `streamingAssistantId` stayed null, so the real
  // streaming record rendered as a settled bubble AND the synthetic
  // `__streaming__` entry below rendered the same live text again.
  //
  // Scan back for the record that actually carries the request instead. The
  // list is already display-windowed, so this stays cheap.
  let streamingAssistantId: string | null = null;
  if (isActive && latestRequestId) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const rec = messages[i];
      if (rec.role !== "assistant") continue;
      if (
        rec._streamRequestId === latestRequestId &&
        rec._streamSlotEnd === undefined
      ) {
        streamingAssistantId = rec.id;
        break;
      }
    }
  }

  const entries: DisplayEntry[] = [];
  for (const rec of messages) {
    if (rec.role === "tool" || rec.role === "system") continue;
    // A consumed PREFILL: its text is the start of the reply that follows, so
    // it never renders as a turn of its own.
    if (recordFlags(rec).prefill === true && rec.id !== streamingAssistantId) continue;
    const isStreamingMessage = rec.id === streamingAssistantId;
    if (
      isEmptyReservedAssistant(rec) &&
      !isStreamingMessage &&
      rec._streamSlotEnd === undefined
    )
      continue;

    const recFailed =
      rec.role === "assistant" &&
      (isFailedRecord(rec) || (isStreamingMessage && isErrorPhase));

    entries.push({
      key: rec.id,
      role: rec.role,
      messageId: rec.id,
      requestId: rec._streamRequestId ?? null,
      isStreamActive: isStreamingMessage,
      isFailed: recFailed,
      canRetry: false,
      isCollabNote: rec.role === "user" ? isCollabNoteRecord(rec) : false,
      isExample: recordFlags(rec).example === true && !isStreamingMessage,
      streamSlotStart: rec._streamSlotStart,
      streamSlotEnd: rec._streamSlotEnd,
    });
  }

  const hasOpenRequestAnchor = Boolean(
    latestRequestId &&
    messages.some(
      (rec) =>
        rec.role === "assistant" &&
        rec._streamRequestId === latestRequestId &&
        rec._streamSlotEnd === undefined,
    ),
  );
  if (latestRequestId && !hasOpenRequestAnchor) {
    const closedSegmentEnds = messages
      .filter(
        (rec) =>
          rec.role === "assistant" &&
          rec._streamRequestId === latestRequestId &&
          typeof rec._streamSlotEnd === "number",
      )
      .map((rec) => rec._streamSlotEnd as number);
    // A settled request needs a synthetic tail only when a visible inbox
    // boundary closed its last real anchor. Ordinary hydrated history must
    // never gain a phantom assistant merely because request metadata remains.
    if (isActive || closedSegmentEnds.length > 0)
      entries.push({
        key: `__streaming__:${latestRequestId}`,
        role: "assistant",
        messageId: null,
        requestId: latestRequestId,
        isStreamActive: isActive,
        isFailed: isErrorPhase,
        canRetry: false,
        streamSlotStart:
          closedSegmentEnds.length > 0
            ? Math.max(...closedSegmentEnds)
            : undefined,
      });
  }

  const last = entries[entries.length - 1];
  if (last && last.role === "assistant" && last.isFailed) {
    last.canRetry = true;
  }

  return entries;
}

export function groupDisplayEntries(
  displayEntries: DisplayEntry[],
): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  let buffer: AssistantTurnGroupMember[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    groups.push({
      kind: "assistant",
      key: `grp:${buffer[0].key}`,
      members: buffer,
    });
    buffer = [];
  };

  let examples: Array<{ role: "user" | "assistant"; messageId: string }> = [];
  const flushExamples = () => {
    if (examples.length === 0) return;
    groups.push({ kind: "examples", key: `ex:${examples[0].messageId}`, members: examples });
    examples = [];
  };

  for (const entry of displayEntries) {
    if (
      entry.isExample &&
      entry.messageId &&
      (entry.role === "user" || entry.role === "assistant")
    ) {
      flush();
      examples.push({ role: entry.role, messageId: entry.messageId });
      continue;
    }
    flushExamples();
    if (entry.role === "assistant") {
      if (entry.isFailed) {
        if (entry.requestId) {
          buffer = buffer.filter((m) => m.requestId !== entry.requestId);
        }
        flush();
        groups.push({
          kind: "assistant-failed",
          key: entry.key,
          messageId: entry.messageId,
          requestId: entry.requestId,
          isStreamActive: entry.isStreamActive,
          canRetry: entry.canRetry,
        });
        continue;
      }
      buffer.push({
        key: entry.key,
        messageId: entry.messageId,
        requestId: entry.requestId,
        isStreamActive: entry.isStreamActive,
        streamSlotStart: entry.streamSlotStart,
        streamSlotEnd: entry.streamSlotEnd,
      });
      continue;
    }

    flush();
    if (entry.role === "user" && entry.messageId) {
      groups.push({
        kind: entry.isCollabNote ? "collab-note" : "user",
        key: entry.key,
        messageId: entry.messageId,
      });
    }
  }
  flushExamples();
  flush();
  return groups;
}

export function applyDisplayGroupWindow(
  groups: DisplayGroup[],
  visibleGroupLimit: number | null,
): DisplayGroup[] {
  if (visibleGroupLimit === null) return groups;
  if (groups.length <= visibleGroupLimit) return groups;
  return groups.slice(groups.length - visibleGroupLimit);
}

// ---------------------------------------------------------------------------
// Loaded display-group count — the unit the visible-group window and the
// "reveal more" step actually operate in. `visibleGroupLimit` is a count of
// GROUPS, but the older-history sentinel used to compare it against the raw
// MESSAGE count; grouping collapses each assistant turn (its many
// assistant/tool rows) into ONE group, so `groups < messages` almost always
// holds. That mismatch trapped the sentinel: with all loaded groups already
// visible it still saw `limit < messageCount` and kept firing no-op reveals
// instead of paging the next batch from the DB. This selector is the correct
// denominator.
//
// Counted with static (non-streaming) flags: grouping of the OLDER end — all
// the sentinel cares about — never depends on stream state; only the newest
// group can shift, and that one is always inside the window regardless.
// ---------------------------------------------------------------------------
const loadedGroupCountSelectorCache = new Map<
  string,
  (state: RootState) => number
>();

export const selectLoadedDisplayGroupCount = (conversationId: string) => {
  const cached = loadedGroupCountSelectorCache.get(conversationId);
  if (cached) return cached;

  const selector = createSelector(
    selectConversationMessages(conversationId),
    (messages: MessageRecord[]): number =>
      groupDisplayEntries(
        buildDisplayEntries({
          messages,
          isActive: false,
          latestRequestId: null,
          isErrorPhase: false,
        }),
      ).length,
  );
  loadedGroupCountSelectorCache.set(conversationId, selector);
  return selector;
};
