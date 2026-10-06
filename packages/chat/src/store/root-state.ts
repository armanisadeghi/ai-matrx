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

/**
 * Slices the HOST owns that package code reads when present (§2.3). A private store has none of
 * them, so every read is optional; a registered host store supplies the real shapes. Only the
 * fields the package reads are named — anything else stays `unknown`.
 */
export interface ChatHostReadSlices {
  userAuth?: {
    id: string | null;
    email?: string | null;
    isAnonymous?: boolean;
    accessToken?: string | null;
    isAdmin?: boolean;
    adminLaneOpen?: boolean;
    adminLevel?: string | null;
    [field: string]: unknown;
  };
  appContext?: { organization_id?: string | null; [field: string]: unknown };
  userProfile?: {
    fingerprintId?: string | null;
    userMetadata?: {
      fullName?: string | null;
      name?: string | null;
      preferredUsername?: string | null;
      [field: string]: unknown;
    } | null;
    [field: string]: unknown;
  };
  cloudFiles?: {
    filesById: Record<string, { fileName?: string | null; [field: string]: unknown } | undefined>;
    [field: string]: unknown;
  };
  transcriptStudio?: {
    byId?: Record<
      string,
      | {
          id: string;
          assistantConversationId?: string | null;
          assistantConversations?: readonly { conversationId: string; [field: string]: unknown }[];
          [field: string]: unknown;
        }
      | undefined
    >;
    documentsById?: Record<
      string,
      Record<string, { id?: string; content?: string | null; [field: string]: unknown } | undefined> | undefined
    >;
    [field: string]: unknown;
  };
}

/** The full store state the package runs in: the host's when registered, else `ChatState` + optional host reads. */
export type ChatRootState = ChatStoreRegister extends { rootState: infer S } ? S : ChatState & ChatHostReadSlices;

/** Thunk-aware dispatch (the `ThunkDispatch & Dispatch` intersection keeps the thunk overload). */
export type ChatDispatch = ChatStoreRegister extends { dispatch: infer D }
  ? D
  : ThunkDispatch<ChatRootState, unknown, UnknownAction> & Dispatch<UnknownAction>;

/** The store object the package's hooks hand out. */
export type ChatAppStore = ChatStoreRegister extends { store: infer S }
  ? S
  : EnhancedStore<ChatRootState, UnknownAction>;

export type ChatThunk<ReturnType = void> = ThunkAction<ReturnType, ChatRootState, unknown, Action>;
