"use client";

/**
 * MessageCitationsContext — carries the per-message numbered citation source
 * list from the message shell (AgentAssistantMessage) down to the inline
 * `<matrxcite n="…" />` marker renderer, which sits deep inside the markdown
 * tree (BasicMarkdownContent → CitationMarkerInline) and has no message props.
 *
 * Mirrors the ScribeCitationContext pattern (`<audiocite>`'s session id):
 * the marker carries only a number; the data rides context.
 *
 * Live-stream seam: the future live citation pass wraps the streaming
 * message in this SAME provider with a request-derived index — the marker
 * renderer and sources footer are provider-agnostic.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { MessageCitationSource } from "@/features/agents/redux/execution-system/messages/message-citations";

const EMPTY_SOURCES: MessageCitationSource[] = [];

const MessageCitationsContext =
  createContext<MessageCitationSource[]>(EMPTY_SOURCES);

export function MessageCitationsProvider({
  sources,
  children,
}: {
  sources: MessageCitationSource[];
  children: ReactNode;
}) {
  return (
    <MessageCitationsContext.Provider value={sources}>
      {children}
    </MessageCitationsContext.Provider>
  );
}

/** The numbered sources for the message currently being rendered ([] outside chat). */
export function useMessageCitationSources(): MessageCitationSource[] {
  return useContext(MessageCitationsContext);
}
