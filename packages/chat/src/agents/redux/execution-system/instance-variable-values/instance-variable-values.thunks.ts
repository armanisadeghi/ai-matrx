/**
 * Instance Variable Values — Undo-aware thunks
 *
 * Wraps setUserVariableValue / setUserVariableValues so every variable edit
 * also pushes a combined { text, userValues } snapshot to the user-input
 * undo stack. This keeps both fields restorable together on Cmd+Z.
 *
 * Components should import setVariableValueWithUndo / setVariableValuesWithUndo
 * from here instead of calling the raw slice actions directly.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "@/lib/redux/store";
import {
  setUserVariableValue,
  setUserVariableValues,
} from "./instance-variable-values.slice";
import { pushInputSnapshot } from "../instance-user-input/instance-user-input.slice";

export const setVariableValueWithUndo = createAsyncThunk<
  void,
  { conversationId: string; name: string; value: unknown },
  { state: RootState; dispatch: AppDispatch }
>(
  "instanceVariableValues/setValueWithUndo",
  async ({ conversationId, name, value }, { getState, dispatch }) => {
    const state = getState();
    const currentText =
      state.instanceUserInput.byConversationId[conversationId]?.text ?? "";
    const currentValues =
      state.instanceVariableValues.byConversationId[conversationId]
        ?.userValues ?? {};

    // Push snapshot of the state BEFORE this change
    dispatch(
      pushInputSnapshot({
        conversationId,
        text: currentText,
        userValues: currentValues,
      }),
    );

    // Apply the variable change
    dispatch(setUserVariableValue({ conversationId, name, value }));
  },
);

export const setVariableValuesWithUndo = createAsyncThunk<
  void,
  { conversationId: string; values: Record<string, unknown> },
  { state: RootState; dispatch: AppDispatch }
>(
  "instanceVariableValues/setValuesWithUndo",
  async ({ conversationId, values }, { getState, dispatch }) => {
    const state = getState();
    const currentText =
      state.instanceUserInput.byConversationId[conversationId]?.text ?? "";
    const currentValues =
      state.instanceVariableValues.byConversationId[conversationId]
        ?.userValues ?? {};

    dispatch(
      pushInputSnapshot({
        conversationId,
        text: currentText,
        userValues: currentValues,
      }),
    );

    dispatch(setUserVariableValues({ conversationId, values }));
  },
);
