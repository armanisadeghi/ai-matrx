// @ts-nocheck

import type { AppletsState } from "../types";
import { createSelector } from "@reduxjs/toolkit";
import { AppletBuilder } from "../types";
import {
  BrokerMapping,
  AppletSourceConfig,
  NeededBroker,
  AppletContainer,
  AppletLayoutOption,
} from "@/types/customAppTypes";

// ================================ Base Selectors ================================

// Base selector for the appletBuilder state

type WithAppletBuilder = { appletBuilder: AppletsState };
export const getAppletBuilderState = (state: WithAppletBuilder) =>
  state.appletBuilder;

// Memoized selector for all applets
export const selectAllApplets = createSelector(
  [getAppletBuilderState],
  (appletBuilderState) => Object.values(appletBuilderState.applets),
);

// Memoized selector for a specific applet by ID
export const selectAppletById = createSelector(
  [getAppletBuilderState, (state: WithAppletBuilder, id: string) => id],
  (appletBuilderState, id) => appletBuilderState.applets[id] || null,
);

// ================================ Status Selectors ================================

// Memoized selector for applet loading state
export const selectAppletLoading = createSelector(
  [getAppletBuilderState],
  (appletBuilderState) => appletBuilderState.isLoading,
);

// Memoized selector for applet error state
export const selectAppletError = createSelector(
  [getAppletBuilderState],
  (appletBuilderState) => appletBuilderState.error,
);

// ================================ Applet Collection Selectors ================================

// Memoized selector for applets by a list of IDs
export const selectAppletsByIds = createSelector(
  [
    getAppletBuilderState,
    (_state: WithAppletBuilder, appletIds: string[]) => appletIds,
  ],
  (appletBuilderState, appletIds) => {
    return appletIds
      .map((id) => appletBuilderState.applets[id])
      .filter((applet): applet is AppletBuilder => applet !== null);
  },
);

// Memoized selector for applets associated with a specific app ID
export const selectAppletsByAppId = createSelector(
  [selectAllApplets, (_state: WithAppletBuilder, appId: string) => appId],
  (applets, appId) => applets.filter((applet) => applet.appId === appId),
);

// Memoized selector for applets NOT associated with a specific app ID
export const selectAppletsExcludingAppId = createSelector(
  [selectAllApplets, (_state: WithAppletBuilder, appId: string) => appId],
  (applets, appId) => applets.filter((applet) => applet.appId !== appId),
);

// Memoized selector for applets without an app assignment
export const selectUnassignedApplets = createSelector(
  [selectAllApplets],
  (applets) => applets.filter((applet) => !applet.appId),
);

// Memoized selector for local applets
export const selectLocalApplets = createSelector(
  [selectAllApplets],
  (applets) => applets.filter((applet) => applet.isLocal === true),
);

// ================================ Applet Container Selectors ================================

// Memoized selector for containers associated with an applet
export const selectContainersForApplet = createSelector(
  [selectAppletById],
  (applet) => {
    return applet ? applet.containers : [];
  },
);

// ================================ Dirty State Management ================================

// Memoized selector for dirty applets
export const selectDirtyApplets = createSelector(
  [selectAllApplets],
  (applets) => applets.filter((applet) => applet.isDirty === true),
);

// Memoized selector for checking if there are unsaved changes
export const selectHasUnsavedAppletChanges = createSelector(
  [selectAllApplets],
  (applets) => applets.some((applet) => applet.isDirty === true),
);

// ================================ Active/New Applet Selectors ================================

// Memoized selector for new applet ID
export const selectNewAppletId = createSelector(
  [getAppletBuilderState],
  (appletBuilderState) => appletBuilderState.newAppletId,
);

// Memoized selector for active applet ID
export const selectActiveAppletId = createSelector(
  [getAppletBuilderState],
  (appletBuilderState) => appletBuilderState.activeAppletId,
);

