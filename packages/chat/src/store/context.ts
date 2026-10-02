// packages/chat/src/store/context.ts
//
// The package's own react-redux context (PACKAGE-INDEPENDENCE.md §2.2). Package hooks bind to it,
// so a private chat store never collides with a host's own react-redux store. `null` until a
// provider mounts one; the transition fallback to `ReactReduxContext` belongs to the hooks (P3).

"use client";

import { createContext } from "react";
import type { ReactReduxContextValue } from "react-redux";

export const ChatStoreContext = createContext<ReactReduxContextValue | null>(null);
ChatStoreContext.displayName = "ChatStoreContext";
