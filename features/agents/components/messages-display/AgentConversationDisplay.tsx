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
import type { MessageRole } from "@/features/agents/types/agent-message-types";
import {
  selectStreamPhase,
  selectLatestRequestId,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { AgentUserMessage } from "./user/AgentUserMessage";
// Universal v3 context menu — the SAME menu everywhere. ONE read-only instance
// serves the whole transcript: `resolveContextOnOpen` resolves the per-message /
// per-block context from cheap DOM tags (`data-message-id`, `data-mtx-ctx`) on
// right-click, so blocks stay free (just tags) instead of mounting a menu each.
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { resolveMarkdownContext } from "@/features/context-menu-v2/markdown/resolveMarkdownContext";
import type { AssistantTurnGroupMember } from "./assistant/AssistantTurnGroup";
import {
  isWarRoomThreadAgentSurface,
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

interface DisplayEntry {
  key: string;
  role: MessageRole;
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
  // Anchor for the scroll-on-submit behavior: the conversation's last user
  // message. On a new submit we scroll THIS to the top of the viewport so the
  // rest of the page opens up for the incoming answer (see effect below).
  const lastUserRef = useRef<HTMLDivElement>(null);

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
      // `tool` / `system` rows never render as their own turn and MUST be
      // dropped HERE, not in the grouping pass. Tool-result rows are V2 DB
      // stubs whose payloads inline onto the preceding assistant's tool_call
      // segments (`selectMessageInterleavedContent` returns no segments for
      // them); system rows are display-skipped downstream. This is load-
      // bearing: in V2 `position` order an agentic turn is assistant → tool →
      // assistant → …, so a tool row sits BETWEEN two assistant iterations. If
      // it survives into `displayGroups` it flushes the open turn group,
      // fragmenting ONE logical answer into several stacked groups — each with
      // its own `space-y-6` gap (and, pre-fix, its own action bar). That
      // fragmentation is the "giant gaps between tool calls and text" report:
      // those iterations are a single turn and must render as one seamless
      // `AssistantTurnGroup`.
      if (rec.role === "tool" || rec.role === "system") continue;
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

  // Key of the conversation's LAST user turn — the scroll anchor.
  const lastUserKey = useMemo(() => {
    for (let i = displayGroups.length - 1; i >= 0; i--) {
      if (displayGroups[i].kind === "user") return displayGroups[i].key;
    }
    return undefined;
  }, [displayGroups]);

  // Scroll-on-submit: ONE smooth scroll that pins the just-submitted user
  // message to the top of the viewport, opening the rest of the page for the
  // agent's streaming answer. This deliberately does NOT follow the stream —
  // there is no continuous auto-scroll, so token/iteration appends never yank
  // the viewport around. It fires only when the last user turn actually
  // CHANGES (a real new submit), never on stream chunks, older-history
  // prepends, or the initial load of an existing conversation.
  const prevLastUserKeyRef = useRef<string | undefined>(undefined);
  const didMountRef = useRef(false);
  useEffect(() => {
    const prev = prevLastUserKeyRef.current;
    prevLastUserKeyRef.current = lastUserKey;
    // Skip the first commit: opening an existing conversation should land
    // wherever the scroll container puts it, not jump the last turn to top.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (lastUserKey && lastUserKey !== prev) {
      lastUserRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [lastUserKey]);

  const assistantGroupCount = displayGroups.filter(
    (g) => g.kind === "assistant" || g.kind === "assistant-failed",
  ).length;

  useEffect(() => {
    if (!isWarRoomThreadAgentSurface(surfaceKey)) return;
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

  // Single-instance delegation: the ONE menu resolves the right-clicked
  // message / block from the DOM at open time. Pure DOM reads (no React/Redux),
  // so it costs nothing until the user actually right-clicks.
  const resolveMenuContext = (target: HTMLElement | null) =>
    resolveMarkdownContext(target, conversationId);

  if (displayGroups.length === 0) {
    return <AgentEmptyMessageDisplay conversationId={conversationId} />;
  }

  // Outer spacing applies BETWEEN groups (between the user turn and the
  // assistant turn that follows, or between two adjacent user turns).
  // Inside a group, AssistantTurnGroup renders sub-messages flush — no
  // additional spacing between iterations.
  const spacingClass = compact ? "space-y-2 pb-2" : "space-y-6 pb-24";

  return (
    <NonEditableContextMenu
      sourceFeature="assistant-message"
      surfaceName="matrx-user/assistant-message"
      enableFloatingIcon={false}
      // Content blocks are insert-into-an-editor items — meaningless on
      // read-only rendered output, so hide that submenu here.
      placementMode={{ "content-block": "hide" }}
      contextData={{ conversationId }}
      resolveContextOnOpen={resolveMenuContext}
    >
      <div className={`${spacingClass} p-2 scrollbar-hide`}>
        {displayGroups.map((group) => {
          if (group.kind === "user") {
            const isLastUser = group.key === lastUserKey;
            return (
              <div key={group.key} ref={isLastUser ? lastUserRef : undefined}>
                <AgentUserMessage
                  conversationId={conversationId}
                  messageId={group.messageId}
                  surfaceKey={surfaceKey}
                  compact={compact}
                />
              </div>
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
      </div>
    </NonEditableContextMenu>
  );
}