// Memoized selector for the active applet
export const selectActiveApplet = createSelector(
  [getAppletBuilderState, selectActiveAppletId],
  (appletBuilderState, activeAppletId) =>
    activeAppletId ? appletBuilderState.applets[activeAppletId] || null : null,
);

// Memoized selector to check if active applet is dirty
export const selectIsActiveAppletDirty = createSelector(
  [selectActiveApplet],
  (activeApplet) => (activeApplet ? activeApplet.isDirty === true : false),
);

// Memoized selector to check if a specific applet is dirty
export const selectIsAppletDirtyById = createSelector(
  [selectAppletById],
  (applet) => (applet ? applet.isDirty === true : false),
);

// ================================ Applet Property Selectors ================================

// Generic property selector factory
const createAppletPropertySelector = <T>(propertyName: keyof AppletBuilder) => {
  return createSelector([selectAppletById], (applet): T | null =>
    applet ? (applet[propertyName] as T) : null,
  );
};

// Explicit selectors for each AppletBuilder property
export const selectAppletId = createAppletPropertySelector<string>("id");
export const selectAppletName = createAppletPropertySelector<string>("name");
export const selectAppletDescription =
  createAppletPropertySelector<string>("description");
export const selectAppletSlug = createAppletPropertySelector<string>("slug");
export const selectAppletIcon =
  createAppletPropertySelector<string>("appletIcon");
export const selectAppletSubmitText =
  createAppletPropertySelector<string>("appletSubmitText");
export const selectAppletCreator =
  createAppletPropertySelector<string>("creator");
export const selectAppletPrimaryColor =
  createAppletPropertySelector<string>("primaryColor");
export const selectAppletAccentColor =
  createAppletPropertySelector<string>("accentColor");
export const selectAppletLayoutType =
  createAppletPropertySelector<AppletLayoutOption>("layoutType");
export const selectAppletContainers =
  createAppletPropertySelector<AppletContainer[]>("containers");
export const selectAppletResultComponentConfig =
  createAppletPropertySelector<any>("resultComponentConfig");
export const selectAppletNextStepConfig =
  createAppletPropertySelector<any>("nextStepConfig");
export const selectAppletCompiledRecipeId =
  createAppletPropertySelector<string>("compiledRecipeId");
export const selectAppletSubcategoryId =
  createAppletPropertySelector<string>("subcategoryId");
export const selectAppletImageUrl =
  createAppletPropertySelector<string>("imageUrl");
export const selectAppletImageFileId =
  createAppletPropertySelector<string>("imageFileId");
export const selectAppletAppId = createAppletPropertySelector<string>("appId");

// ================================ Security and Status Selectors ================================

export const selectAppletIsPublic =
  createAppletPropertySelector<boolean>("isPublic");
export const selectAppletAuthenticatedRead =
  createAppletPropertySelector<boolean>("authenticatedRead");
export const selectAppletPublicRead =
  createAppletPropertySelector<boolean>("publicRead");
export const selectAppletIsDirty =
  createAppletPropertySelector<boolean>("isDirty");
export const selectAppletIsLocal =
  createAppletPropertySelector<boolean>("isLocal");

// Special selector for slug status with default value
export const selectAppletSlugStatus = createSelector(
  [selectAppletById],
  (applet) => (applet ? applet.slugStatus : "unchecked"),
);

// ==== Just a store for temporary fetched source configs from random recipes ====
export const selectTempSourceConfigList = createSelector(
  [getAppletBuilderState],
  (appletBuilderState) => appletBuilderState.tempSourceConfigList,
);

// ================================ Source Config Selectors ================================

export const selectAppletDataSourceConfig =
  createAppletPropertySelector<AppletSourceConfig>("dataSourceConfig");

// Alias for data source config for backwards compatibility
export const selectAppletSourceConfig = selectAppletDataSourceConfig;

