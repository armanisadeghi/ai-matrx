"use client";

// ============================================================================
// INLINE THINKING SLOT — live rendering for a `thinking` unified slot.
//
// Native reasoning tokens (`reasoning_chunk` events) live in the request's
// `reasoningChunks` array — they are NOT render blocks, so before this slot
// existed they were never rendered during the live session at all (the
// persisted `thinking` part only appeared after a reload). This component
// closes that live/DB divergence: it selects the slot's chunk range and hands
// the text to the SAME `renderBlock({type:"reasoning"})` pipeline the DB path
// uses, so both paths produce an identical ThinkingTrace.
//
// A slot with no text is either a token-less model mid-thought (open run →
// show the "Reasoning…" indicator, which is what keeps the status alive the
// whole time the model thinks) or a closed empty run (render nothing).
// ============================================================================

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectReasoningRunText } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { InlineStatusIndicator } from "./InlineStatusIndicator";

export interface InlineThinkingSlotProps {
  requestId: string;
  chunkStartIndex: number;
  /** Absent while the run is still open (tokens may still arrive). */
  chunkEndIndex?: number;
  /**
   * Renders the reasoning text through the caller's block pipeline
   * (EnhancedChatMarkdown's `renderBlock`) so live and persisted thinking
   * share one renderer. `isStreaming` is true while the run is open.
   */
  renderReasoning: (content: string, isStreaming: boolean) => React.ReactNode;
}

export const InlineThinkingSlot: React.FC<InlineThinkingSlotProps> = ({
  requestId,
  chunkStartIndex,
  chunkEndIndex,
  renderReasoning,
}) => {
  const text = useAppSelector(
    selectReasoningRunText(requestId, chunkStartIndex, chunkEndIndex),
  );
  const isOpen = chunkEndIndex === undefined;

  if (!text.trim()) {
    return isOpen ? <InlineStatusIndicator label="Reasoning…" /> : null;
  }

  return <>{renderReasoning(text, isOpen)}</>;
};
