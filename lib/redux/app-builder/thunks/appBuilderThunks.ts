import { createAsyncThunk } from "@reduxjs/toolkit";
import { createCustomAppConfig, updateCustomAppConfig, deleteCustomAppConfig, getAllCustomAppConfigs, getCustomAppConfigById, getAllCustomAppConfigsWithApplets, isAppSlugAvailable } from "../service/customAppService";

import { updateCustomAppletConfig, getCustomAppletConfigsByAppId, getAllCustomAppletConfigs } from "../service/customAppletService";
import { AppBuilder, AppletBuilder, type AppsState } from "../types";
import { setActiveApp } from "../appBuilderSyncActions";
import { v4 as uuidv4 } from "uuid";

type WithAppBuilder = { appBuilder: AppsState };

export const createAppThunk = createAsyncThunk<AppBuilder, AppBuilder>(
    "appBuilder/createApp",
    async (app, { rejectWithValue }) => {
        try {
            const savedApp = await createCustomAppConfig(app);
            if (!savedApp.id) {
                throw new Error('No ID returned for the created app');
            }
            return {
                ...savedApp,
                id: savedApp.id,
                appletIds: app.appletIds || [],
            };
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

export const updateAppThunk = createAsyncThunk<AppBuilder, { id: string; changes: Partial<AppBuilder> }>(
    "appBuilder/updateApp",
    async ({ id, changes }, { rejectWithValue }) => {
        try {
            const updatedApp = await updateCustomAppConfig(id, {
                id,
                name: changes.name || '',
                description: changes.description || '',
                slug: changes.slug || '',
                ...changes
            });
            if (!updatedApp.id) {
                throw new Error('No ID returned for the updated app');
            }
            return {
                ...updatedApp,
                id: updatedApp.id,
                appletIds: changes.appletIds || [],
            };
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

export const deleteAppThunk = createAsyncThunk<void, string>(
    "appBuilder/deleteApp",
    async (id, { rejectWithValue }) => {
        try {
            await deleteCustomAppConfig(id);
            return undefined;
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

export const addAppletThunk = createAsyncThunk<void, { appId: string; appletId: string }>(
    "appBuilder/addApplet",
    async ({ appId, appletId }, { rejectWithValue }) => {
        try {
            // Update applet to set app_id
            await updateCustomAppletConfig(appletId, { id: appletId, appId });
            return undefined;
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

export const removeAppletThunk = createAsyncThunk<void, { appId: string; appletId: string }>(
    "appBuilder/removeApplet",
    async ({ appId, appletId }, { rejectWithValue }) => {
        try {
            // Update applet to clear app_id
            await updateCustomAppletConfig(appletId, { id: appletId, appId: null });
            return undefined;
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

export const fetchAppletsForAppThunk = createAsyncThunk<AppletBuilder[], string>(
    "appBuilder/fetchAppletsForApp",
    async (appId, { rejectWithValue }) => {
        try {
            const applets = await getCustomAppletConfigsByAppId(appId);
            return applets.map(applet => ({
                ...applet,
                containers: applet.containers || [],
            }));
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

export const fetchAppsThunk = createAsyncThunk<AppBuilder[], void>(
    "appBuilder/fetchApps",
    async (_, { rejectWithValue }) => {
        try {
            // Use the optimized function to get apps with applets in a single transaction
            const enhancedApps = await getAllCustomAppConfigsWithApplets();

            // Map to the expected AppBuilder format
            const result = enhancedApps.map(app => ({
                ...app,
                id: app.id || '',
                name: app.name || '',
                description: app.description || '',
                slug: app.slug || '',
                appletIds: app.appletIds || [],
            }));

            return result;
        } catch (error: any) {
            console.error("fetchAppsThunk - error:", error);
            return rejectWithValue(error.message);
        }
    }
);

export const checkAppSlugUniqueness = createAsyncThunk<boolean, { slug: string; appId?: string }, { state: WithAppBuilder }>(
    'appBuilder/checkSlugUniqueness',
    async ({ slug, appId }, { rejectWithValue }) => {
        try {
            const isAvailable = await isAppSlugAvailable(slug, appId);
            return isAvailable;
        } catch (error: any) {
            return rejectWithValue(error.message || 'Failed to check slug uniqueness');
        }
    }
);

// Define action creator for fetchAppByIdSuccess
export const fetchAppByIdSuccess = (app: AppBuilder) => ({
    type: "appBuilder/fetchAppByIdSuccess" as const,
    payload: app
});

// Use this type for proper typing in the slice
export type FetchAppByIdSuccessAction = ReturnType<typeof fetchAppByIdSuccess>;

/**
 * Thunk that sets an app as active, fetching it first if not in state
 */
export const setActiveAppWithFetchThunk = createAsyncThunk<
    void,
    string,
    { state: WithAppBuilder }
>(
    "appBuilder/setActiveAppWithFetch",
    async (appId, { getState, dispatch, rejectWithValue }) => {
        try {
            // Check if app already exists in state
            const app = getState().appBuilder.apps[appId];

            if (app) {
                // If it exists, just dispatch the setActiveApp action
                dispatch(setActiveApp(appId));
            } else {
                // Otherwise, fetch it first
                try {
                    const fetchedApp = await getCustomAppConfigById(appId);

                    if (fetchedApp) {
                        // Extract appletIds from appletList for AppBuilder type compatibility
                        const appletIds = fetchedApp.appletList
                            ? fetchedApp.appletList.map(item => item.appletId)
                            : [];

                        // Add the fetched app to state
                        dispatch(fetchAppByIdSuccess({
                            ...fetchedApp,
                            appletIds,
                            isDirty: false,
                            isLocal: false,
                            slugStatus: 'unique'
                        }));

                        // Set it as active
                        dispatch(setActiveApp(appId));
                    } else {
                        console.error(`App with ID ${appId} not found on server`);
                        dispatch(setActiveApp(null));
                    }
                } catch (error: any) {
                    console.error(`Failed to fetch app with ID ${appId}: ${error.message}`);
                    dispatch(setActiveApp(null));
                    return rejectWithValue(error.message || "Failed to fetch app");
                }
            }
            return undefined;
        } catch (error: any) {
            console.error(`Error in setActiveAppWithFetchThunk: ${error.message}`);
            return rejectWithValue(error.message || "Failed to set active app");
        }
    }
);

// Add the unified saveAppThunk after the other app thunks
export const saveAppThunk = createAsyncThunk<
    AppBuilder,
    string,
    { state: WithAppBuilder }
>(
    "appBuilder/saveApp",
    async (appId, { getState, rejectWithValue }) => {
        try {
            const app = getState().appBuilder.apps[appId];
            if (!app) {
                throw new Error(`App with ID ${appId} not found`);
            }

            let savedApp;

            // Determine if this is a new app (isLocal) or an existing one
            if (app.isLocal) {
                // Create new app
                savedApp = await createCustomAppConfig(app);
            } else {
                // Update existing app
                savedApp = await updateCustomAppConfig(appId, app);
            }

            // Return consistently formatted result
            return {
                ...savedApp,
                appletIds: savedApp.appletIds || [],
                isDirty: false,
                isLocal: false,
                slugStatus: 'unique',
            };
        } catch (error: any) {
            return rejectWithValue(error.message || "Failed to save app");
        }
    }
);

// Add a template app generator thunk
export const createTemplateAppThunk = createAsyncThunk<
    void,
    { appId: string; templateType: 'simple' | 'complex' },
    { state: WithAppBuilder }
>(
    "appBuilder/createTemplateApp",
    async ({ appId, templateType }, { getState, dispatch, rejectWithValue }) => {
        try {
            const app = getState().appBuilder.apps[appId];
            if (!app) {
                throw new Error(`App with ID ${appId} not found`);
            }

            // Basic setup for both templates
            dispatch(setActiveApp(appId));

            if (templateType === 'simple') {
                // Create a simple app with one applet, one container, and one field
                // 1. Create an applet
                const appletId = uuidv4();
                const appletName = "Simple Applet";

                // 2. Create a container
                const containerId = uuidv4();

                // 3. Create a field
                const fieldId = uuidv4();

                // 4. Set up the structure
                // TODO: Implement the actual structure setup once we design the template

            } else if (templateType === 'complex') {
                // Create a complex app with multiple applets, containers, and fields
                // TODO: Implement the complex template structure

            }
            return undefined;
        } catch (error: any) {
            return rejectWithValue(error.message || "Failed to create template app");
        }
    }
);

