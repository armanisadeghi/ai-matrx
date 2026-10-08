/**
 * What a Model-battle column is called.
 *
 * A column is named after the model it runs, read live — never a stored copy
 * of that name. The stored copy went stale whenever the model list had not
 * loaded the picked model yet, and the column then read "Model 3" above a
 * GPT-6 Astra answer. Only a name the person typed (`labelCustom`) is kept.
 */

import { readModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";
import type { RootState } from "@/lib/redux/store";
import type { ModelColumn } from "./types";

function modelName(state: RootState, modelId: string | null): string | null {
  if (!modelId) return null;
  const row =
    readModelRecords().entities[modelId] ??
    readModelRecords().identityById[modelId];
  const name = row?.common_name || row?.name;
  return name ? String(name) : null;
}

/** The model a column runs: its own pick, else the agent's model. */
export function columnModelId(
  state: RootState,
  conversationId: string,
): string | null {
  const entry =
    state.instanceModelOverrides?.byConversationId?.[conversationId];
  const picked = entry?.overrides?.model;
  if (typeof picked === "string" && picked) return picked;
  const base = entry?.baseSettings?.model;
  return typeof base === "string" && base ? base : null;
}

export function selectModelColumnTitle(
  state: RootState,
  column: Pick<ModelColumn, "conversationId" | "label" | "labelCustom">,
): string {
  if (column.labelCustom && column.label.trim()) return column.label;
  return (
    modelName(state, columnModelId(state, column.conversationId)) ??
    column.label
  );
}
