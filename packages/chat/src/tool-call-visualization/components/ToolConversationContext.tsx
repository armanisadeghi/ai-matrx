"use client";

/**
 * ToolConversationContext — the conversation a tool-call card is rendered for.
 *
 * Cards like `ask_person` look up their open ask by conversation id, so every
 * host that renders tool cards (inline chat, the Window Panel, the
 * ToolUpdatesOverlay modal) must supply it. The shared bodies
 * (`EntryResultsBody`, `CustomOverlayBody`) read it from here when no explicit
 * prop is given, so a new host that wraps its tree in this provider cannot
 * forget it.
 */
import React, { createContext, useContext } from "react";

const ToolConversationContext = createContext<string | null>(null);

export const ToolConversationProvider: React.FC<{
  conversationId?: string | null;
  children: React.ReactNode;
}> = ({ conversationId, children }) => (
  <ToolConversationContext.Provider value={conversationId ?? null}>
    {children}
  </ToolConversationContext.Provider>
);

export function useToolConversationId(): string | null {
  return useContext(ToolConversationContext);
}
