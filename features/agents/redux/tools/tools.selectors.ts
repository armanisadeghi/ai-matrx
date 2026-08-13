import type { RootState } from "@/lib/redux/store";
import { createSelector } from "@reduxjs/toolkit";

export const selectAllTools = (state: RootState) => state.tools.tools;
export const selectToolsStatus = (state: RootState) => state.tools.status;
export const selectToolsError = (state: RootState) => state.tools.error;
export const selectToolsReady = (state: RootState) =>
  state.tools.status === "succeeded";
export const selectToolIdentityMap = (state: RootState) =>
  state.tools.identityById;

/** Factory because many references can resolve different tool IDs at once. */
export const makeSelectToolById = () =>
  createSelector(
    [
      (state: RootState) => state.tools.tools,
      (state: RootState) => state.tools.identityById,
      (_state: RootState, toolId: string) => toolId,
    ],
    (tools, identityById, toolId) =>
      tools.find((tool) => tool.id === toolId) ?? identityById[toolId],
  );

export const selectToolLookupStatus = (state: RootState, toolId: string) =>
  state.tools.lookupStatusById[toolId] ?? "idle";
