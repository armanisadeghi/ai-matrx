"use client";

/**
 * <ChatProvider host> — the React door to the host contract.
 *
 * In the browser it installs the host for non-React code (`configureChat`)
 * during its own render, before any child renders, so a child's first render
 * already finds it. On the server it only provides the host through context:
 * the module global is never written during SSR, so one request's host can
 * never be read by another.
 *
 * The store half (`store?` prop, `ChatStoreContext`) arrives with P2/P3.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { ChatHost, ResolvedChatHost } from "./contract";
import { configureChat, resolveChatHost } from "./configure";
import { ChatHostNotConfiguredError } from "./errors";

const ChatHostContext = createContext<ResolvedChatHost | null>(null);

export interface ChatProviderProps {
  host: ChatHost;
  children?: ReactNode;
}

export function ChatProvider({ host, children }: ChatProviderProps) {
  // configureChat caches by host reference, so a re-render with the same host
  // object is free; the React Compiler memoizes the call itself.
  const resolved =
    typeof window === "undefined" ? resolveChatHost(host) : configureChat(host);
  return (
    <ChatHostContext.Provider value={resolved}>
      {children}
    </ChatHostContext.Provider>
  );
}

/** The host from the nearest <ChatProvider>, or null outside one. */
export function useMaybeChatHost(): ResolvedChatHost | null {
  return useContext(ChatHostContext);
}

/** The host from the nearest <ChatProvider>. Throws the named, remedied error outside one. */
export function useChatHost(): ResolvedChatHost {
  const host = useContext(ChatHostContext);
  if (!host) throw new ChatHostNotConfiguredError();
  return host;
}
