"use client";

import type { ReactNode } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { setUserInputText } from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { setUserVariableValues } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  CHAT_DRAFT_WRITE_MODES,
  CHAT_INPUT_DRAFT_MAX,
  isChatDraftWriteMode,
} from "@ai-matrx/chat/surfaces/manifests/chat.manifest";
import { createAgentRunVariableValuesHandler } from "@ai-matrx/chat/agents/components/run/agent-run-variable-write";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { isJsonObject } from "@/types/json";
import type { RootState } from "@/lib/redux/store";
import {
  isModelBattleWriteLocked,
  modelBattleVariableDefinitions,
  MODEL_SURFACE_NAME,
  useModelBattleSurfaceScope,
} from "../model-surface-scope";
import { isBattleOwnConversation } from "@/features/agent-comparison/shared/activeBattleColumns";

export function createModelBattleWriteHandlers({
  getState,
  dispatch,
}: {
  getState: () => RootState;
  dispatch: (action: unknown) => unknown;
}): SurfaceWriteHandlers {
  return {
    shared_user_input_draft: (value: unknown) => {
      const state = getState();
      if (isModelBattleWriteLocked(state)) {
        refuseSurfaceWrite(
          "shared_user_input_draft refused while Model Battle is submitting or a model run is active. Wait for every column to finish.",
        );
      }
      const conversationId = state.agentComparisonModel.inputConversationId;
      if (!conversationId) {
        refuseSurfaceWrite(
          "shared_user_input_draft refused because no locked agent and shared request are ready yet.",
        );
      }
      if (!isJsonObject(value)) {
        throw new Error(
          `shared_user_input_draft expects { "text": string, "mode"?: ${CHAT_DRAFT_WRITE_MODES.map((mode) => `"${mode}"`).join(" | ")} }.`,
        );
      }
      const text = value.text;
      const mode = value.mode;
      if (typeof text !== "string" || !text.trim()) {
        throw new Error(
          "shared_user_input_draft expects a non-empty `text` string.",
        );
      }
      if (text.length > CHAT_INPUT_DRAFT_MAX) {
        throw new Error(
          `shared_user_input_draft is ${text.length} characters; the maximum is ${CHAT_INPUT_DRAFT_MAX}.`,
        );
      }
      if (mode !== undefined && !isChatDraftWriteMode(mode)) {
        throw new Error(
          `shared_user_input_draft \`mode\` must be ${CHAT_DRAFT_WRITE_MODES.map((item) => `"${item}"`).join(" | ")}.`,
        );
      }
      const current =
        state.instanceUserInput.byConversationId[conversationId]?.text ?? "";
      const next =
        mode === "append" && current.trim()
          ? `${current.trimEnd()}\n${text}`
          : text;
      if (next.length > CHAT_INPUT_DRAFT_MAX) {
        throw new Error(
          `shared_user_input_draft would be ${next.length} characters; the maximum is ${CHAT_INPUT_DRAFT_MAX}.`,
        );
      }
      dispatch(setUserInputText({ conversationId, text: next }));
    },
    shared_variables: (value: unknown) => {
      const state = getState();
      if (isModelBattleWriteLocked(state)) {
        refuseSurfaceWrite(
          "shared_variables refused while Model Battle is submitting or a model run is active. Wait for every column to finish.",
        );
      }
      const conversationId = state.agentComparisonModel.inputConversationId;
      if (!conversationId) {
        refuseSurfaceWrite(
          "shared_variables refused because no locked agent and shared request are ready yet.",
        );
      }
      createAgentRunVariableValuesHandler({
        readDefinitions: () => modelBattleVariableDefinitions(getState()),
        applyValues: (values) =>
          dispatch(setUserVariableValues({ conversationId, values })),
      })(value);
    },
  };
}

export function ModelBattleSurfaceRuntime({
  children,
}: {
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const getScope = useModelBattleSurfaceScope();

  const getWriteHandlers = () =>
    createModelBattleWriteHandlers({ getState: store.getState, dispatch });

  return (
    <SurfaceRuntimeProvider
      surfaceName={MODEL_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
      // Every model column and the shared request ARE this page (RULES.md §0):
      // none receives the battle, its route or its own id. A window chat over
      // the battle still does. Before 2026-10-01 nothing was declared, so the
      // columns were told the page's route and introduction.
      isOwnConversation={(id) => isBattleOwnConversation(store.getState(), id)}
    >
      <NonEditableContextMenu
        sourceFeature="agent-comparison"
        surfaceName={MODEL_SURFACE_NAME}
        menuVersion={1}
        getApplicationScope={getScope}
        contentSource={{ type: "raw" }}
      >
        <div className="h-full min-h-0">{children}</div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
