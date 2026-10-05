/**
 * BUILDER TIER (PACKAGE-INDEPENDENCE §3, chat-package P25) — reads of the
 * agent DEFINITION that only the builder and admin/configuration surfaces
 * need. They left `@ai-matrx/chat` at P25: chat runs read the run tier
 * (`fetchAgentRunTier`) and the run-control pickers read
 * `fetchAgentRunControls`; nothing in the package fetches the definition
 * except voice until P24v.
 *
 * The thunk still writes the package's `agentDefinition` slice (same action
 * type as before), so every selector reads what it loads unchanged.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { pgErrorToError } from "@ai-matrx/data";
import { supabase } from "@ai-matrx/chat/host/db";
import {
  isSignedOutVisitor,
  NotAuthenticatedError,
} from "@ai-matrx/chat/host/identity";
import type { ChatDispatch, ChatRootState } from "@ai-matrx/chat/store/root-state";
import type { AgentExecutionFull } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { selectAgentCustomExecutionPayload } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  mergePartialAgent,
  setAgentError,
  setAgentFetchStatus,
  setAgentLoading,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import { agentNameTakenError } from "@ai-matrx/chat/agents/redux/agent-definition/agentNameTaken";

type ThunkApi = { dispatch: ChatDispatch; state: ChatRootState };

/**
 * Fetches the full execution payload: adds settings, tools, customTools, modelId.
 * Used by the agent builder preview pane and pages that allow pre-run configuration.
 *
 * Skips if all required fields are already loaded.
 */
export const fetchAgentExecutionFull = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/fetchExecutionFull",
  async (agentId, { dispatch, getState }) => {
    if (selectAgentCustomExecutionPayload(getState(), agentId).isReady) return;
    // Signed out: the RPC refuses `anon` — a state, never a fetch failure.
    if (await isSignedOutVisitor()) throw new NotAuthenticatedError();

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await supabase.rpc("agx_get_execution_full", {
      p_agent_id: agentId,
    });

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw agentNameTakenError(error) ?? pgErrorToError(error);
    }

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return;
    const row = raw as unknown as AgentExecutionFull;

    dispatch(
      mergePartialAgent({
        id: row.id,
        variableDefinitions: row.variable_definitions,
        contextPolicies: row.context_policies ?? [],
        settings: row.settings,
        tools: row.tools,
        customTools: row.custom_tools,
        modelId: row.model_id,
        uiGates: row.ui_gates ?? {},
        autoContextDisabled: row.auto_context_disabled === true,
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "customExecution" }));
  },
);
