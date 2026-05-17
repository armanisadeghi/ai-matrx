"use client";

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { AgentSurfaceBinding } from "@/features/surfaces/services/agent-surface-bindings.service";
import type { SurfaceValue } from "@/features/surfaces/types";

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue (surfacesCatalog)
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_SURFACE_VALUES: SurfaceValue[] = [];

const selectCatalog = (state: RootState) => state.surfacesCatalog;

export const selectAllSurfaces = (state: RootState) =>
  selectCatalog(state).list;

export const selectSurfacesLoaded = (state: RootState) =>
  selectCatalog(state).listLoaded;

export const selectSurfacesStatus = (state: RootState) =>
  selectCatalog(state).listStatus;

export const selectSurfacesError = (state: RootState) =>
  selectCatalog(state).listError;

export const selectActiveSurfaces = createSelector(
  [selectAllSurfaces],
  (list) => list.filter((s) => s.is_active),
);

/** Plain selector: `createSelector(..., v => v ?? [])` tripped Reselect’s identity-function dev check when `v` is already an array from the slice. */
export const makeSelectSurfaceValues =
  (surfaceName: string) => (state: RootState) =>
    selectCatalog(state).valuesBySurface[surfaceName] ?? EMPTY_SURFACE_VALUES;

export const makeSelectSurfaceValuesLoaded =
  (surfaceName: string) => (state: RootState) =>
    Boolean(selectCatalog(state).valuesLoaded[surfaceName]);

export const makeSelectSurfaceValuesStatus =
  (surfaceName: string) => (state: RootState) =>
    selectCatalog(state).valuesStatus[surfaceName] ?? "idle";

// ─────────────────────────────────────────────────────────────────────────────
// Bindings (agentSurfaceBindings)
// ─────────────────────────────────────────────────────────────────────────────

const selectBindings = (state: RootState) => state.agentSurfaceBindings;

export const selectBindingsById = (state: RootState) =>
  selectBindings(state).byId;

export const selectBindingById = (state: RootState, bindingId: string) =>
  selectBindings(state).byId[bindingId] ?? null;

export const makeSelectBindingsForAgent = (agentId: string) =>
  createSelector(
    [
      (state: RootState) => selectBindings(state).idsByAgent[agentId],
      (state: RootState) => selectBindings(state).byId,
    ],
    (ids, byId): AgentSurfaceBinding[] =>
      (ids ?? [])
        .map((id) => byId[id])
        .filter((b): b is AgentSurfaceBinding => !!b),
  );

export const makeSelectBindingsLoadedForAgent =
  (agentId: string) => (state: RootState) =>
    Boolean(selectBindings(state).loadedByAgent[agentId]);

export const makeSelectBindingsStatusForAgent =
  (agentId: string) => (state: RootState) =>
    selectBindings(state).statusByAgent[agentId] ?? "idle";

export const makeSelectBindingsErrorForAgent =
  (agentId: string) => (state: RootState) =>
    selectBindings(state).errorByAgent[agentId] ?? null;
