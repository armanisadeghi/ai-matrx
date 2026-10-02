// packages/chat/src/store/chat-host-sync.ts
//
// The StoreUpdater half of <ChatProvider> (XY Flow's pattern, PACKAGE-INDEPENDENCE.md §2.2, P3):
// writes the host ports' values into the `chatHost` slice.
//
//   - FIRST RENDER: synchronously, during the provider's render and before any child renders, so
//     no child ever paints from the empty default (`chat-host-synced-before-first-render`). Only
//     while the store has never been synced — nothing is subscribed to the store at that point of
//     a first mount, so no other component is updated during this render.
//   - AFTER: on every identity / org / prefs / preferences notification, only when a value changed.

"use client";

import { useEffect } from "react";
import type { Store } from "@reduxjs/toolkit";
import type { ResolvedChatHost } from "../host/contract";
import {
  chatHostMatches,
  chatHostSynced,
  readChatHostPrefs,
  readChatHostSnapshot,
  type ChatHostState,
} from "./chat-host.slice";

function readChatHost(store: Store): ChatHostState | undefined {
  return (store.getState() as { chatHost?: ChatHostState }).chatHost;
}

/** Write the ports into `chatHost` now when this store was never synced. */
export function syncChatHostIfUnsynced(store: Store, host: ResolvedChatHost): void {
  if (readChatHost(store)?.synced) return;
  store.dispatch(
    chatHostSynced(
      readChatHostSnapshot(host, readChatHostPrefs(host), readChatHost(store)?.preferences),
    ),
  );
}

/** Keep `chatHost` equal to the ports. Returns the unsubscribe. */
export function followChatHost(store: Store, host: ResolvedChatHost): () => void {
  const sync = (changedPrefKey?: string) => {
    const current = readChatHost(store);
    let prefs = current?.synced ? current.prefs : readChatHostPrefs(host);
    if (changedPrefKey !== undefined) {
      prefs = { ...prefs, [changedPrefKey]: host.prefs.get(changedPrefKey) };
    }
    const next = readChatHostSnapshot(host, prefs, current?.preferences);
    if (!chatHostMatches(current, next)) store.dispatch(chatHostSynced(next));
  };
  sync();
  const stops = [
    host.identity.subscribe(() => sync()),
    host.org.subscribe(() => sync()),
    host.prefs.subscribe((key) => sync(key)),
    host.prefs.subscribePreferences?.(() => sync()) ?? (() => {}),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

/** The provider's StoreUpdater: first-render sync, then follow the ports. */
export function useChatHostSync(store: Store, host: ResolvedChatHost): void {
  "use no memo";
  syncChatHostIfUnsynced(store, host);
  useEffect(() => followChatHost(store, host), [store, host]);
}
