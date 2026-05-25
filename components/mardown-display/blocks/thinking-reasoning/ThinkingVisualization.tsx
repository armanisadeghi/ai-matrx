"use client";

import React from "react";
import ThinkingTrace from "./ThinkingTrace";

/**
 * Adapter — preserved for existing callers (legacy chat stream display, demos).
 * The real rendering is the unified, text-based {@link ThinkingTrace}.
 */
interface ThinkingVisualizationProps {
  thinkingText?: string;
  showThinking?: boolean;
  isStreaming?: boolean;
}

const ThinkingVisualization: React.FC<ThinkingVisualizationProps> = ({
  thinkingText,
  showThinking = true,
  isStreaming = false,
}) => (
  <ThinkingTrace
    text={thinkingText}
    showThinking={showThinking}
    isStreaming={isStreaming}
  />
);

export default ThinkingVisualization;