// Find a source config by config ID within an applet
export const selectSourceConfigByConfigId = createSelector(
  [
    (state: WithAppletBuilder, appletId: string, configId: string) => {
      const applet = getAppletBuilderState(state).applets[appletId];
      return { applet, configId };
    },
  ],
  ({ applet, configId }) => {
    if (!applet || !applet.dataSourceConfig || !applet.dataSourceConfig.config)
      return null;
    return applet.dataSourceConfig.config &&
      "id" in applet.dataSourceConfig.config &&
      applet.dataSourceConfig.config.id === configId
      ? applet.dataSourceConfig.config
      : null;
  },
);

// Find a source config by source type within an applet
export const selectSourceConfigBySourceType = createSelector(
  [
    (state: WithAppletBuilder, appletId: string, sourceType: string) => {
      const applet = getAppletBuilderState(state).applets[appletId];
      return { applet, sourceType };
    },
  ],
  ({ applet, sourceType }) => {
    if (!applet || !applet.dataSourceConfig) return null;
    return applet.dataSourceConfig.sourceType === sourceType
      ? applet.dataSourceConfig
      : null;
  },
);

// Get all source configs for a specific source type across all applets
export const selectAllSourceConfigsBySourceType = createSelector(
  [
    selectAllApplets,
    (_state: WithAppletBuilder, sourceType: string) => sourceType,
  ],
  (applets, sourceType) => {
    return applets.reduce((configs, applet) => {
      if (
        applet.dataSourceConfig &&
        applet.dataSourceConfig.sourceType === sourceType
      ) {
        configs.push(applet.dataSourceConfig);
      }
      return configs;
    }, [] as AppletSourceConfig[]);
  },
);

// ================================ Broker Mapping Selectors ================================

// This one is fine - it's directly accessing state
export const selectAppletBrokerMappings = createSelector(
  [
    (state: WithAppletBuilder, id: string) =>
      getAppletBuilderState(state).applets[id],
  ],
  (applet) => (applet && applet.brokerMap ? applet.brokerMap : null),
);

// This one is fine - it's using the output of another selector
export const selectAppletBrokerFieldIds = createSelector(
  [selectAppletBrokerMappings],
  (brokerMap): string[] => {
    if (!brokerMap) return [];

    // Extract only the fieldIds from the broker mappings
    return Object.values(brokerMap).map((mapping) => mapping.fieldId);
  },
);

// This one needs fixing - it's creating new object references
export const selectBrokerMappingByBrokerId = createSelector(
  [
    (state: WithAppletBuilder) => state,
    (state: WithAppletBuilder, appletId: string) => appletId,
    (state: WithAppletBuilder, appletId: string, brokerId: string) => brokerId,
  ],
  (state, appletId, brokerId) => {
    const applet = getAppletBuilderState(state).applets[appletId];
    if (!applet || !applet.brokerMap || applet.brokerMap.length === 0)
      return null;
    return (
      applet.brokerMap.find((mapping) => mapping.brokerId === brokerId) || null
    );
  },
);

// This one is fine now - it uses the selector directly
export const selectFieldIdByBrokerId = createSelector(
  [selectBrokerMappingByBrokerId],
  (mapping) => {
    if (!mapping) return null;
    return mapping.fieldId;
  },
);

// This one needs fixing - it's creating new object references
export const selectFieldLabelByBrokerId = createSelector(
  [selectFieldIdByBrokerId, (state: WithAppletBuilder) => state],
  (fieldId, state) => {
    if (!fieldId) return null;
    return state.fieldBuilder.fields[fieldId]?.label ?? null;
  },
);

// Alternative approach for selectFieldLabelByBrokerId that avoids the nested selector call
export const selectFieldLabelByBrokerIdAlt = createSelector(
  [
    (state: WithAppletBuilder) => state,
    (state: WithAppletBuilder, appletId: string) => appletId,
    (state: WithAppletBuilder, appletId: string, brokerId: string) => brokerId,
  ],
  (state, appletId, brokerId) => {
    const fieldId = selectFieldIdByBrokerId(state, appletId, brokerId);
    if (!fieldId) return null;
    return state.fieldBuilder.fields[fieldId]?.label ?? null;
  },
);

