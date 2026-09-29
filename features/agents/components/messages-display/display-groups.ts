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
    // "output" is a runtime row (an OpenAI reasoning item persisted on its own) that belongs to the assistant turn
    // it sits in. Like a tool row it renders nothing here and must NEVER be a turn boundary: treated as one, it
    // split the PR Director's turn in two and the first half — ending on a tool call — was declared "finished
    // without writing an answer" directly above the real answer (conversation 88d030cd…, 2026-09-29).
    if (rec.role === "tool" || rec.role === "system" || (rec.role as string) === "output") continue;
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
      // A live turn keeps ONE group identity while its rows are announced
      // (the synthetic stream entry becomes a row, later rows arrive) — a key
      // built from whichever row came first remounted the whole turn.
      key: buffer[0].requestId
        ? `grp:req:${buffer[0].requestId}:${buffer[0].streamSlotStart ?? 0}`
        : `grp:${buffer[0].key}`,
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

/** Where a rendered window starts, pinned to a group identity. */
export interface DisplayGroupWindowAnchor {
  /** Key of the first rendered group. */
  key: string;
  /** The limit the anchor was taken under; a new limit re-derives the window. */
  limit: number;
}

/**
 * The visible-group window, ANCHORED: once a window is on screen its first
 * group stays its first group while the limit is unchanged. A turn in flight
 * adds groups at the bottom (the optimistic user row, then the answer) and can
 * briefly remove one (a synthetic stream entry becoming a row); counting the
 * last N groups made the group at the top edge unmount and remount with every
 * such step — invisible above the viewport, but a remount of every card in it
 * and a layout jump under a scrolled reader (verifier 2026-09-27, /chat 375).
 * Anchored, the rendered set only grows while a turn streams. A larger limit
 * (reveal older) opens the window upward by the difference; a smaller one (a
 * cold reset) or a missing anchor (its group was deleted) re-derives the
 * window from the end.
 */
export function applyAnchoredDisplayGroupWindow(
  groups: DisplayGroup[],
  visibleGroupLimit: number | null,
  anchor: DisplayGroupWindowAnchor | null,
): { groups: DisplayGroup[]; anchor: DisplayGroupWindowAnchor | null } {
  if (visibleGroupLimit === null) return { groups, anchor: null };
  const anchorIndex = anchor
    ? groups.findIndex((g) => g.key === anchor.key)
    : -1;
  if (anchor && anchorIndex >= 0) {
    if (anchor.limit === visibleGroupLimit) {
      return { groups: groups.slice(anchorIndex), anchor };
    }
    if (visibleGroupLimit > anchor.limit) {
      // Revealing older history opens the window UPWARD by the difference;
      // it never trades bottom groups (which may have grown in-session).
      const start = Math.max(
        0,
        Math.min(
          anchorIndex - (visibleGroupLimit - anchor.limit),
          groups.length - visibleGroupLimit,
        ),
      );
      const windowed = groups.slice(start);
      return {
        groups: windowed,
        anchor: { key: windowed[0].key, limit: visibleGroupLimit },
      };
    }
  }
  const windowed = applyDisplayGroupWindow(groups, visibleGroupLimit);
  return {
    groups: windowed,
    anchor: windowed[0]
      ? { key: windowed[0].key, limit: visibleGroupLimit }
      : null,
  };
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
