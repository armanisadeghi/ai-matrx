"use client";

import { createSelector } from "reselect";
import type { RootState } from "@/lib/redux/store";
import type { AppletRow, AppletDefinition } from "./types";
import type { FieldFlags } from "@ai-matrx/agents/field-flags";
import { hasField } from "@ai-matrx/agents/field-flags";

// ---------------------------------------------------------------------------
// Slice root
// ---------------------------------------------------------------------------

const selectAppletSlice = (state: RootState) => state.applet;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const selectAllApps = createSelector(
  [selectAppletSlice],
  (slice) => slice.apps,
);

export const selectActiveAppId = createSelector(
  [selectAppletSlice],
  (slice) => slice.activeAppId,
);

export const selectAppsInitialLoaded = createSelector(
  [selectAppletSlice],
  (slice) => slice.initialLoaded,
);

export const selectAppsStatus = createSelector(
  [selectAppletSlice],
  (slice) => slice.status,
);

export const selectAppsError = createSelector(
  [selectAppletSlice],
  (slice) => slice.error,
);

// ---------------------------------------------------------------------------
// Per-record
// ---------------------------------------------------------------------------

export const selectAppById = createSelector(
  [selectAllApps, (_state: RootState, id: string) => id],
  (apps, id): AppletDefinition | undefined => apps[id],
);

export const selectAppDefinition = createSelector(
  [selectAppById],
  (record): AppletRow | undefined => {
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

export const selectAppSlug = createSelector(
  [selectAppById],
  (record): string | null => record?.slug ?? null,
);

export const selectAppStatus = createSelector(
  [selectAppById],
  (record): AppletRow["status"] | null => record?.status ?? null,
);

export const selectAppIsDirty = createSelector(
  [selectAppById],
  (record): boolean => record?._dirty ?? false,
);

export const selectAppDirtyFields = createSelector(
  [selectAppById],
  (record): FieldFlags<keyof AppletRow> | undefined => record?._dirtyFields,
);

export const selectAppLoadedFields = createSelector(
  [selectAppById],
  (record): FieldFlags<keyof AppletRow> | undefined => record?._loadedFields,
);

export const selectAppFieldIsLoaded = createSelector(
  [
    selectAppById,
    (_state: RootState, _id: string, field: keyof AppletRow) => field,
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
  (record): boolean => record?.published_to_web === true,
);

// ---------------------------------------------------------------------------
// Active (convenience)
// ---------------------------------------------------------------------------

export const selectActiveApp = createSelector(
  [selectAllApps, selectActiveAppId],
  (apps, id) => (id ? apps[id] : undefined),
);
