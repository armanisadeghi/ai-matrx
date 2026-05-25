"use client";

import React from "react";
import ThinkingTrace from "./ThinkingTrace";

/**
 * Adapter — multi-step reasoning collapses into the single unified
 * {@link ThinkingTrace}. The steps are joined into one trace; expanding shows
 * them in order.
 */
interface ConsolidatedReasoningVisualizationProps {
  /** Raw reasoning text blocks (the content from each `<reasoning>` block). */
  reasoningTexts: string[];
  showReasoning?: boolean;
  isStreaming?: boolean;
}

const ConsolidatedReasoningVisualization: React.FC<
  ConsolidatedReasoningVisualizationProps
> = ({ reasoningTexts, showReasoning = true, isStreaming = false }) => (
  <ThinkingTrace
    texts={reasoningTexts}
    showThinking={showReasoning}
    isStreaming={isStreaming}
  />
);

export default ConsolidatedReasoningVisualization;
