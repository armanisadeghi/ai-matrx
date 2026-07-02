// lib/redux/featureSelectors.ts

import { createSelector } from "reselect";
import type { FeatureName, SliceState } from "@/types/reduxTypes";
import * as z from "zod";

export const createFeatureSelectors = <T extends z.ZodTypeAny>(
  featureName: FeatureName,
) => {
  type FeatureType = z.infer<T>;

  const getFeatureState = (
    state: Record<string, unknown>,
  ): SliceState<FeatureType> => state[featureName] as SliceState<FeatureType>;

  const getItems = createSelector([getFeatureState], (state) => state.items);

  const getAllIdAndNames = createSelector(
    [getFeatureState],
    (state) => state.allIdAndNames,
  );
  const getTotalCount = createSelector(
    [getFeatureState],
    (state) => state.totalCount,
  );
  const getLoading = createSelector(
    [getFeatureState],
    (state) => state.loading,
  );
  const getError = createSelector([getFeatureState], (state) => state.error);
  const getLastFetched = createSelector(
    [getFeatureState],
    (state) => state.lastFetched,
  );
  const getStaleTime = createSelector(
    [getFeatureState],
    (state) => state.staleTime,
  );
  const getBackups = createSelector(
    [getFeatureState],
    (state) => state.backups,
  );

  const getOne = createSelector(
    [getItems, (_state: Record<string, unknown>, id: string) => id],
    (items, id): FeatureType | undefined => items[id],
  );

  const isItemStale = createSelector(
    [
      getLastFetched,
      getStaleTime,
      (_state: Record<string, unknown>, id: string) => id,
    ],
    (lastFetched, staleTime, id): boolean => {
      const fetchTime = lastFetched[id];
      return !fetchTime || Date.now() - fetchTime > staleTime;
    },
  );

  return {
    getItems,
    getAllIdAndNames,
    getTotalCount,
    getLoading,
    getError,
    getLastFetched,
    getStaleTime,
    getBackups,
    getOne,
    isItemStale,
  };
};
