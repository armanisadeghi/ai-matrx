import { createSelector } from "@reduxjs/toolkit";
import { AppBuilder } from "../types"; // Adjust path based on your project structure
import { AppsState } from "../types";
import { AppLayoutOptions, CustomActionButton } from "@/types/customAppTypes";

// Assuming the root state has an `appBuilder` slice
interface RootState {
  appBuilder: AppsState;
}

// Root selector to get the appBuilder slice
export const selectAppBuilderState = (state: RootState): AppsState => state.appBuilder;

// Base selectors for top-level AppsState properties
export const selectApps = createSelector(
  [selectAppBuilderState],
  (appBuilder) => appBuilder.apps
);

export const selectIsLoading = createSelector(
  [selectAppBuilderState],
  (appBuilder) => appBuilder.isLoading
);

export const selectError = createSelector(
  [selectAppBuilderState],
  (appBuilder) => appBuilder.error
);

export const selectActiveAppId = createSelector(
  [selectAppBuilderState],
  (appBuilder) => appBuilder.activeAppId
);

export const selectNewAppId = createSelector(
  [selectAppBuilderState],
  (appBuilder) => appBuilder.newAppId
);

// Selector to get a specific app by ID
export const selectAppById = createSelector(
  [selectApps, (_: RootState, appId: string) => appId],
  (apps, appId): AppBuilder | undefined => apps[appId]
);

// Selector to get the active app based on activeAppId
export const selectActiveApp = createSelector(
  [selectApps, selectActiveAppId],
  (apps, activeAppId): AppBuilder | null => (activeAppId ? apps[activeAppId] || null : null)
);

// Individual AppBuilder property selectors
export const selectAppName = createSelector(
  [selectAppById],
  (app): string | undefined => app?.name
);

export const selectAppDescription = createSelector(
  [selectAppById],
  (app): string | undefined => app?.description
);

export const selectAppSlug = createSelector(
  [selectAppById],
  (app): string | undefined => app?.slug
);

export const selectAppMainAppIcon = createSelector(
  [selectAppById],
  (app): string | undefined => app?.mainAppIcon
);

export const selectAppMainAppSubmitIcon = createSelector(
  [selectAppById],
  (app): string | undefined => app?.mainAppSubmitIcon
);

export const selectAppCreator = createSelector(
  [selectAppById],
  (app): string | undefined => app?.creator
);

export const selectAppPrimaryColor = createSelector(
  [selectAppById],
  (app): string | undefined => app?.primaryColor
);

export const selectAppAccentColor = createSelector(
  [selectAppById],
  (app): string | undefined => app?.accentColor
);

export const selectAppAppletList = createSelector(
  [selectAppById],
  (app): { appletId: string; label: string }[] | undefined => app?.appletList
);

export const selectAppExtraButtons = createSelector(
  [selectAppById],
  (app): CustomActionButton[] | undefined => app?.extraButtons
);

export const selectAppLayoutType = createSelector(
  [selectAppById],
  (app): AppLayoutOptions | undefined => app?.layoutType
);

export const selectAppImageUrl = createSelector(
  [selectAppById],
  (app): string | undefined => app?.imageUrl
);

export const selectAppImageFileId = createSelector(
  [selectAppById],
  (app): string | undefined => app?.imageFileId
);

export const selectAppAuthenticatedRead = createSelector(
  [selectAppById],
  (app): boolean | undefined => app?.authenticatedRead
);

export const selectAppPublicRead = createSelector(
  [selectAppById],
  (app): boolean | undefined => app?.publicRead
);

export const selectAppIsDirty = createSelector(
  [selectAppById],
  (app): boolean | undefined => app?.isDirty
);

export const selectAppIsLocal = createSelector(
  [selectAppById],
  (app): boolean | undefined => app?.isLocal
);

export const selectAppSlugStatus = createSelector(
  [selectAppById],
  (app): "unchecked" | "unique" | "notUnique" | undefined => app?.slugStatus
);

