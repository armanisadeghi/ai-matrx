"use client";

import { createSelector } from "reselect";
import { isPubliclyVisible } from "@/lib/visibility/labels";
import type { RootState } from "@/lib/redux/store";
import type { AgentApp, AgentAppRecord } from "./types";
import type { FieldFlags } from "../shared/field-flags";
import { hasField } from "../shared/field-flags";

// ---------------------------------------------------------------------------
// Slice root
// ---------------------------------------------------------------------------

const selectAgentAppSlice = (state: RootState) => state.agentApp;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const selectAllApps = createSelector(
  [selectAgentAppSlice],
  (slice) => slice.apps,
);

export const selectActiveAppId = createSelector(
  [selectAgentAppSlice],
  (slice) => slice.activeAppId,
);

export const selectAppsInitialLoaded = createSelector(
  [selectAgentAppSlice],
  (slice) => slice.initialLoaded,
);

export const selectAppsStatus = createSelector(
  [selectAgentAppSlice],
  (slice) => slice.status,
);

export const selectAppsError = createSelector(
  [selectAgentAppSlice],
  (slice) => slice.error,
);

// ---------------------------------------------------------------------------
// Per-record
// ---------------------------------------------------------------------------

export const selectAppById = createSelector(
  [selectAllApps, (_state: RootState, id: string) => id],
  (apps, id): AgentAppRecord | undefined => apps[id],
);

export const selectAppDefinition = createSelector(
  [selectAppById],
  (record): AgentApp | undefined => {
    if (!record) return undefined;
    const {
      _dirty,
      _dirtyFields,
      _fieldHistory,
      _loadedFields,
      _loading,
      _error,
      ...definition
    } = record;
    return definition;
  },
);

export const selectAppName = createSelector(
  [selectAppById],
  (record): string | null => record?.name ?? null,
);

export const selectAppAgentId = createSelector(
  [selectAppById],
  (record): string | null => record?.agent_id ?? null,
);

export const selectAppSlug = createSelector(
  [selectAppById],
  (record): string | null => record?.slug ?? null,
);

export const selectAppStatus = createSelector(
  [selectAppById],
  (record): AgentApp["status"] | null => record?.status ?? null,
);

export const selectAppIsDirty = createSelector(
  [selectAppById],
  (record): boolean => record?._dirty ?? false,
);

export const selectAppDirtyFields = createSelector(
  [selectAppById],
  (record): FieldFlags<keyof AgentApp> | undefined => record?._dirtyFields,
);

export const selectAppLoadedFields = createSelector(
  [selectAppById],
  (record): FieldFlags<keyof AgentApp> | undefined => record?._loadedFields,
);

export const selectAppFieldIsLoaded = createSelector(
  [
    selectAppById,
    (_state: RootState, _id: string, field: keyof AgentApp) => field,
  ],
  (record, field): boolean =>
    record ? hasField(record._loadedFields, field) : false,
);

export const selectAppIsLoading = createSelector(
  [selectAppById],
  (record): boolean => record?._loading ?? false,
);

export const selectAppError = createSelector(
  [selectAppById],
  (record): string | null => record?._error ?? null,
);

export const selectAppIsPublished = createSelector(
  [selectAppById],
  (record): boolean => record?.status === "published",
);

export const selectAppIsPublic = createSelector(
  [selectAppById],
  (record): boolean => isPubliclyVisible(record?.visibility),
);

// ---------------------------------------------------------------------------
// Active (convenience)
// ---------------------------------------------------------------------------

export const selectActiveApp = createSelector(
  [selectAllApps, selectActiveAppId],
  (apps, id) => (id ? apps[id] : undefined),
);
