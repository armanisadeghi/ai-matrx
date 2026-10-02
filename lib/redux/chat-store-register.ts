// lib/redux/chat-store-register.ts
//
// Registers this app's store types with @ai-matrx/chat (PACKAGE-INDEPENDENCE.md §2.2, P3). The
// app injects its own store into the package (<ChatProvider store>), so package selectors, thunks
// and hooks are typed against the full RootState — without the package importing the app.
// Type-only: nothing here runs.

import type { AppDispatch, AppStore, RootState } from "./store";

declare module "@ai-matrx/chat/store/root-state" {
  interface ChatStoreRegister {
    rootState: RootState;
    dispatch: AppDispatch;
    store: AppStore;
  }
}
