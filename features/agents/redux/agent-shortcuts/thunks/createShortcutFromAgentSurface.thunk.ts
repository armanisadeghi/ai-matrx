"use client";

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { AgentShortcut } from "../types";
import { fetchFullShortcut } from "../thunks";
import type { Database } from "@/types/database.types";
import type { ValueMappingMap } from "@/features/surfaces/types";

/**
 * Whitelist of `agx_shortcut` columns the RPC accepts in its `p_overrides`
 * jsonb. Mirrors the contract in
 * [docs/agx_shortcut_surface_changes.md](../../../../../../docs/agx_shortcut_surface_changes.md).
 *
 * Kept distinct from `AgentShortcut` (camelCase, frontend shape) because
 * the RPC reads snake_case column names directly out of the jsonb.
 */
export interface CreateShortcutFromAgentSurfaceOverrides {
  label?: string;
  description?: string | null;
  icon_name?: string | null;
  value_mappings?: ValueMappingMap | null;
  keyboard_shortcut?: string | null;
  display_mode?: AgentShortcut["displayMode"];
  allow_chat?: boolean;
  auto_run?: boolean;
  show_variable_panel?: boolean;
  variables_panel_style?: AgentShortcut["variablesPanelStyle"];
  show_definition_messages?: boolean;
  show_definition_message_content?: boolean;
  hide_reasoning?: boolean;
  hide_tool_results?: boolean;
  show_pre_execution_gate?: boolean;
  pre_execution_message?: string | null;
  bypass_gate_seconds?: number;
  default_user_input?: string | null;
  default_variables?: Record<string, unknown> | null;
  context_overrides?: Record<string, unknown> | null;
  llm_overrides?: Record<string, unknown> | null;
  response_density?: AgentShortcut["responseDensity"];
  json_extraction?: AgentShortcut["jsonExtraction"];
  enabled_features?: AgentShortcut["enabledFeatures"];
  use_latest?: boolean;
  agent_version_id?: string | null;
}

export interface CreateShortcutFromAgentSurfaceArgs {
  agentSurfaceId: string;
  categoryId: string;
  userId?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  overrides?: CreateShortcutFromAgentSurfaceOverrides;
}

type RpcArgs =
  Database["public"]["Functions"]["create_shortcut_from_agent_surface"]["Args"];

/**
 * Seeds a new `agx_shortcut` from an existing `agx_agent_surface` row via
 * the `create_shortcut_from_agent_surface` RPC. Copies the surface's
 * `value_mappings` + `surface_name`, defaults `label` to the agent's name,
 * and applies any overrides the caller passes.
 *
 * Loads the new shortcut into the slice before returning so subsequent
 * navigation to the edit page finds it already in Redux.
 */
export const createShortcutFromAgentSurface = createAsyncThunk<
  string,
  CreateShortcutFromAgentSurfaceArgs,
  { dispatch: AppDispatch; state: RootState }
>(
  "agentShortcut/createFromAgentSurface",
  async (args, { dispatch }) => {
    // Postgres reads missing params as null. The generated `Args` type marks
    // the scope fields as optional `string`, so we omit any that the caller
    // didn't set rather than passing literal nulls.
    const rpcArgs: RpcArgs = {
      p_agent_surface_id: args.agentSurfaceId,
      p_category_id: args.categoryId,
      p_overrides: (args.overrides ?? {}) as unknown as RpcArgs["p_overrides"],
      ...(args.userId ? { p_user_id: args.userId } : {}),
      ...(args.organizationId
        ? { p_organization_id: args.organizationId }
        : {}),
      ...(args.projectId ? { p_project_id: args.projectId } : {}),
      ...(args.taskId ? { p_task_id: args.taskId } : {}),
    };

    const { data, error } = await supabase.rpc(
      "create_shortcut_from_agent_surface",
      rpcArgs,
    );

    if (error) throw pgErrorToError(error);

    const newShortcutId = data as string;
    await dispatch(fetchFullShortcut(newShortcutId));
    return newShortcutId;
  },
);