// Selector for appletIds (specific to your slice)
export const selectAppAppletIds = createSelector(
  [selectAppById],
  (app): string[] | undefined => app?.appletIds
);



// ================================ Base Selectors ================================

// Base selector for the appBuilder state
export const getAppBuilderState = (state: RootState) => {
  return state.appBuilder;
};

// Memoized selector for all apps
export const selectAllApps = createSelector(
  [getAppBuilderState],
  (appBuilderState) => {
    return Object.values(appBuilderState.apps);
  }
);

// ================================ Status Selectors ================================

// Memoized selector for loading state
export const selectAppLoading = createSelector(
  [getAppBuilderState],
  (appBuilderState) => appBuilderState.isLoading
);

// Memoized selector for error state
export const selectAppError = createSelector(
  [getAppBuilderState],
  (appBuilderState) => appBuilderState.error
);

// ================================ App Collection Selectors ================================

// Memoized selector for applet IDs associated with an app
export const selectAppletIdsForApp = createSelector(
  [(state: RootState, appId: string) => selectAppById(state, appId)],
  (app) => app && app.appletIds ? app.appletIds : []
);

export const selectAppletsForAppCount = createSelector(
  [(state: RootState, appId: string) => selectAppById(state, appId)],
  (app) => app && app.appletIds ? app.appletIds.length : 0
);

// Memoized selector for apps by a list of IDs
export const selectAppsByIds = createSelector(
  [
    getAppBuilderState,
    (_state: RootState, appIds: string[]) => appIds
  ],
  (appBuilderState, appIds) => {
    // If appIds is empty, return empty array
    if (!appIds || appIds.length === 0) {
      return [];
    }
    
    // Map and filter in one step
    const result = appIds
      .map(id => appBuilderState.apps[id])
      .filter((app): app is AppBuilder => app !== null && app !== undefined);
    
    return result;
  }
);

// Memoized selector for apps with a specific applet ID
export const selectAppsWithApplet = createSelector(
  [
    selectAllApps,
    (_state: RootState, appletId: string) => appletId
  ],
  (apps, appletId) => apps.filter(app => app.appletIds.includes(appletId))
);

// ================================ Dirty State Management ================================

// Memoized selector for dirty apps
export const selectDirtyApps = createSelector(
  [selectAllApps],
  (apps) => apps.filter(app => app.isDirty === true)
);

// Memoized selector for checking if there are unsaved changes
export const selectHasUnsavedAppChanges = createSelector(
  [selectAllApps],
  (apps) => apps.some(app => app.isDirty === true)
);

// Memoized selector for local apps
export const selectLocalApps = createSelector(
  [selectAllApps],
  (apps) => apps.filter(app => app.isLocal === true)
);



// ================================ App Property Selectors ================================

// Explicit selectors for each AppBuilder property
export const selectAppId = createSelector(
  [(state: RootState, id: string) => state.appBuilder.apps[id]],
  (app) => app ? app.id : null
);





export const selectAppCreatedAt = createSelector(
  [(state: RootState, id: string) => state.appBuilder.apps[id]],
  (app) => app ? app.createdAt : null
);

export const selectAppUpdatedAt = createSelector(
  [(state: RootState, id: string) => state.appBuilder.apps[id]],
  (app) => app ? app.updatedAt : null
);

export const selectAppUserId = createSelector(
  [(state: RootState, id: string) => state.appBuilder.apps[id]],
  (app) => app ? app.userId : null
);

// ================================ Security and Status Selectors ================================

export const selectAppIsPublic = createSelector(
  [(state: RootState, id: string) => state.appBuilder.apps[id]],
  (app) => app ? app.isPublic : null
);

export const selectAppDataContext = createSelector(
  [(state: RootState, id: string) => state.appBuilder.apps[id]],
  (app) => app ? app.appDataContext : null
);





