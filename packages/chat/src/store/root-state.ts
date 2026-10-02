// packages/chat/src/store/root-state.ts
//
// The store types every package file is written against (PACKAGE-INDEPENDENCE.md §2.2, P3).
//
// A host that injects its own Redux store REGISTERS its types here, once, by module
// augmentation — the TanStack Router `Register` pattern — so package selectors, thunks and
// hooks type-check against the host's full state without the package importing the host:
//
//   declare module "@ai-matrx/chat/store/root-state" {
//     interface ChatStoreRegister { rootState: RootState; dispatch: AppDispatch; store: AppStore }
//   }
//
// matrx-frontend registers in `lib/redux/chat-store-register.ts`. A bare host registers nothing
// and gets the package's own shape: `ChatState` (which includes `chatHost`).

import type {
  Action,
  Dispatch,
  EnhancedStore,
  ThunkAction,
  ThunkDispatch,
  UnknownAction,
} from "@reduxjs/toolkit";
import type { ChatState } from "./state";

/** Augmented by a host that injects its own store. Empty for a private store. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ChatStoreRegister {}

/** The full store state the package runs in: the host's when registered, else `ChatState`. */
export type ChatRootState = ChatStoreRegister extends { rootState: infer S } ? S : ChatState;

/** Thunk-aware dispatch (the `ThunkDispatch & Dispatch` intersection keeps the thunk overload). */
export type ChatDispatch = ChatStoreRegister extends { dispatch: infer D }
  ? D
  : ThunkDispatch<ChatRootState, unknown, UnknownAction> & Dispatch<UnknownAction>;

/** The store object the package's hooks hand out. */
export type ChatAppStore = ChatStoreRegister extends { store: infer S }
  ? S
  : EnhancedStore<ChatRootState, UnknownAction>;

export type ChatThunk<ReturnType = void> = ThunkAction<ReturnType, ChatRootState, unknown, Action>;
