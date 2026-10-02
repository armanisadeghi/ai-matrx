import type { ChatRootState } from "../../../store/root-state";
import { createSelector } from "@reduxjs/toolkit";

export const selectAllTools = (state: ChatRootState) => state.tools.tools;
export const selectToolsStatus = (state: ChatRootState) => state.tools.status;
export const selectToolsError = (state: ChatRootState) => state.tools.error;
export const selectToolsReady = (state: ChatRootState) =>
  state.tools.status === "succeeded";
export const selectToolIdentityMap = (state: ChatRootState) =>
  state.tools.identityById;

/** Factory because many references can resolve different tool IDs at once. */
export const makeSelectToolById = () =>
  createSelector(
    [
      (state: ChatRootState) => state.tools.tools,
      (state: ChatRootState) => state.tools.identityById,
      (_state: ChatRootState, toolId: string) => toolId,
    ],
    (tools, identityById, toolId) =>
      tools.find((tool) => tool.id === toolId) ?? identityById[toolId],
  );

export const selectToolLookupStatus = (state: ChatRootState, toolId: string) =>
  state.tools.lookupStatusById[toolId] ?? "idle";
