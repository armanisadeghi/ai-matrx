import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import type { MessageRole } from "@/features/agents/types/agent-message-types";
import type { AssistantTurnGroupMember } from "./assistant/AssistantTurnGroup";
import {
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
}

export type DisplayGroup =
  | { kind: "user"; key: string; messageId: string }
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
  let streamingAssistantId: string | null = null;
  if (isActive && latestRequestId) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const rec = messages[i];
      if (rec.role !== "assistant") continue;
      if (rec._streamRequestId === latestRequestId) {
        streamingAssistantId = rec.id;
      }
      break;
    }
  }

  const entries: DisplayEntry[] = [];
  for (const rec of messages) {
    if (rec.role === "tool" || rec.role === "system") continue;
    const isStreamingMessage = rec.id === streamingAssistantId;
    if (isEmptyReservedAssistant(rec) && !isStreamingMessage) continue;

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
    });
  }

  if (isActive && latestRequestId && streamingAssistantId === null) {
    entries.push({
      key: `__streaming__:${latestRequestId}`,
      role: "assistant",
      messageId: null,
      requestId: latestRequestId,
      isStreamActive: true,
      isFailed: isErrorPhase,
      canRetry: false,
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

  for (const entry of displayEntries) {
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
      });
      continue;
    }

    flush();
    if (entry.role === "user" && entry.messageId) {
      groups.push({
        kind: "user",
        key: entry.key,
        messageId: entry.messageId,
      });
    }
  }
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
