"use client";

/**
 * AgentConversationDisplay
 *
 * Renders the conversation transcript. Reads ONLY from `messages.byId +
 * orderedIds` (MessageRecord shape).
 *
 * Streaming bubble: the LATEST assistant cx_message reservation IS the
 * streaming bubble — there is no virtual `__streaming__` entry. While the
 * stream is active, that record carries `isStreamActive=true` and the
 * `latestRequestId`; AgentAssistantMessage falls through to the
 * requestId-driven MarkdownStream path to render in-flight chunks.
 *
 * Once the stream completes, Phase 3 routing in process-stream commits the
 * final `CxContentBlock[]` content into the same byId record(s) and the
 * canonical `selectMessageInterleavedContent` selector takes over, joining
 * tool_call stubs with their full payloads from `observability.toolCalls`.
 */

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectConversationMessages,
  isFailedRecord,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  selectStreamPhase,
  selectLatestRequestId,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { AgentUserMessage } from "./user/AgentUserMessage";
import { MarkdownContextMenuProvider } from "@/features/context-menu-v2/markdown/MarkdownContextMenuProvider";
import type { AssistantTurnGroupMember } from "./assistant/AssistantTurnGroup";
import {
  isWarRoomTileAgentSurface,
  traceWarRoomRenderPath,
} from "@/features/war-room/utils/renderPathTrace";
const AssistantTurnGroup = dynamic(
  () =>
    import("./assistant/AssistantTurnGroup").then((m) => ({
      default: m.AssistantTurnGroup,
    })),
  { ssr: false },
);

// Dynamic (ssr:false) — same as AssistantTurnGroup. AgentAssistantMessage
// pulls in useDomCapturePrint → jspdf → fflate, whose Node Worker import
// cannot be resolved during SSR. A static import here 500s the route.
const AgentAssistantMessage = dynamic(
  () =>
    import("./assistant/AgentAssistantMessage").then((m) => ({
      default: m.AgentAssistantMessage,
    })),
  { ssr: false },
);

const AgentEmptyMessageDisplay = dynamic(
  () =>
    import("./assistant/AgentEmptyMessageDisplay").then((m) => ({
      default: m.AgentEmptyMessageDisplay,
    })),
  { ssr: false },
);

const ASSISTANT_MSG_DEBUG = "[ASSISTANT MESSAGE DEBUG]";

interface DisplayEntry {
  key: string;
  role: "user" | "assistant" | "system";
  /** Server-assigned `cx_message.id` for committed rows; null for the live entry. */
  messageId: string | null;
  /** Live stream request id — set only on the `__streaming__` entry. */
  requestId: string | null;
  isStreamActive: boolean;
  /** This assistant turn failed (persisted `status='failed'` or live error). */
  isFailed: boolean;
  /** Offer Retry — true only on the conversation's last, failed, recoverable turn. */
  canRetry: boolean;
}

/**
 * Output shape of the grouping pass: either a single user message, or a
 * contiguous run of assistant messages (one logical agentic "turn"). Each
 * group renders through AssistantTurnGroup, which collapses N sub-messages
 * into one visual unit with one trailing action bar.
 */
type DisplayGroup =
  | { kind: "user"; key: string; messageId: string }
  | {
      kind: "assistant";
      key: string;
      members: AssistantTurnGroupMember[];
    }
  // A failed turn renders on its own — never folded into a sibling answer's
  // turn group, so the answer's action bar (copy / speak / print) never
  // aggregates the error text or the retry that replaced it.
  | {
      kind: "assistant-failed";
      key: string;
      messageId: string | null;
      requestId: string | null;
      isStreamActive: boolean;
      canRetry: boolean;
    };

