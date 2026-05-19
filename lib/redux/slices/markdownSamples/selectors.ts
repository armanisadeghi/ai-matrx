// lib/redux/slices/markdownSamples/selectors.ts
// Memoized selectors for the admin Markdown Tester samples slice.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { MarkdownSample } from "@/components/admin/markdown-tester/samples-service";

const selectSlice = (state: RootState) =>
  (state as RootState & { markdownSamples: import("./slice").MarkdownSamplesState })
    .markdownSamples;

export const selectMarkdownSamplesById = (state: RootState) =>
  selectSlice(state).byId;

export const selectMarkdownSampleIds = (state: RootState) =>
  selectSlice(state).allIds;

export const selectMarkdownSamplesListStatus = (state: RootState) =>
  selectSlice(state).listStatus;

export const selectMarkdownSamplesListError = (state: RootState) =>
  selectSlice(state).listError;

export const selectMarkdownSamplesMutatingIds = (state: RootState) =>
  selectSlice(state).mutatingIds;

export const selectMarkdownSamplesList = createSelector(
  [selectMarkdownSamplesById, selectMarkdownSampleIds],
  (byId, ids): MarkdownSample[] => ids.map((id) => byId[id]).filter(Boolean),
);

export const makeSelectMarkdownSampleById = () =>
  createSelector(
    [selectMarkdownSamplesById, (_state: RootState, id: string) => id],
    (byId, id): MarkdownSample | undefined => byId[id],
  );

export const selectMarkdownSampleById = (state: RootState, id: string) =>
  selectSlice(state).byId[id];

export const selectMarkdownSampleIsMutating = (state: RootState, id: string) =>
  selectSlice(state).mutatingIds.includes(id);
