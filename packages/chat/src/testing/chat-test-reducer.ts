/**
 * Test helper: the package's own root reducer (every chat-owned slice under its real key) for
 * a suite that builds its store by hand. A test of package behavior reads the package's
 * slices, never the app's `rootReducer`.
 */
import { combineReducers, type Reducer } from "@reduxjs/toolkit";
import type { ChatRootState } from "../store/root-state";
import { chatReducers } from "../store/slices";

/**
 * Typed as the root state package code reads (`ChatRootState`: the package's slices PLUS the
 * host-registered ones such as `userAuth`), because thunks are typed against it. At runtime
 * only the package's slices exist — a suite that needs a host slice supplies it itself.
 */
export const createChatTestReducer = (): Reducer<ChatRootState> =>
  combineReducers(chatReducers) as unknown as Reducer<ChatRootState>;
