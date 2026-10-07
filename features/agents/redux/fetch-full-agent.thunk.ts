/**
 * fetchFullAgent — the BUILDER's full-definition read (AGENT-CORE-PLAN B2).
 * Left `@ai-matrx/chat` at B2: a chat run reads the run tier only
 * (`fetchAgentRunTier`), so the whole `agent.definition` row is a builder
 * concern. It writes chat's generic `upsertAgent` into the one agent record.
 */
import { createAsyncThunk } from "@reduxjs/toolkit";
import { pgErrorToError } from "@ai-matrx/data";
import { supabase } from "@ai-matrx/chat/host/db";
import type { ChatDispatch, ChatRootState } from "@ai-matrx/chat/store/root-state";
import {
  setAgentError,
  setAgentLoading,
  upsertAgent,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import { dbRowToAgentDefinition } from "@ai-matrx/chat/agents/redux/agent-definition/converters";
import { agentNameTakenError } from "@ai-matrx/chat/agents/redux/agent-definition/agentNameTaken";
import { overlayAgentFavoritesThunk } from "@ai-matrx/chat/agents/redux/agent-definition/thunks";

type ThunkApi = { dispatch: ChatDispatch; state: ChatRootState };

/**
 * Fetches the complete agent row via PostgREST and upserts it into state.
 * Marks the record fully clean — all fields tracked as loaded.
 * Use this when opening the agent builder or after creating/duplicating an agent.
 */
export const fetchFullAgent = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/fetchFull",
  async (agentId, { dispatch }) => {
    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .select("*")
      .eq("id", agentId)
      .single();

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw agentNameTakenError(error) ?? pgErrorToError(error);
    }

    dispatch(upsertAgent(dbRowToAgentDefinition(data)));
    await dispatch(overlayAgentFavoritesThunk([agentId]));
  },
);
