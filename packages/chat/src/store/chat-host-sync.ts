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
import { announceOnce } from "../host/errors";
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

/**
 * Keep `chatHost` equal to the ports. Returns the unsubscribe.
 *
 * A port backed by the same store subscribes with `store.subscribe`, so this sync runs inside
 * every dispatch — its own `chatHostSynced` included. It never re-enters itself: when the slice
 * cannot come to equal the ports (a port value that is a fresh object on every read, or a host
 * reducer that rewrites the field), a re-entrant sync recursed until the stack ran out and took
 * the page down (/schedules on a phone, 2026-10-02). That disagreement is a host defect: it is
 * announced once, and the slice is synced at most once per outside change.
 */
export function followChatHost(store: Store, host: ResolvedChatHost): () => void {
  let syncing = false;
  /** Pref keys a port reported while our own dispatch ran — applied right after it. */
  const deferredPrefKeys = new Set<string>();
  const sync = (changedPrefKey?: string) => {
    if (syncing) {
      if (changedPrefKey !== undefined) deferredPrefKeys.add(changedPrefKey);
      return;
    }
    const current = readChatHost(store);
    let prefs = current?.synced ? current.prefs : readChatHostPrefs(host);
    if (changedPrefKey !== undefined) {
      prefs = { ...prefs, [changedPrefKey]: host.prefs.get(changedPrefKey) };
    }
    const next = readChatHostSnapshot(host, prefs, current?.preferences);
    if (chatHostMatches(current, next)) return;
    syncing = true;
    try {
      store.dispatch(chatHostSynced(next));
      const keys = [...deferredPrefKeys];
      deferredPrefKeys.clear();
      for (const key of keys) {
        const held = readChatHost(store);
        const withKey = { ...(held?.prefs ?? {}), [key]: host.prefs.get(key) };
        const again = readChatHostSnapshot(host, withKey, held?.preferences);
        if (!chatHostMatches(held, again)) store.dispatch(chatHostSynced(again));
      }
    } finally {
      syncing = false;
    }
    const held = readChatHost(store);
    if (!chatHostMatches(held, readChatHostSnapshot(host, held?.prefs ?? prefs, held?.preferences))) {
      announceOnce(
        "chat-host-never-settles",
        "chatHost never settles: a host port returns a new value on every read, or a host " +
          "reducer rewrites what the port reports. Return the same object until the value changes.",
        "error",
      );
    }
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
