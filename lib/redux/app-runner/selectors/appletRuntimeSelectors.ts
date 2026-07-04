import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { FieldDefinition } from "@/types/customAppTypes";

const EMPTY_RECORD: Record<string, never> = {};
const EMPTY_STRING_ARRAY: string[] = [];

// ================================ Base Selectors ================================
// Component Definitions Selectors
export const selectAppConfigs = (state: RootState) =>
  state.componentDefinitions.appConfigs ?? EMPTY_RECORD;
export const selectComponentDefinitions = (state: RootState) =>
  state.componentDefinitions.definitions ?? EMPTY_RECORD;
export const selectComponentInstances = (state: RootState) =>
  state.componentDefinitions.instances ?? EMPTY_RECORD;
export const selectContainers = (state: RootState) =>
  state.componentDefinitions.containers ?? EMPTY_RECORD;
export const selectApplets = (state: RootState) =>
  state.componentDefinitions.applets ?? EMPTY_RECORD;
export const selectComponentToBrokerMap = (state: RootState) =>
  state.componentDefinitions.componentToBrokerMap ?? EMPTY_RECORD;

// ================================ App Selectors ================================
// App Config Selectors
export const selectAppConfig = createSelector(
  [selectAppConfigs, (_: RootState, appId?: string | null) => appId ?? ""],
  (appConfigs, appId) =>
    appId ? (appConfigs[appId] ?? EMPTY_RECORD) : EMPTY_RECORD,
);

export const selectAppAppletList = createSelector(
  [selectAppConfig],
  (appConfig) => appConfig?.appletList ?? EMPTY_STRING_ARRAY,
);

// ================================ Component Selectors ================================
// Component Definition and Instance Selectors
export const selectComponentDefinition = createSelector(
  [
    selectComponentDefinitions,
    (_: RootState, appId?: string | null, id?: string | null) => ({
      appId: appId ?? "",
      id: id ?? "",
    }),
  ],
  (definitions, { appId, id }) => {
    if (!appId || !id) return EMPTY_RECORD;
    return definitions[appId]?.[id] ?? EMPTY_RECORD;
  },
);

export const selectComponentInstance = createSelector(
  [
    selectComponentInstances,
    (_: RootState, appId?: string | null, id?: string | null) => ({
      appId: appId ?? "",
      id: id ?? "",
    }),
  ],
  (instances, { appId, id }) => {
    if (!appId || !id) return EMPTY_RECORD;
    return instances[appId]?.[id] ?? EMPTY_RECORD;
  },
);

// ================================ Container Selectors ================================
export const selectContainer = createSelector(
  [
    selectContainers,
    (_: RootState, appId?: string | null, id?: string | null) => ({
      appId: appId ?? "",
      id: id ?? "",
    }),
  ],
  (containers, { appId, id }) => {
    if (!appId || !id) return EMPTY_RECORD;
    return containers[appId]?.[id] ?? EMPTY_RECORD;
  },
);

export const selectAllContainers = createSelector(
  [selectContainers, (_: RootState, appId?: string | null) => appId ?? ""],
  (containers, appId) => {
    if (!appId) return EMPTY_RECORD;
    return containers[appId] ?? EMPTY_RECORD;
  },
);

export const selectComponentInstancesForContainer = createSelector(
  [
    selectContainers,
    selectComponentInstances,
    (_: RootState, appId?: string | null, containerId?: string | null) => ({
      appId: appId ?? "",
      containerId: containerId ?? "",
    }),
  ],
  (containers, instances, { appId, containerId }) => {
    if (!appId || !containerId) return EMPTY_STRING_ARRAY;

    const container = containers[appId]?.[containerId];
    if (!container?.fields) return EMPTY_STRING_ARRAY;

    const result = container.fields
      .map((field) =>
        Object.values(instances[appId] ?? EMPTY_RECORD).filter(
          (instance: FieldDefinition) =>
            instance?.id && field?.id && instance.id.startsWith(field.id),
        ),
      )
      .flat();

    return result;
  },
);

// ================================ Applet Selectors ================================
export const selectApplet = createSelector(
  [
    selectApplets,
    (_: RootState, appId?: string | null, id?: string | null) => ({
      appId: appId ?? "",
      id: id ?? "",
    }),
  ],
  (applets, { appId, id }) => {
    if (!appId || !id) return EMPTY_RECORD;
    return applets[appId]?.[id] ?? EMPTY_RECORD;
  },
);

export const selectAllApplets = createSelector(
  [selectApplets, (_: RootState, appId?: string | null) => appId ?? ""],
  (applets, appId) => {
    if (!appId) return EMPTY_RECORD;
    return applets[appId] ?? EMPTY_RECORD;
  },
);

// ================================ Broker Mapping Selectors ================================
export const selectAllBrokerMappings = createSelector(
  [
    selectComponentToBrokerMap,
    (_: RootState, appId?: string | null) => appId ?? "",
  ],
  (mappings, appId) => {
    if (!appId) return EMPTY_STRING_ARRAY;
    return mappings[appId] ?? EMPTY_STRING_ARRAY;
  },
);
