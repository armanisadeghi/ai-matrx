// lib/redux/slices/userMarkdownSamples/selectors.ts

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { UserMarkdownSample } from "@/components/markdown-studio/user-samples-service";

const selectSlice = (state: RootState) =>
  (state as RootState & {
    userMarkdownSamples: import("./slice").UserMarkdownSamplesState;
  }).userMarkdownSamples;

export const selectUserMarkdownSamplesById = (state: RootState) =>
  selectSlice(state).byId;

export const selectUserMarkdownSampleIds = (state: RootState) =>
  selectSlice(state).allIds;

export const selectUserMarkdownSamplesListStatus = (state: RootState) =>
  selectSlice(state).listStatus;

export const selectUserMarkdownSamplesListError = (state: RootState) =>
  selectSlice(state).listError;

export const selectUserMarkdownSamplesList = createSelector(
  [selectUserMarkdownSamplesById, selectUserMarkdownSampleIds],
  (byId, ids): UserMarkdownSample[] =>
    ids.map((id) => byId[id]).filter(Boolean),
);

export const selectUserMarkdownSampleById = (state: RootState, id: string) =>
  selectSlice(state).byId[id];