// ================================ Needed Broker Selectors ================================

// Get all broker mappings for a specific broker ID across all applets
export const selectAllBrokerMappingsByBrokerId = createSelector(
  [selectAllApplets, (_state: WithAppletBuilder, brokerId: string) => brokerId],
  (applets, brokerId) => {
    return applets.reduce((mappings, applet) => {
      if (applet.brokerMap && applet.brokerMap.length > 0) {
        const match = applet.brokerMap.find(
          (mapping) => mapping.brokerId === brokerId,
        );
        if (match) mappings.push(match);
      }
      return mappings;
    }, [] as BrokerMapping[]);
  },
);

// 1. Select all needed brokers for a specific applet
export const selectAllNeededBrokers = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectAppletDataSourceConfig(state, appletId),
  ],
  (dataSourceConfig: AppletSourceConfig | null) => {
    if (
      !dataSourceConfig ||
      !dataSourceConfig.config ||
      !("neededBrokers" in dataSourceConfig.config)
    ) {
      return [];
    }
    return dataSourceConfig.config.neededBrokers || ([] as NeededBroker[]);
  },
);

// 2. Select unmatched needed brokers (needed but not in brokerMap)
export const selectUnmatchedNeededBrokers = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectAllNeededBrokers(state, appletId),
    (state: WithAppletBuilder, appletId: string) =>
      selectAppletBrokerMappings(state, appletId),
  ],
  (neededBrokers: NeededBroker[], brokerMap: BrokerMapping[] | null) => {
    if (!brokerMap || brokerMap.length === 0) {
      return neededBrokers;
    }
    const mappedBrokerIds = new Set(
      brokerMap.map((mapping) => mapping.brokerId),
    );
    return neededBrokers.filter((broker) => !mappedBrokerIds.has(broker.id));
  },
);

// 3. Select count of all needed brokers
export const selectNeededBrokerCount = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectAllNeededBrokers(state, appletId),
  ],
  (neededBrokers: NeededBroker[]) => neededBrokers.length,
);

// 4. Select count of unmatched needed brokers
export const selectUnmatchedNeededBrokerCount = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectUnmatchedNeededBrokers(state, appletId),
  ],
  (unmatchedBrokers: NeededBroker[]) => unmatchedBrokers.length,
);

// 5. Check broker map integrity (no duplicate broker IDs in brokerMap)
export const selectIsBrokerMapIntegrity = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectAppletBrokerMappings(state, appletId),
  ],
  (brokerMap: BrokerMapping[] | null) => {
    if (!brokerMap || brokerMap.length === 0) {
      return true; // Empty or null map is valid
    }
    const brokerIds = brokerMap.map((mapping) => mapping.brokerId);
    const uniqueBrokerIds = new Set(brokerIds);
    return brokerIds.length === uniqueBrokerIds.size; // True if no duplicates
  },
);

// Select required needed brokers
export const selectRequiredNeededBrokers = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectAllNeededBrokers(state, appletId),
  ],
  (neededBrokers: NeededBroker[]) =>
    neededBrokers.filter((broker) => broker.required),
);

// Select count of required needed brokers
export const selectRequiredNeededBrokerCount = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectRequiredNeededBrokers(state, appletId),
  ],
  (requiredBrokers: NeededBroker[]) => requiredBrokers.length,
);

// Check if all required brokers are mapped
export const selectIsAllRequiredBrokersMapped = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectRequiredNeededBrokers(state, appletId),
    (state: WithAppletBuilder, appletId: string) =>
      selectAppletBrokerMappings(state, appletId),
  ],
  (requiredBrokers: NeededBroker[], brokerMappings: BrokerMapping[] | null) => {
    if (!brokerMappings || requiredBrokers.length === 0) {
      return true; // No required brokers or no mappings means valid
    }
    const mappedBrokerIds = new Set(
      brokerMappings.map((mapping) => mapping.brokerId),
    );
    return requiredBrokers.every((broker) => mappedBrokerIds.has(broker.id));
  },
);

