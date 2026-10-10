/**
 * THE AUTOMATIC-TOOLS SWITCH — "Allow automated tool injection" on an agent.
 *
 * Kept apart from builder-tier.thunks.ts so the model-change watcher
 * (sagas/modelToolDefault.saga.ts, forked from the shell's root saga) reaches
 * only package modules — never the builder's write graph (code-splitting
 * rule 6). Rules: common-docs systems/agents/agent-tools/TOOL-SOURCES.md
 * rule A; a model's only tool fact is whether it accepts tools.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { pgErrorToError } from "@ai-matrx/data";
import { writeOneRow } from "@ai-matrx/data/db";
import { supabase } from "@ai-matrx/chat/host/db";
import type { Database } from "@ai-matrx/chat/host/db-types";
import type {
  ChatDispatch,
  ChatRootState,
} from "@ai-matrx/chat/store/root-state";
import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  mergePartialAgent,
  setAgentError,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import { agentNameTakenError } from "@ai-matrx/chat/agents/redux/agent-definition/agentNameTaken";
import { isSyntheticAgentId } from "@ai-matrx/chat/agents/redux/agent-definition/synthetic-id";
import { selectModelById } from "@ai-matrx/agents/models";
import {
  getModelRecords,
  readModelRecords,
} from "@ai-matrx/chat/agents/identity/model-catalog";
import {
  resolveModelControls,
  supportsTools,
} from "@ai-matrx/chat/agents/hooks/useModelControls";

type ThunkApi = { dispatch: ChatDispatch; state: ChatRootState };

/**
 * Who last set the agent's automatic-tools switch, kept beside it in
 * `tool_config` so a model change knows whether it may move the switch.
 *   - "model"    — turned off because the agent's model cannot use tools; a
 *                  later move to a model that can turns it back on.
 *   - "override" — the person turned it on while the model could not use
 *                  tools; model changes never move it again.
 *   - absent     — the person's own choice (or the plain default).
 * The server reads only `auto_tools_disabled`; this key is builder bookkeeping.
 */
export const AUTO_TOOLS_SET_BY_KEY = "auto_tools_set_by";
export type AutoToolsSetBy = "model" | "override" | undefined;

function readAutoToolsSetBy(config: Record<string, unknown>): AutoToolsSetBy {
  const value = config[AUTO_TOOLS_SET_BY_KEY];
  return value === "model" || value === "override" ? value : undefined;
}

function toolConfigObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

/**
 * Whether a model accepts tools — its catalog `tools` control, the same
 * reading the server's L2 layer uses. `undefined` while the model's full
 * record cannot be read (never guess a default from a missing record).
 */
export async function modelAcceptsTools(
  modelId: string | null | undefined,
): Promise<boolean | undefined> {
  if (!modelId) return undefined;
  await getModelRecords().loadModel(modelId);
  const model = selectModelById(readModelRecords(), modelId);
  if (!model || model._fetchType !== "full") return undefined;
  const { normalizedControls } = resolveModelControls([model], modelId);
  return supportsTools(normalizedControls);
}

/**
 * The automatic-tools default a model change applies, or `null` to leave the
 * switch alone. Off for a model that cannot use tools; back on when the model
 * can again and the model (not the person) had turned it off. A person's
 * override is never moved.
 */
export function decideModelToolDefault(
  current: { disabled: boolean; setBy: AutoToolsSetBy },
  acceptsTools: boolean,
): { disabled: boolean; setBy: AutoToolsSetBy } | null {
  if (current.setBy === "override") return null;
  if (!acceptsTools && !current.disabled) {
    return { disabled: true, setBy: "model" };
  }
  if (acceptsTools && current.disabled && current.setBy === "model") {
    return { disabled: false, setBy: undefined };
  }
  return null;
}

/**
 * Toggles the agent's `auto_tools_disabled` kill switch — the inverse of the
 * Builder's "Allow automated tool injection" switch.
 *
 * Persists into `agent.definition.tool_config.auto_tools_disabled` via a
 * read-merge-write so sibling tool_config keys (`excluded_tools`) are never
 * clobbered. Strips the dead `tools` key if present — tool assignment lives
 * on `agent.definition.tools` / `custom_tools`, never in tool_config. The
 * server reads this flag from tool_config (agx_manager.py); there is no
 * dedicated column, so a targeted merge is the correct write. Optimistic via
 * mergePartialAgent (does NOT mark dirty); reverted on failure.
 *
 * `source: "model"` is the model-change default (applyModelToolDefault);
 * the person's own toggle is the default source. Turning it ON while the
 * model cannot use tools is recorded as the person's override.
 */
