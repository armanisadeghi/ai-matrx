/**
 * BUILDER TIER (chat-package P25) — agent version reads (history list, snapshot,
 * version-id lookup). Nothing in @ai-matrx/chat calls these; they left the package
 * with the builder. Action types are unchanged.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { pgErrorToError } from "@ai-matrx/data";
import { supabase } from "@ai-matrx/chat/host/db";
import type { ChatDispatch, ChatRootState } from "@ai-matrx/chat/store/root-state";
import type { DbRpcRow } from "@/types/supabase-rpc";
import type {
  AgentVersionHistoryItem,
  AgentVersionLookup,
} from "@ai-matrx/chat/agents/types/agent-definition.types";
import { upsertAgent } from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import { parseAgentVersionSnapshot } from "@ai-matrx/chat/agents/redux/agent-definition/parse-output-snapshot";
import { versionSnapshotRowToAgentDefinition } from "@ai-matrx/chat/agents/redux/agent-definition/converters";

export type { AgentVersionHistoryItem };

type ThunkApi = { dispatch: ChatDispatch; state: ChatRootState };

/** Same generator-vs-table reconciliation as the snapshot row's shim. */
type AgentVersionHistoryItemDbProjection = Omit<
  AgentVersionHistoryItem,
  | "change_note"
  | "contract_change"
  | "contract_break_declared"
  | "input_contract_hash"
  | "output_contract_hash"
> & {
  change_note: string;
  contract_change: string;
  contract_break_declared: string;
  input_contract_hash: string;
  output_contract_hash: string;
};
type _Check_AgentVersionHistoryItem =
  AgentVersionHistoryItemDbProjection extends DbRpcRow<"agx_get_version_history">
    ? true
    : false;
declare const _agentVersionHistoryItem: _Check_AgentVersionHistoryItem;
true satisfies typeof _agentVersionHistoryItem;

// AgentVersionSnapshot interface + compile-time check now live in
// features/agents/types/agent-definition.types.ts

/**
 * Paginated version history for the agent editor's version panel.
 * Returns the list directly — not stored in Redux (ephemeral UI state).
 */
export const fetchAgentVersionHistory = createAsyncThunk<
  AgentVersionHistoryItem[],
  { agentId: string; limit?: number; offset?: number },
  ThunkApi
>(
  "agentDefinition/fetchVersionHistory",
  async ({ agentId, limit = 50, offset = 0 }) => {
    const { data, error } = await supabase.rpc("agx_get_version_history", {
      p_agent_id: agentId,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) throw pgErrorToError(error);

    return (data ?? []) as AgentVersionHistoryItem[];
  },
);

/**
 * Resolves an immutable agent-version UUID to its parent agent and numeric
 * version. Unlike version history, callers do not need to know the parent
 * agent first. RLS on agent.definition_version remains the authorization
 * boundary for this lookup.
 */
export const resolveAgentVersionId = createAsyncThunk<
  AgentVersionLookup | null,
  string,
  ThunkApi
>("agentDefinition/resolveVersionId", async (versionId) => {
  const { data, error } = await supabase
    .schema("agent")
    .from("definition_version")
    .select("id, agent_id, version_number, name")
    .eq("id", versionId)
    .maybeSingle();

  if (error) throw pgErrorToError(error);
  if (!data) return null;

  return {
    versionId: data.id,
    agentId: data.agent_id,
    versionNumber: data.version_number,
    agentName: data.name,
  };
});

/**
 * Fetches a full version snapshot for diff/preview.
 * Stores it in the agents map with isVersion = true, keyed by agx_version.id.
 * Same record shape — no special handling needed in selectors or UI.
 */
export const fetchAgentVersionSnapshot = createAsyncThunk<
  void,
  { agentId: string; version: number },
  ThunkApi
>(
  "agentDefinition/fetchVersionSnapshot",
  async ({ agentId, version }, { dispatch }) => {
    const { data, error } = await supabase.rpc("agx_get_version_snapshot", {
      p_agent_id: agentId,
      p_version_number: version,
    });

    if (error) throw pgErrorToError(error);

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return;
    const row = parseAgentVersionSnapshot(raw);

    dispatch(upsertAgent(versionSnapshotRowToAgentDefinition(agentId, row)));
  },
);
