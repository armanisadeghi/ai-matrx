"use client";

// Whether the markdown under this point is a LIVE stream (text still arriving).
//
// The chat engine (EnhancedChatMarkdown) provides it from its isStreamActive;
// the MarkdownCore front door reads it and heals half-arrived syntax (see
// stream-heal.ts). Every MarkdownCore leaf inside a live stream — prose,
// nested sections, thinking traces, table cells — inherits the healing without
// a prop being threaded through each wrapper. Outside a stream it is false, so
// finished text renders exactly as authored.

import { createContext, useContext } from "react";

const MarkdownStreamingContext = createContext(false);

export const MarkdownStreamingProvider = MarkdownStreamingContext.Provider;

export function useMarkdownStreaming(): boolean {
  return useContext(MarkdownStreamingContext);
}
