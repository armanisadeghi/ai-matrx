/**
 * Test helper: the package's own root reducer (every chat-owned slice under its real key) for
 * a suite that builds its store by hand. A test of package behavior reads the package's
 * slices, never the app's `rootReducer`.
 */
import { combineReducers } from "@reduxjs/toolkit";
import { chatReducers } from "../../store/slices";

export const createChatTestReducer = () => combineReducers(chatReducers);
