"use client";

/**
 * THE PUBLIC APP'S RUN PAYLOAD — how a visitor who cannot read the agent gets
 * what a run needs.
 *
 * The agent readers (`agx_get_execution_minimal` / `_full`) are signed-in
 * doors: anon was revoked in DD-169 and they ask `iam.has_access('agent', …)`.
 * A stranger on `/p/<slug>` therefore got 401 and the launcher never created
 * the run — every public app was dead for every signed-out visitor
 * (page-pass 2026-09-27). `public.get_aga_public_execution(p_app_id)` answers
 * the SAME columns as `agx_get_execution_full`, but only for a published,
 * public, non-deleted app and only for that app's system-default agent — no
 * instructions, no messages, nothing about the owner.
 *
 * It lands in the one agent registry exactly as the full fetch does, so both
 * readiness gates (`selectAgentExecutionPayload` for the launcher and
 * `selectAgentCustomExecutionPayload` for `launchAgentExecution` Step 0.5)
 * are satisfied and no signed-in reader is ever asked.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { pgErrorToError } from "@ai-matrx/data";

import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  mergePartialAgent,
  setAgentFetchStatus,
} from "@/features/agents/redux/agent-definition/slice";
import { selectAgentCustomExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import type { AgentExecutionFull } from "@/features/agents/types/agent-definition.types";

type ThunkApi = { dispatch: AppDispatch; state: RootState };

export interface PublicAppPayloadArgs {
  /** The published app whose default agent the visitor runs. */
  appId: string;
  /** The agent the app's holder named; the door must answer for THIS one. */
  agentId: string;
}

export const fetchPublicAppExecutionPayload = createAsyncThunk<
  void,
  PublicAppPayloadArgs,
  ThunkApi
>(
  "agentApps/fetchPublicAppExecutionPayload",
  async ({ appId, agentId }, { dispatch, getState }) => {
    if (selectAgentCustomExecutionPayload(getState(), agentId).isReady) return;

    const { data, error } = await supabase.rpc("get_aga_public_execution", {
      p_app_id: appId,
    });
    if (error) throw pgErrorToError(error);

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) {
      throw new Error(
        "This app is not published for public use, so it can't run here.",
      );
    }
    const row = raw as unknown as AgentExecutionFull;
    if (row.id !== agentId) {
      // The page resolved a different agent than the app's public default
      // (a signed-in person's own binding). That agent's setup is theirs to
      // read through the signed-in door, never through this one.
      throw new Error(
        "This app's agent could not be loaded for you. Reload the page to try again.",
      );
    }

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