interface AgentConversationDisplayProps {
  conversationId: string;
  /**
   * The UI surface this transcript belongs to. Threaded into per-message
   * action bars so fork / delete / retry outcomes route correctly via the
   * surfaces registry. Optional — components fall back to local behavior
   * when omitted (e.g. embedded previews).
   */
  surfaceKey?: string;
  compact?: boolean;
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

export function AgentConversationDisplay({
  conversationId,
  surfaceKey,
  compact = false,
}: AgentConversationDisplayProps) {
  const messages = useAppSelector(selectConversationMessages(conversationId));
  const phase = useAppSelector(selectStreamPhase(conversationId));
  const latestRequestId = useAppSelector(selectLatestRequestId(conversationId));
  const bottomRef = useRef<HTMLDivElement>(null);

  const isActive =
    phase === "connecting" ||
    phase === "pre_token" ||
    phase === "text_streaming" ||
    phase === "interstitial" ||
    phase === "error";

  const displayEntries = useMemo((): DisplayEntry[] => {
    // The streaming bubble is the assistant cx_message anchored to the
    // CURRENT live request (its `_streamRequestId` matches `latestRequestId`)
    // — NOT just "the most recent assistant." The distinction matters during
    // the window after a NEW submit creates a fresh active request but
    // BEFORE the server has reserved its assistant cx_message: in that gap,
    // the most-recent assistant in `orderedIds` is the PRIOR turn's, which
    // is fully committed against its own (stable) `_streamRequestId`. If we
    // mislabel it as the streaming bubble, we'd override its requestId with
    // the new latestRequestId and the renderer would read from an empty
    // stream — the prior message blanks out until the new reservation lands.
    //
    // Strict match keeps every committed message anchored to its own
    // streaming source forever; the streaming bubble naturally appears
    // once the server actually reserves the new assistant record (which
    // gets `_streamRequestId === latestRequestId` from process-stream).
    let streamingAssistantId: string | null = null;
    if (isActive && latestRequestId) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const rec = messages[i];
        if (rec.role !== "assistant") continue;
        if (rec._streamRequestId === latestRequestId) {
          streamingAssistantId = rec.id;
        }
        // Stop at the most recent assistant either way — we only ever care
        // about whether the NEWEST assistant is the active stream's record.
        break;
      }
    }

    const isErrorPhase = phase === "error";

    const entries: DisplayEntry[] = [];
    for (const rec of messages) {
      const isStreamingMessage = rec.id === streamingAssistantId;
      // Skip empty reserved assistants UNLESS they're the active streaming
      // bubble (in which case the requestId-driven MarkdownStream path
      // renders the in-flight chunks even though byId.content is still empty).
      if (isEmptyReservedAssistant(rec) && !isStreamingMessage) continue;
      // A turn is failed when its persisted record says so (`status='failed'`
      // / `metadata.failed`), OR when it is the live streaming bubble and the
      // request just errored (record_update may not have stamped the status
      // yet). Failed turns render standalone so they never fold into a
      // successful answer's copy / speak / print aggregation.
      const recFailed =
        rec.role === "assistant" &&
        (isFailedRecord(rec) || (isStreamingMessage && isErrorPhase));
      // Always use the record's own `_streamRequestId` — never override
      // with `latestRequestId`. This is what guarantees prior turns stay
      // pinned to their own (already-completed) streaming source, even
      // while a NEW request is in flight on the same conversation.
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

    // The virtual streaming entry. When a request is active but the server has
    // not yet reserved its assistant cx_message (the pre-token gap on every
    // turn) — or never will, because the fetch failed before any event landed
    // (immediate error: chunkCount 0, firstChunkAt null) — there is no real
    // assistant record to render. Synthesize one anchored to the live request
    // so the pre-token indicator AND the error state have a bubble to live in.
    // Once the server reserves the real record, `streamingAssistantId` becomes
    // non-null and this block is skipped — a seamless swap to the real entry.
    if (isActive && latestRequestId && streamingAssistantId === null) {
      entries.push({
        key: `__streaming__:${latestRequestId}`,
        role: "assistant",
        messageId: null,
        requestId: latestRequestId,
        isStreamActive: true,
        // When the request errored before the server reserved an assistant
        // cx_message (immediate "Failed to fetch"), this synthetic entry IS
        // the failed bubble — there is no persisted record to carry it.
        isFailed: isErrorPhase,
        canRetry: false,
      });
    }

    // Offer Retry only on the conversation's LAST turn, and only when it
    // failed. Historical failed attempts (already followed by a retry) keep
    // their error bubble but no button. Once a retry is in flight the last
    // entry is the new streaming bubble (not failed), so the button is gone.
    const last = entries[entries.length - 1];
    if (last && last.role === "assistant" && last.isFailed) {
      last.canRetry = true;
    }

    return entries;
  }, [messages, isActive, latestRequestId, phase]);