export const setAgentAutoToolsDisabled = createAsyncThunk<
  void,
  { agentId: string; disabled: boolean; source?: "person" | "model" },
  ThunkApi
>(
  "agentDefinition/setAutoToolsDisabled",
  async ({ agentId, disabled, source = "person" }, { dispatch, getState }) => {
    const previous =
      selectAgentById(getState(), agentId)?.autoToolsDisabled ?? false;

    // Optimistic — value updates immediately without being marked dirty.
    dispatch(mergePartialAgent({ id: agentId, autoToolsDisabled: disabled }));

    // Synthetic comparison/variation agents live only in Redux — never persist.
    if (isSyntheticAgentId(agentId)) return;

    let setBy: AutoToolsSetBy;
    if (source === "model") {
      setBy = disabled ? "model" : undefined;
    } else if (!disabled) {
      const modelId = selectAgentById(getState(), agentId)?.modelId;
      setBy =
        (await modelAcceptsTools(modelId)) === false ? "override" : undefined;
    }

    const { data: current, error: readError } = await supabase
      .schema("agent")
      .from("definition")
      .select("tool_config")
      .eq("id", agentId)
      .single();

    if (readError) {
      dispatch(mergePartialAgent({ id: agentId, autoToolsDisabled: previous }));
      dispatch(setAgentError({ id: agentId, error: readError.message }));
      throw pgErrorToError(readError);
    }

    const existingConfig = toolConfigObject(current?.tool_config);
    // Dead key — never re-persist; assignment is agent.definition.tools.
    delete existingConfig.tools;
    delete existingConfig[AUTO_TOOLS_SET_BY_KEY];

    const { data, error } = await writeOneRow(
      supabase
        .schema("agent")
        .from("definition")
        .update({
          tool_config: {
            ...existingConfig,
            auto_tools_disabled: disabled,
            ...(setBy ? { [AUTO_TOOLS_SET_BY_KEY]: setBy } : {}),
          } as Database["agent"]["Tables"]["definition"]["Update"]["tool_config"],
        })
        .eq("id", agentId)
        .select("version, updated_at, follows_source"),
      { action: "update", noun: "definition" },
    );

    if (error) {
      dispatch(mergePartialAgent({ id: agentId, autoToolsDisabled: previous }));
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw agentNameTakenError(error) ?? pgErrorToError(error);
    }

    if (data) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          version: data.version,
          updatedAt: data.updated_at,
          // An edit to what a following copy follows turns it off in the database.
          followsSource: data.follows_source,
        }),
      );
    }
  },
);

/**
 * Applies the model's automatic-tools default after the agent's model changes
 * (decideModelToolDefault). Reads the switch and who set it from the row, so
 * a person's override is never moved. A model whose record cannot be read
 * leaves the switch alone.
 */
export const applyModelToolDefault = createAsyncThunk<
  void,
  { agentId: string },
  ThunkApi
>(
  "agentDefinition/applyModelToolDefault",
  async ({ agentId }, { dispatch, getState }) => {
    if (isSyntheticAgentId(agentId)) return;
    const agent = selectAgentById(getState(), agentId);
    if (!agent?.modelId) return;
    const acceptsTools = await modelAcceptsTools(agent.modelId);
    if (acceptsTools === undefined) return;

    const { data: current, error } = await supabase
      .schema("agent")
      .from("definition")
      .select("tool_config")
      .eq("id", agentId)
      .single();
    if (error) throw pgErrorToError(error);

    const config = toolConfigObject(current?.tool_config);
    const next = decideModelToolDefault(
      {
        disabled: config.auto_tools_disabled === true,
        setBy: readAutoToolsSetBy(config),
      },
      acceptsTools,
    );
    if (!next) return;
    await dispatch(
      setAgentAutoToolsDisabled({
        agentId,
        disabled: next.disabled,
        source: "model",
      }),
    ).unwrap();
  },
);
