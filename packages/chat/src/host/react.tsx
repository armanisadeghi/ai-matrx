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
 * The store half (P3): it mounts the chat store on the package's own
 * `ChatStoreContext` — the host's store when `store` is passed (its root
 * reducer spreads `chatReducers`), else a private one built once — and keeps
 * the `chatHost` slice equal to the ports, written before any child renders.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import type { Store } from "@reduxjs/toolkit";
import type { ChatHost, ResolvedChatHost } from "./contract";
import { configureChat, resolveChatHost } from "./configure";
import { ChatHostNotConfiguredError } from "./errors";
import { ChatStoreContext } from "../store/context";
import { createChatStore } from "../store/create-chat-store";
import { useChatHostSync } from "../store/chat-host-sync";
import { setStoreSingleton } from "../store/store-singleton";

const ChatHostContext = createContext<ResolvedChatHost | null>(null);

export interface ChatProviderProps {
  host: ChatHost;
  /**
   * The app's own Redux store, shared with the package (its root reducer
   * spreads `chatReducers`, its middleware chain `chatMiddlewares()`). Omit it
   * and the provider builds a private chat store.
   */
  store?: Store;
  children?: ReactNode;
}

export function ChatProvider({ host, store, children }: ChatProviderProps) {
  // configureChat caches by host reference, so a re-render with the same host
  // object is free; the React Compiler memoizes the call itself.
  const resolved =
    typeof window === "undefined" ? resolveChatHost(host) : configureChat(host);
  const [privateStore] = useState(() => (store ? null : createChatStore()));
  const chatStore: Store = store ?? (privateStore as Store);
  // Non-React package code reads the store through the singleton; the module
  // global is never written during SSR (one request's store is never another's).
  if (typeof window !== "undefined") setStoreSingleton(chatStore);
  useChatHostSync(chatStore, resolved);
  return (
    <ChatHostContext.Provider value={resolved}>
      <Provider store={chatStore} context={ChatStoreContext}>
        {children}
      </Provider>
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
