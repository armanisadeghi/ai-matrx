"use client";

import { createSelector } from "@reduxjs/toolkit";
import type { ChatRootState } from "../../store/root-state";
import type { AgentSurfaceBinding } from "../services/bind-agent-to-surface.service";
import type { SurfaceValue } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue (surfacesCatalog)
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_SURFACE_VALUES: SurfaceValue[] = [];

const selectCatalog = (state: ChatRootState) => state.surfacesCatalog;

export const selectAllSurfaces = (state: ChatRootState) =>
  selectCatalog(state).list;

export const selectSurfacesLoaded = (state: ChatRootState) =>
  selectCatalog(state).listLoaded;

export const selectSurfacesStatus = (state: ChatRootState) =>
  selectCatalog(state).listStatus;

export const selectSurfacesError = (state: ChatRootState) =>
  selectCatalog(state).listError;

export const selectActiveSurfaces = createSelector(
  [selectAllSurfaces],
  (list) => list.filter((s) => s.is_active),
);

/** Plain selector: `createSelector(..., v => v ?? [])` tripped Reselect’s identity-function dev check when `v` is already an array from the slice. */
export const makeSelectSurfaceValues =
  (surfaceName: string) => (state: ChatRootState) =>
    selectCatalog(state).valuesBySurface[surfaceName] ?? EMPTY_SURFACE_VALUES;

export const makeSelectSurfaceValuesLoaded =
  (surfaceName: string) => (state: ChatRootState) =>
    Boolean(selectCatalog(state).valuesLoaded[surfaceName]);

export const makeSelectSurfaceValuesStatus =
  (surfaceName: string) => (state: ChatRootState) =>
    selectCatalog(state).valuesStatus[surfaceName] ?? "idle";

/** The surface-values read's failure message (null unless the last read failed). */
export const makeSelectSurfaceValuesError =
  (surfaceName: string) => (state: ChatRootState) =>
    selectCatalog(state).valuesError[surfaceName] ?? null;

// ─────────────────────────────────────────────────────────────────────────────
// Bindings (agentSurfaceBindings)
// ─────────────────────────────────────────────────────────────────────────────

const selectBindings = (state: ChatRootState) => state.agentSurfaceBindings;

export const selectBindingsById = (state: ChatRootState) =>
  selectBindings(state).byId;

export const selectBindingById = (state: ChatRootState, bindingId: string) =>
  selectBindings(state).byId[bindingId] ?? null;

export const makeSelectBindingsForAgent = (agentId: string) =>
  createSelector(
    [
      (state: ChatRootState) => selectBindings(state).idsByAgent[agentId],
      (state: ChatRootState) => selectBindings(state).byId,
    ],
    (ids, byId): AgentSurfaceBinding[] =>
      (ids ?? [])
        .map((id) => byId[id])
        .filter((b): b is AgentSurfaceBinding => !!b),
  );

export const makeSelectBindingsLoadedForAgent =
  (agentId: string) => (state: ChatRootState) =>
    Boolean(selectBindings(state).loadedByAgent[agentId]);

export const makeSelectBindingsStatusForAgent =
  (agentId: string) => (state: ChatRootState) =>
    selectBindings(state).statusByAgent[agentId] ?? "idle";

export const makeSelectBindingsErrorForAgent =
  (agentId: string) => (state: ChatRootState) =>
    selectBindings(state).errorByAgent[agentId] ?? null;
