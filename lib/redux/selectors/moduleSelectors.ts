import { createSelector } from "@reduxjs/toolkit";
import { ModuleName, BaseModuleSchema } from "../dynamic/moduleSchema";
import type { RootState } from "@/lib/redux/store";

export const createModuleSelectors = <
  C,
  U,
  D,
  T extends BaseModuleSchema<C, U, D>,
>(
  moduleName: ModuleName,
) => {
  const getModuleState = (state: RootState): T => state[moduleName] as T;

  const getInitiated = createSelector(
    [getModuleState],
    (state) => state.initiated,
  );
  const getData = createSelector([getModuleState], (state) => state.data);
  const getConfigs = createSelector([getModuleState], (state) => state.configs);
  const getUserPreferences = createSelector(
    [getModuleState],
    (state) => state.userPreferences,
  );
  const getLoading = createSelector([getModuleState], (state) => state.loading);
  const getError = createSelector([getModuleState], (state) => state.error);
  const getStaleTime = createSelector(
    [getModuleState],
    (state) => state.staleTime,
  );

  const getOneData = <K extends keyof D>(key: K) =>
    createSelector([getData], (data) => data[key]);

  const getOneConfig = <K extends keyof C>(key: K) =>
    createSelector([getConfigs], (configs) => configs[key]);

  const getOneUserPreference = <K extends keyof U>(key: K) =>
    createSelector(
      [getUserPreferences],
      (userPreferences) => userPreferences[key],
    );

  return {
    getModuleState,
    getInitiated,
    getData,
    getConfigs,
    getUserPreferences,
    getLoading,
    getError,
    getStaleTime,
    getOneData,
    getOneConfig,
    getOneUserPreference,
  };
};

export type ModuleSelectors<
  C,
  U,
  D,
  T extends BaseModuleSchema<C, U, D>,
> = ReturnType<typeof createModuleSelectors<C, U, D, T>>;
