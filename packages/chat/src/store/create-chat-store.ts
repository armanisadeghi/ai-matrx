// packages/chat/src/store/create-chat-store.ts
//
// The PRIVATE chat store for a host with no Redux of its own (extend, local, any bare host —
// PACKAGE-INDEPENDENCE.md §2.2). Same reducers, same middleware order, same sagas as the host
// mount. Built at P2; it is NOT yet claimed to run a turn — slices still read host keys
// (§2.3) that do not exist here. That gate is `private-store-runs-a-turn.test.ts` (P24g).

import { combineReducers, configureStore, type Middleware } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { fork } from "redux-saga/effects";
import {
  cloudFilesMutationToastMiddleware,
  cloudFilesRealtimeMiddleware,
  cloudFilesReducer,
  configureFilesHost,
  type FilesHost,
} from "@ai-matrx/media/files/engine";
import { chatReducers } from "./slices";
import { chatMiddlewares } from "./middlewares";
import { chatSagas } from "./sagas";
import type { ChatState } from "./state";

export interface CreateChatStoreOptions {
  /**
   * The files engine's host (database, server client, optional scope/org/share/notify) for a
   * host that has not called `configureFilesHost` itself. The engine is then wired to THIS
   * store, so file thunks read and write the slice chat renders from.
   */
  files?: Omit<FilesHost, "store">;
}

export function createChatStore(
  preloadedState?: Partial<ChatState>,
  options: CreateChatStoreOptions = {},
) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    // Files are part of chat (P16f): the files engine's slice and its two middlewares come
    // straight from @ai-matrx/media. A host that brings its own store mounts them itself.
    reducer: combineReducers({ ...chatReducers, cloudFiles: cloudFilesReducer }),
    preloadedState: preloadedState as ChatState | undefined,
    // The chat middlewares are still typed against the host RootState (§2.3 — host keys
    // they read); widened here until those reads move onto `chatHost` (P7–P9).
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
        actionCreatorCheck: false,
      }).concat(
        sagaMiddleware,
        ...(chatMiddlewares() as readonly Middleware[]),
        cloudFilesRealtimeMiddleware,
        cloudFilesMutationToastMiddleware,
      ),
    devTools: process.env.NODE_ENV !== "production",
  });
  if (options.files) configureFilesHost({ ...options.files, store: () => store });
  sagaMiddleware.run(function* chatRootSaga() {
    for (const saga of chatSagas()) yield fork(saga);
  });
  return store;
}

export type ChatStore = ReturnType<typeof createChatStore>;
