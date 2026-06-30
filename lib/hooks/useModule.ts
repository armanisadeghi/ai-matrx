import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { createModuleSelectors } from "@/lib/redux/selectors/moduleSelectors";
import { ModuleName, ModuleSchema } from "@/lib/redux/dynamic/moduleSchema";
import {
  ModuleActions,
  createModuleSlice,
} from "@/lib/redux/slices/moduleSliceCreator";

export const createUseModuleHook = <T extends ModuleSchema>(
  moduleName: ModuleName,
  moduleInitialState: T,
) => {
  const selectors = createModuleSelectors<
    T["configs"],
    T["userPreferences"],
    T["data"],
    T
  >(moduleName);
  const { actions } = createModuleSlice(moduleName, moduleInitialState);

  return () => {
    const dispatch = useAppDispatch();

    const moduleState = useAppSelector(
      (state) => state[moduleName as keyof typeof state],
    ) as unknown as T | undefined;

    useEffect(() => {
      if (!moduleState || !moduleState.initiated) {
        console.log(`Initializing module: ${moduleName}`);
        dispatch(actions.initializeModule(moduleInitialState));
        dispatch(actions.setInitiated(true));
      }
    }, [dispatch, moduleState]);

    const initiated = useAppSelector(selectors.getInitiated);
    const data = useAppSelector(selectors.getData);
    const configs = useAppSelector(selectors.getConfigs);
    const userPreferences = useAppSelector(selectors.getUserPreferences);
    const loading = useAppSelector(selectors.getLoading);
    const error = useAppSelector(selectors.getError);
    const staleTime = useAppSelector(selectors.getStaleTime);

    const setInitiated = useCallback(
      (value: boolean) => dispatch(actions.setInitiated(value)),
      [dispatch],
    );
    const setLoading = useCallback(
      (value: boolean) => dispatch(actions.setLoading(value)),
      [dispatch],
    );
    const setError = useCallback(
      (value: string | null) => dispatch(actions.setError(value)),
      [dispatch],
    );
    const setData = useCallback(
      (value: T["data"]) => dispatch(actions.setData(value)),
      [dispatch],
    );
    const setConfigs = useCallback(
      (value: T["configs"]) => dispatch(actions.setConfigs(value)),
      [dispatch],
    );
    const setUserPreferences = useCallback(
      (value: T["userPreferences"]) =>
        dispatch(actions.setUserPreferences(value)),
      [dispatch],
    );
    const resetState = useCallback(
      () => dispatch(actions.resetState()),
      [dispatch],
    );
    const markDataStale = useCallback(
      () => dispatch(actions.markDataStale()),
      [dispatch],
    );
    const updateData = useCallback(
      (value: Partial<T["data"]>) => dispatch(actions.updateData(value)),
      [dispatch],
    );
    const updateConfigs = useCallback(
      (value: Partial<T["configs"]>) => dispatch(actions.updateConfigs(value)),
      [dispatch],
    );
    const updateUserPreferences = useCallback(
      (value: Partial<T["userPreferences"]>) =>
        dispatch(actions.updateUserPreferences(value)),
      [dispatch],
    );

    // Utility functions
    const getOneData = useCallback(
      <K extends keyof T["data"]>(key: K) =>
        useAppSelector(selectors.getOneData(key)),
      [],
    );

    const setOneData = useCallback(
      <K extends keyof T["data"]>(key: K, value: T["data"][K]) => {
        dispatch(
          actions.updateData({ [key]: value } as unknown as Partial<T["data"]>),
        );
      },
      [dispatch],
    );

    const addOneData = useCallback(
      <K extends string, V>(key: K, value: V) => {
        dispatch(
          actions.updateData({ [key]: value } as unknown as Partial<T["data"]>),
        );
      },
      [dispatch],
    );

    // Utility functions for `configs`
    const getOneConfig = useCallback(
      <K extends keyof T["configs"]>(key: K) =>
        useAppSelector(selectors.getOneConfig(key)),
      [],
    );
    const setOneConfig = useCallback(
      <K extends keyof T["configs"]>(key: K, value: T["configs"][K]) => {
        dispatch(
          actions.updateConfigs({ [key]: value } as unknown as Partial<
            T["configs"]
          >),
        );
      },
      [dispatch],
    );
    const addOneConfig = useCallback(
      <K extends string, V>(key: K, value: V) => {
        dispatch(
          actions.updateConfigs({ [key]: value } as unknown as Partial<
            T["configs"]
          >),
        );
      },
      [dispatch],
    );

    // Utility functions for `userPreferences`
    const getOneUserPreference = useCallback(
      <K extends keyof T["userPreferences"]>(key: K) =>
        useAppSelector(selectors.getOneUserPreference(key)),
      [],
    );
    const setOneUserPreference = useCallback(
      <K extends keyof T["userPreferences"]>(
        key: K,
        value: T["userPreferences"][K],
      ) => {
        dispatch(
          actions.updateUserPreferences({ [key]: value } as unknown as Partial<
            T["userPreferences"]
          >),
        );
      },
      [dispatch],
    );
    const addOneUserPreference = useCallback(
      <K extends string, V>(key: K, value: V) => {
        dispatch(
          actions.updateUserPreferences({ [key]: value } as unknown as Partial<
            T["userPreferences"]
          >),
        );
      },
      [dispatch],
    );

    const smartSetData = useCallback(
      (key: keyof T["data"] | string, value: any) => {
        if (key in data) {
          dispatch(
            actions.updateData({ [key as keyof T["data"]]: value } as Partial<
              T["data"]
            >),
          );
        } else {
          dispatch(
            actions.updateData({ [key as string]: value } as Partial<
              T["data"]
            >),
          );
        }
      },
      [data, dispatch],
    );

    const smartGetData = useCallback(
      (key: keyof T["data"] | string) => {
        const dataTyped = data as T["data"];

        if (key in dataTyped) {
          return dataTyped[key as keyof T["data"]];
        }
        dispatch(
          actions.updateData({ [key as string]: null } as Partial<T["data"]>),
        );
        return null;
      },
      [data, dispatch],
    );

    return {
      // State
      initiated,
      data,
      configs,
      userPreferences,
      loading,
      error,
      staleTime,

      // Actions
      setInitiated,
      setLoading,
      setError,
      setData,
      setConfigs,
      setUserPreferences,
      resetState,
      markDataStale,
      updateData,

      // Utilities for data
      getOneData,
      setOneData,
      addOneData,
      smartSetData,
      smartGetData,

      // Utilities for configs
      getOneConfig,
      setOneConfig,
      addOneConfig,
      updateConfigs,

      // Utilities for userPreferences
      getOneUserPreference,
      setOneUserPreference,
      addOneUserPreference,
      updateUserPreferences,
    };
  };
};

// Example usage for aiAudio module:
// import { aiAudioInitialState } from '@/modules/aiVoice/aiVoiceModuleConfig';
// export const useAiAudioModule = createUseModuleHook('aiAudio', aiAudioInitialState);
