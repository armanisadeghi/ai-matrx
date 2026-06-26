"use client";

/**
 * AssistantTurnGroup
 *
 * Renders ONE logical assistant turn — i.e. the contiguous run of
 * `cx_message` rows with `role: "assistant"` that the server creates for
 * a single agentic turn (one user prompt → N iterations of thinking /
 * tool_call / text → next user prompt).
 *
 * Why this exists: the server reserves a new `cx_message` per iteration,
 * so a heavily agentic turn (dozens of tool calls) becomes dozens of
 * adjacent assistant messages in the slice. Without grouping, each
 * iteration gets its own `space-y-6` gap and its own AssistantActionBar,
 * which fragments the visual answer and scatters controls across the
 * transcript. The grouping layer collapses those sub-messages into a
 * single seamless block with one trailing action bar.
 *
 * Design rules (per product direction):
 *   - **Zero added chrome between sub-messages.** No card, no rail, no
 *     iteration badges, no extra spacing. The natural content (tool cards,
 *     thinking blocks, text) provides all the visual structure needed.
 *   - **One action bar per group**, anchored to the LAST assistant message
 *     (the "answer"). Intermediate iterations carry no bar at all.
 *   - **Compact-density carries over for free**: since the bar is anchored
 *     to the latest assistant in the group, and `selectIsLatestAssistant
 *     Message` returns true for the conversation-wide latest, only the
 *     newest turn's bar stays visible — older groups hover-reveal as
 *     before.
 *   - **Print captures the whole group** so users get the full multi-step
 *     turn in a single PDF.
 *
 * Streaming: while the last member's `isStreamActive` is true, the group's
 * action bar is hidden — same gate as the single-message path.
 */

import { useCallback, useEffect } from "react";
import { useDomCapturePrint } from "@/features/conversation/hooks/useDomCapturePrint";
import { AgentAssistantMessage } from "./AgentAssistantMessage";
import { AssistantActionBar } from "./AssistantActionBar";
import {
  isWarRoomThreadAgentSurface,
  traceWarRoomRenderPath,
} from "@/features/war-room/utils/renderPathTrace";

export interface AssistantTurnGroupMember {
  /** Stable React key for this sub-message render. */
  key: string;
  /** `cx_message.id` for committed rows, null for the live streaming entry. */
  messageId: string | null;
  /** Stream request id when this row is streaming; null otherwise. */
  requestId: string | null;
  /** True when this row is the active streaming bubble. */
  isStreamActive: boolean;
}

interface AssistantTurnGroupProps {
  conversationId: string;
  surfaceKey?: string;
  compact?: boolean;
  /** Every assistant member of this logical turn, in transcript order. */
  members: AssistantTurnGroupMember[];
}

export function AssistantTurnGroup({
  conversationId,
  surfaceKey,
  compact = false,
  members,
}: AssistantTurnGroupProps) {
  const { captureRef, isCapturing, captureAsPDF } = useDomCapturePrint();

  // The "answer anchor" for this group: the latest assistant member with
  // a real messageId. The trailing action bar binds Edit / Like / Delete
  // / overflow-menu to this id, and aggregates Copy / Speak across every
  // member in the group via `groupMessageIds`.
  const lastMember = members[members.length - 1];
  const anchorMessageId = (() => {
    for (let i = members.length - 1; i >= 0; i--) {
      const m = members[i];
      if (m.messageId) return m.messageId;
    }
    return null;
  })();

  const groupMessageIds: string[] = members
    .map((m) => m.messageId)
    .filter((id): id is string => typeof id === "string");

  const handleFullPrint = useCallback(() => {
    captureAsPDF({
      filename: `agent-${conversationId}-${anchorMessageId ?? "turn"}`,
    });
  }, [captureAsPDF, conversationId, anchorMessageId]);

  // Action bar is shown only when the LAST member has finished streaming
  // and resolves to a real messageId. Mirrors the per-message gate in
  // `AgentAssistantMessage`.
  const showBar =
    !!lastMember && !lastMember.isStreamActive && !!anchorMessageId;

  useEffect(() => {
    if (!isWarRoomThreadAgentSurface(surfaceKey)) return;
    traceWarRoomRenderPath(
      14,
      "AssistantTurnGroup.tsx",
      "assistant turn group render",
      {
        conversationId,
        memberCount: members.length,
        anchorMessageId,
        streaming: lastMember?.isStreamActive ?? false,
      },
    );
  }, [
    surfaceKey,
    conversationId,
    members.length,
    anchorMessageId,
    lastMember?.isStreamActive,
  ]);

  return (
    <div
      ref={captureRef}
      data-turn-group-anchor={anchorMessageId ?? undefined}
      // Hover anchor for the trailing AssistantActionBar. Because the bar
      // is a SIBLING of the sub-messages (not nested inside any one
      // `AgentAssistantMessage`), it can't rely on a member's own
      // `group/assistant-msg`. The group wrapper must carry the anchor so
      // hovering anywhere over the turn reveals the hover-only bar on
      // older turns.
      className="group/assistant-msg"
    >
      {/* Sub-messages render flush — no spacer / divider / chrome between
          iterations. Tool cards and thinking blocks already provide all
          the visual rhythm a multi-step turn needs. */}
      {members.map((m) => (
        <AgentAssistantMessage
          key={m.key}
          conversationId={conversationId}
          requestId={m.requestId ?? undefined}
          messageId={m.messageId ?? undefined}
          isStreamActive={m.isStreamActive}
          surfaceKey={surfaceKey}
          compact={compact}
          // Suppress every per-member bar (including the latest's): the
          // group's trailing bar below owns chrome for the whole turn,
          // so Copy / Speak / Print can aggregate across iterations.
          hideActionBar={true}
        />
      ))}

      {showBar && anchorMessageId && (
        <AssistantActionBar
          messageId={anchorMessageId}
          conversationId={conversationId}
          onFullPrint={handleFullPrint}
          isCapturing={isCapturing}
          surfaceKey={surfaceKey}
          // Aggregation hook — only meaningful for multi-iteration turns,
          // single-iteration turns fall through to the existing
          // single-message Copy / Speak path.
          groupMessageIds={
            groupMessageIds.length > 1 ? groupMessageIds : undefined
          }
        />
      )}
    </div>
  );
}
