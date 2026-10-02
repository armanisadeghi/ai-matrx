/**
 * Agent Apps — Redux Types
 *
 * The canonical app shape is the live `aga_apps` row; that type lives in
 * `features/agent-apps/types.ts` and is re-exported here so the slice and
 * its selectors stay in sync with the DB. The runtime cache record adds
 * dirty-field tracking, async-lifecycle flags, and an `_error` channel —
 * mirrors the agent-shortcuts slice convention.
 */

import type { AgentApp as AgentAppDb } from "@/features/agent-apps/types";
import type { FieldFlags } from "@ai-matrx/chat/agents/redux/shared/field-flags";

// Re-export the canonical DB-row type. Slice + selectors + thunks all use
// this shape so there is no aspirational/real divergence to reconcile.
export type AgentApp = AgentAppDb;

// ---------------------------------------------------------------------------
// Runtime records & slice state
// ---------------------------------------------------------------------------

export type AppFieldSnapshot = {
  [K in keyof AgentApp]?: AgentApp[K];
};

export type AppLoadedFields = FieldFlags<keyof AgentApp>;

export interface AgentAppRecord extends AgentApp {
  _dirty: boolean;
  _dirtyFields: FieldFlags<keyof AgentApp>;
  _fieldHistory: AppFieldSnapshot;
  _loadedFields: AppLoadedFields;
  _loading: boolean;
  _error: string | null;
}

export interface AgentAppSliceState {
  apps: Record<string, AgentAppRecord>;
  activeAppId: string | null;
  initialLoaded: boolean;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}