  // Group contiguous assistant entries into one logical turn each.
  // Multi-iteration agentic flows produce many adjacent assistant
  // cx_message rows (one per server-side iteration). Visually those are
  // a SINGLE turn — one prompt, one answer that happens to include tool
  // calls and intermediate thinking. The grouping pass collapses them
  // into AssistantTurnGroup, which renders them flush with one trailing
  // action bar. Single-iteration turns become a one-member group and
  // render identically to the pre-grouping behavior.
  const displayGroups = useMemo((): DisplayGroup[] => {
    const groups: DisplayGroup[] = [];
    let buffer: AssistantTurnGroupMember[] = [];
    const flush = () => {
      if (buffer.length === 0) return;
      groups.push({
        kind: "assistant",
        // Stable key across re-renders: anchored on the first member's
        // key — that id is stable for the life of the group (new
        // iterations are APPENDED; the group never reshuffles its head).
        key: `grp:${buffer[0].key}`,
        members: buffer,
      });
      buffer = [];
    };
    for (const entry of displayEntries) {
      if (entry.role === "assistant") {
        if (entry.isFailed) {
          // Failed turn → its own group. Close any open run first so the
          // failed bubble sits between (not inside) the surrounding turns.
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
      // `system` entries are intentionally skipped — the previous
      // single-message render loop also returned null for them.
    }
    flush();
    return groups;
  }, [displayEntries]);

  // Auto-scroll to bottom — fires ONLY when a new message lands at the
  // bottom of the transcript (the LAST entry's key changed AND the entry
  // count grew). The bottom-key check is what distinguishes a normal
  // append (new user/assistant turn → scroll) from an older-history
  // prepend (`loadOlderMessages` adds messages at the TOP → the last
  // key is unchanged → do not scroll). Without this guard, pagination
  // would yank the user back to the bottom on every page.
  //
  // We track the LAST raw entry key (not the group key) because new
  // iterations within an existing assistant group must also trigger an
  // autoscroll — appending an iteration extends the group but the group's
  // key (anchored to its first member) is unchanged. Watching the entry-
  // level last-key preserves the original scroll-on-append behavior.
  const prevLengthRef = useRef(displayEntries.length);
  const prevLastKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const count = displayEntries.length;
    const lastKey = displayEntries[count - 1]?.key;
    if (
      count > prevLengthRef.current &&
      lastKey &&
      lastKey !== prevLastKeyRef.current
    ) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = count;
    prevLastKeyRef.current = lastKey;
  }, [displayEntries]);

