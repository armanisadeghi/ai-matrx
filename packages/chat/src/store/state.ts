// packages/chat/src/store/state.ts
//
// `ChatState` — the state shape of the slices this package owns, derived from `chatReducers`.
// A host store's RootState is a superset of it (same keys, §2.2).

import type { StateFromReducersMapObject } from "@reduxjs/toolkit";
import type { ChatReducers } from "./slices";

export type ChatState = StateFromReducersMapObject<ChatReducers>;
