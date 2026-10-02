// packages/chat/src/store/store-singleton.ts
//
// The chat store for code that runs outside React (event handlers built outside a component,
// services). Set by the host when it builds the store it injects (matrx-frontend: `makeStore`),
// and by <ChatProvider> in the browser for the store it mounts. Null until then — callers handle
// a missing store, exactly as they did with the host's singleton.
//
// A leaf: imports nothing from the project, not even types, so any module can read it without
// dragging the reducer graph (or a type cycle) in. Callers cast `getState()` as they need, as
// they did with the host's singleton (same structural type).

import type { EnhancedStore } from "@reduxjs/toolkit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatStoreSingleton = EnhancedStore<any, any, any>;

let current: ChatStoreSingleton | null = null;

export function setStoreSingleton(store: ChatStoreSingleton): void {
  current = store;
}

export function getStoreSingleton(): ChatStoreSingleton | null {
  return current;
}