  const assistantGroupCount = displayGroups.filter(
    (g) => g.kind === "assistant" || g.kind === "assistant-failed",
  ).length;

  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    console.log(`${ASSISTANT_MSG_DEBUG} streamPhase`, {
      conversationId,
      from: prevPhaseRef.current,
      to: phase,
      isActive,
      latestRequestId,
    });
    prevPhaseRef.current = phase;
  }, [conversationId, phase, isActive, latestRequestId]);

  const prevLatestRequestIdRef = useRef(latestRequestId);
  useEffect(() => {
    if (prevLatestRequestIdRef.current === latestRequestId) return;
    console.log(`${ASSISTANT_MSG_DEBUG} latestRequestId`, {
      conversationId,
      from: prevLatestRequestIdRef.current,
      to: latestRequestId,
      phase,
      isActive,
    });
    prevLatestRequestIdRef.current = latestRequestId;
  }, [conversationId, latestRequestId, phase, isActive]);

  const prevIsActiveRef = useRef(isActive);
  useEffect(() => {
    if (prevIsActiveRef.current === isActive) return;
    console.log(`${ASSISTANT_MSG_DEBUG} isActive`, {
      conversationId,
      from: prevIsActiveRef.current,
      to: isActive,
      phase,
      latestRequestId,
    });
    prevIsActiveRef.current = isActive;
  }, [conversationId, isActive, phase, latestRequestId]);

  const prevRawMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (prevRawMessageCountRef.current === messages.length) return;
    console.log(`${ASSISTANT_MSG_DEBUG} rawMessageCount`, {
      conversationId,
      from: prevRawMessageCountRef.current,
      to: messages.length,
      phase,
      latestRequestId,
    });
    prevRawMessageCountRef.current = messages.length;
  }, [conversationId, messages.length, phase, latestRequestId]);

  const prevDisplayEntriesKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const entriesKey = displayEntries
      .map(
        (e) =>
          `${e.key}:${e.role}:${e.messageId ?? "null"}:${e.requestId ?? "null"}:${e.isStreamActive}:${e.isFailed}:${e.canRetry}`,
      )
      .join("|");
    if (prevDisplayEntriesKeyRef.current === entriesKey) return;

    const streamingEntry = displayEntries.find((e) => e.isStreamActive);
    const syntheticStreaming = displayEntries.some((e) =>
      e.key.startsWith("__streaming__:"),
    );

    console.log(`${ASSISTANT_MSG_DEBUG} displayEntries`, {
      conversationId,
      entryCount: displayEntries.length,
      phase,
      isActive,
      latestRequestId,
      hasSyntheticStreamingBubble: syntheticStreaming,
      activeStreamingEntry: streamingEntry
        ? {
            key: streamingEntry.key,
            messageId: streamingEntry.messageId,
            requestId: streamingEntry.requestId,
            isFailed: streamingEntry.isFailed,
            isSynthetic: streamingEntry.key.startsWith("__streaming__:"),
          }
        : null,
      entries: displayEntries.map((e) => ({
        key: e.key,
        role: e.role,
        messageId: e.messageId,
        requestId: e.requestId,
        isStreamActive: e.isStreamActive,
        isFailed: e.isFailed,
        canRetry: e.canRetry,
        renderNote:
          e.role === "user"
            ? "→ AgentUserMessage"
            : e.isFailed
              ? "→ standalone AgentAssistantMessage (failed)"
              : e.isStreamActive
                ? e.key.startsWith("__streaming__:")
                  ? "→ synthetic pre-reservation streaming bubble"
                  : "→ streaming assistant cx_message (MarkdownStream path)"
                : "→ folds into AssistantTurnGroup buffer",
      })),
    });
    prevDisplayEntriesKeyRef.current = entriesKey;
  }, [conversationId, displayEntries, phase, isActive, latestRequestId]);

  const prevDisplayGroupsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const groupsKey = displayGroups
      .map((g) => {
        if (g.kind === "user") return `user:${g.key}:${g.messageId}`;
        if (g.kind === "assistant-failed") {
          return `failed:${g.key}:${g.messageId ?? "null"}:${g.requestId ?? "null"}:${g.isStreamActive}:${g.canRetry}`;
        }
        return `assistant:${g.key}:${g.members.length}:${g.members.map((m) => `${m.key}:${m.isStreamActive}`).join(",")}`;
      })
      .join("|");
    if (prevDisplayGroupsKeyRef.current === groupsKey) return;

    console.log(`${ASSISTANT_MSG_DEBUG} displayGroups`, {
      conversationId,
      groupCount: displayGroups.length,
      assistantGroupCount,
      groups: displayGroups.map((g) => {
        if (g.kind === "user") {
          return {
            kind: g.kind,
            key: g.key,
            messageId: g.messageId,
            renders: "AgentUserMessage",
          };
        }
        if (g.kind === "assistant-failed") {
          return {
            kind: g.kind,
            key: g.key,
            messageId: g.messageId,
            requestId: g.requestId,
            isStreamActive: g.isStreamActive,
            canRetry: g.canRetry,
            renders: "AgentAssistantMessage (failed, no turn group)",
            actionBar: "hidden (failed turn)",
          };
        }
        const lastMember = g.members[g.members.length - 1];
        const showGroupActionBar =
          !!lastMember &&
          !lastMember.isStreamActive &&
          g.members.some((m) => m.messageId);
        return {
          kind: g.kind,
          key: g.key,
          memberCount: g.members.length,
          renders: "AssistantTurnGroup",
          members: g.members.map((m) => ({
            key: m.key,
            messageId: m.messageId,
            requestId: m.requestId,
            isStreamActive: m.isStreamActive,
            perMemberActionBar: "hidden (group owns bar)",
          })),
          groupActionBar: showGroupActionBar
            ? "visible"
            : "hidden (streaming or no anchor id)",
        };
      }),
    });
    prevDisplayGroupsKeyRef.current = groupsKey;
  }, [conversationId, displayGroups, assistantGroupCount]);

  const displayGroupsCycleRef = useRef(0);
  useEffect(() => {
    displayGroupsCycleRef.current += 1;
    console.log(`${ASSISTANT_MSG_DEBUG} displayGroups cycle`, {
      cycle: displayGroupsCycleRef.current,
      conversationId,
      groupCount: displayGroups.length,
      displayGroups,
    });
  }, [conversationId, displayGroups]);

  const isEmpty = displayGroups.length === 0;
  const prevIsEmptyRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevIsEmptyRef.current === isEmpty) return;
    console.log(`${ASSISTANT_MSG_DEBUG} topLevelBranch`, {
      conversationId,
      from:
        prevIsEmptyRef.current === null
          ? null
          : prevIsEmptyRef.current
            ? "AgentEmptyMessageDisplay"
            : "messageList",
      to: isEmpty ? "AgentEmptyMessageDisplay" : "messageList",
      reason: isEmpty
        ? "displayGroups is empty — no user/assistant entries survived filtering"
        : `rendering ${displayGroups.length} group(s)`,
      groupCount: displayGroups.length,
    });
    prevIsEmptyRef.current = isEmpty;
  }, [conversationId, isEmpty, displayGroups.length]);

  useEffect(() => {
    if (!isWarRoomTileAgentSurface(surfaceKey)) return;
    traceWarRoomRenderPath(
      13,
      "AgentConversationDisplay.tsx",
      "message list render",
      {
        conversationId,
        messageCount: messages.length,
        assistantGroupCount,
        streamPhase: phase,
      },
    );
  }, [surfaceKey, conversationId, messages.length, assistantGroupCount, phase]);

  if (displayGroups.length === 0) {
    return <AgentEmptyMessageDisplay conversationId={conversationId} />;
  }

  // Outer spacing applies BETWEEN groups (between the user turn and the
  // assistant turn that follows, or between two adjacent user turns).
  // Inside a group, AssistantTurnGroup renders sub-messages flush — no
  // additional spacing between iterations.
  const spacingClass = compact ? "space-y-2 pb-2" : "space-y-6 pb-24";

  return (
    <MarkdownContextMenuProvider conversationId={conversationId}>
      <div className={`${spacingClass} p-2 scrollbar-hide`}>
        {displayGroups.map((group) => {
          if (group.kind === "user") {
            return (
              <AgentUserMessage
                key={group.key}
                conversationId={conversationId}
                messageId={group.messageId}
                surfaceKey={surfaceKey}
                compact={compact}
              />
            );
          }

          if (group.kind === "assistant-failed") {
            // Rendered directly (not via AssistantTurnGroup): a failed turn
            // renders whatever content already streamed with the error line
            // appended BELOW it (error-only when nothing streamed), and never
            // mounts an action bar — nothing for a turn group to coordinate.
            return (
              <AgentAssistantMessage
                key={group.key}
                conversationId={conversationId}
                requestId={group.requestId ?? undefined}
                messageId={group.messageId ?? undefined}
                isStreamActive={group.isStreamActive}
                surfaceKey={surfaceKey}
                compact={compact}
                canRetry={group.canRetry}
              />
            );
          }

          return (
            <AssistantTurnGroup
              key={group.key}
              conversationId={conversationId}
              surfaceKey={surfaceKey}
              compact={compact}
              members={group.members}
            />
          );
        })}

        <div ref={bottomRef} />
      </div>
    </MarkdownContextMenuProvider>
  );
}
