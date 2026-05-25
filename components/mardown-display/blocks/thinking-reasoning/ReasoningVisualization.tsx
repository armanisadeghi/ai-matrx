"use client";

import React from "react";
import ThinkingTrace from "./ThinkingTrace";

/**
 * Adapter — the canonical renderer is the unified, text-based
 * {@link ThinkingTrace}. Kept so every caller (BlockRenderer's `thinking` /
 * `reasoning` cases, the legacy chat stream display, demos) renders identically.
 */
interface ReasoningVisualizationProps {
  reasoningText: string;
  showReasoning?: boolean;
  isStreaming?: boolean;
}

const ReasoningVisualization: React.FC<ReasoningVisualizationProps> = ({
  reasoningText,
  showReasoning = true,
  isStreaming = false,
}) => (
  <ThinkingTrace
    text={reasoningText}
    showThinking={showReasoning}
    isStreaming={isStreaming}
  />
);

export default ReasoningVisualization;
