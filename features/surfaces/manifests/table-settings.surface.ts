/**
 * Names and scope builder of `table-settings`, kept apart from the manifest body so
 * eagerly loaded features can import them without pulling the manifest
 * (descriptions, write targets) into the shell's first-load JS.
 */
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";

export const TABLE_SETTINGS_SURFACE_NAME = "matrx-user/table-settings";

/** Type-safe payload for the panel's own values (records-ui `settingsAgent`, `recordsAgentPorts.tsx`). */
export function createTableSettingsScope(values: {
  has_unsaved_changes: boolean;
  table_details_draft: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

/** Type-safe payload for the row actions' values (records-ui `RowActionsSection`, through the same port). */
export function createTableSettingsRowActionsScope(values: {
  saved_row_actions?: unknown[];
  editing_row_action?: Record<string, unknown>;
  editing_row_action_problems?: string[];
  formula_language?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
