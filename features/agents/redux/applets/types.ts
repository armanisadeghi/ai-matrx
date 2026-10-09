/**
 * Applets — Redux Types
 *
 * The canonical app shape is the live `aga_apps` row; that type lives in
 * `features/applets/types.ts` and is re-exported here so the slice and
 * its selectors stay in sync with the DB. The runtime cache record adds
 * dirty-field tracking, async-lifecycle flags, and an `_error` channel —
 * mirrors the agent-shortcuts slice convention.
 */

import type { AppletRow as AppletDb } from "@/features/applets/types";
import type { FieldFlags } from "@ai-matrx/agents/field-flags";

// Re-export the canonical DB-row type. Slice + selectors + thunks all use
// this shape so there is no aspirational/real divergence to reconcile.
export type AppletRow = AppletDb;

// ---------------------------------------------------------------------------
// Runtime records & slice state
// ---------------------------------------------------------------------------

export type AppFieldSnapshot = {
  [K in keyof AppletRow]?: AppletRow[K];
};

export type AppLoadedFields = FieldFlags<keyof AppletRow>;

export interface AppletDefinition extends AppletRow {
  _dirty: boolean;
  _dirtyFields: FieldFlags<keyof AppletRow>;
  _fieldHistory: AppFieldSnapshot;
  _loadedFields: AppLoadedFields;
  _loading: boolean;
  _error: string | null;
}

export interface AppletSliceState {
  apps: Record<string, AppletDefinition>;
  activeAppId: string | null;
  initialLoaded: boolean;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}