// Select count of mapped brokers
export const selectMappedBrokerCount = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectNeededBrokerCount(state, appletId),
    (state: WithAppletBuilder, appletId: string) =>
      selectUnmatchedNeededBrokerCount(state, appletId),
  ],
  (neededBrokerCount: number, unmatchedBrokerCount: number) =>
    neededBrokerCount - unmatchedBrokerCount,
);

// Check if a specific broker is mapped
export const selectIsBrokerMapped = createSelector(
  [
    (state: WithAppletBuilder, appletId: string, brokerId: string) =>
      selectAppletBrokerMappings(state, appletId),
    (_state: WithAppletBuilder, _appletId: string, brokerId: string) =>
      brokerId,
  ],
  (brokerMappings, brokerId) => {
    if (!brokerMappings || brokerMappings.length === 0) {
      return false;
    }
    return brokerMappings.some((mapping) => mapping.brokerId === brokerId);
  },
);

// Return sorted brokers with unmapped ones first, then required status, then alphabetically
export const selectBrokerMappedStatus = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectAllNeededBrokers(state, appletId),
    (state: WithAppletBuilder, appletId: string) =>
      selectAppletBrokerMappings(state, appletId),
  ],
  (neededBrokers, brokerMappings) => {
    // Create a set of mapped broker IDs for efficient lookup
    const mappedBrokerIds = new Set(
      brokerMappings ? brokerMappings.map((mapping) => mapping.brokerId) : [],
    );

    // Return a stable reference - an object mapping broker IDs to mapped status
    return neededBrokers.reduce(
      (acc, broker) => {
        acc[broker.id] = mappedBrokerIds.has(broker.id);
        return acc;
      },
      {} as Record<string, boolean>,
    );
  },
);

export const selectSortedNeededBrokers = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectAllNeededBrokers(state, appletId),
    (state: WithAppletBuilder, appletId: string) =>
      selectBrokerMappedStatus(state, appletId),
  ],
  (neededBrokers, mappedStatus) => {
    // Create a copy to avoid mutating the original array
    return [...neededBrokers].sort((a, b) => {
      const isAMapped = mappedStatus[a.id] || false;
      const isBMapped = mappedStatus[b.id] || false;

      // Primary sort: unmapped brokers first
      if (isAMapped && !isBMapped) return 1;
      if (!isAMapped && isBMapped) return -1;

      // Secondary sort: required brokers first within each group
      if (a.required && !b.required) return -1;
      if (!a.required && b.required) return 1;

      // Tertiary sort: alphabetical by name
      return a.name.localeCompare(b.name);
    });
  },
);

// Calculate broker mapping completion percentage
export const selectBrokerMappingCompletionPercentage = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectNeededBrokerCount(state, appletId),
    (state: WithAppletBuilder, appletId: string) =>
      selectMappedBrokerCount(state, appletId),
  ],
  (neededBrokerCount: number, mappedBrokerCount: number) => {
    if (neededBrokerCount === 0) return 100; // If no brokers needed, consider it 100% complete
    return Math.round((mappedBrokerCount / neededBrokerCount) * 100);
  },
);

// ================================ Used Fields Selectors ================================

// Returns a Set of all field IDs that are used in any container in the applet
export const selectAllUsedFieldsInApplet = createSelector(
  [
    (state: WithAppletBuilder, appletId: string) =>
      selectContainersForApplet(state, appletId),
  ],
  (containers) => {
    // Create a Set to track unique field IDs
    const usedFieldIds = new Set<string>();

    // Process each container
    containers.forEach((container) => {
      // Skip containers without fields
      if (!container.fields) return;

      // Add each field ID to the set
      container.fields.forEach((field) => {
        usedFieldIds.add(field.id);
      });
    });

    return usedFieldIds;
  },
);
