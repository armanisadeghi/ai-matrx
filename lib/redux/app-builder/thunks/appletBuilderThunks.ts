import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppletsState } from "../types";
import {
  createCustomAppletConfig,
  updateCustomAppletConfig,
  deleteCustomAppletConfig,
  addContainersToApplet,
  recompileAllContainersInApplet,
  getAllCustomAppletConfigs,
  getCustomAppletConfigById,
  isAppletSlugAvailable,
} from "../service/customAppletService";
import { AppletBuilder, ContainerBuilder } from "../types";
import { setActiveApplet } from "../appletBuilderSyncActions";

// Define action creator for fetchAppletByIdSuccess

type WithAppletBuilder = { appletBuilder: AppletsState };

export const fetchAppletByIdSuccess = (applet: AppletBuilder) => ({
  type: "appletBuilder/fetchAppletByIdSuccess" as const,
  payload: applet,
});

// Use this type for proper typing in the slice
export type FetchAppletByIdSuccessAction = ReturnType<
  typeof fetchAppletByIdSuccess
>;

/**
 * Thunk that sets an applet as active, fetching it first if not in state
 */
export const setActiveAppletWithFetchThunk = createAsyncThunk<
  { success: boolean; exists: boolean },
  string,
  { state: WithAppletBuilder }
>(
  "appletBuilder/setActiveAppletWithFetch",
  async (appletId, { getState, dispatch, rejectWithValue }) => {
    try {
      // Check if applet already exists in state - using getState directly instead of a selector
      const appletState = (getState() as WithAppletBuilder).appletBuilder.applets[appletId];

      if (appletState) {
        // If it exists, just set it as active
        dispatch(setActiveApplet(appletId));
        return { success: true, exists: true };
      } else {
        // Otherwise, fetch it first
        try {
          const fetchedApplet = await getCustomAppletConfigById(appletId);

          if (fetchedApplet) {
            // Add the fetched applet to state with required type properties
            dispatch(
              fetchAppletByIdSuccess({
                ...fetchedApplet,
                isDirty: false,
                isLocal: false,
                slugStatus: "unique",
              }),
            );

            // Set it as active
            dispatch(setActiveApplet(appletId));
            return { success: true, exists: false };
          } else {
            console.error(`Applet with ID ${appletId} not found on server`);
            dispatch(setActiveApplet(null));
            return rejectWithValue(
              `Applet with ID ${appletId} not found on server`,
            );
          }
        } catch (error: any) {
          console.error(
            `Failed to fetch applet with ID ${appletId}: ${error.message}`,
          );
          dispatch(setActiveApplet(null));
          return rejectWithValue(error.message || "Failed to fetch applet");
        }
      }
    } catch (error: any) {
      console.error(`Error in setActiveAppletWithFetchThunk: ${error.message}`);
      return rejectWithValue(error.message || "Failed to set active applet");
    }
  },
);

/**
 * Associate an applet with an app by updating the applet's appId field
 */
export const addAppletToAppThunk = createAsyncThunk<
  AppletBuilder,
  { appletId: string; appId: string },
  { state: WithAppletBuilder }
>(
  "appletBuilder/addAppletToApp",
  async ({ appletId, appId }, { getState, rejectWithValue }) => {
    try {
      const applet = (getState() as WithAppletBuilder).appletBuilder.applets[appletId];
      if (!applet) {
        throw new Error(`Applet with ID ${appletId} not found`);
      }

      // Update the applet with the new appId
      const updatedApplet = { ...applet, appId };
      const result = await updateCustomAppletConfig(appletId, updatedApplet);

      return {
        ...result,
        containers: result.containers || [],
        isDirty: false,
        isLocal: false,
        slugStatus: "unique",
        appId, // Ensure appId is in the result
      };
    } catch (error: any) {
      return rejectWithValue(
        error.message || "Failed to associate applet with app",
      );
    }
  },
);

// New unified save applet thunk
export const saveAppletThunk = createAsyncThunk<
  AppletBuilder,
  string,
  { state: WithAppletBuilder }
>(
  "appletBuilder/saveApplet",
  async (appletId, { getState, rejectWithValue }) => {
    try {
      const applet = (getState() as WithAppletBuilder).appletBuilder.applets[appletId];
      if (!applet) {
        throw new Error(`Applet with ID ${appletId} not found`);
      }

      let savedApplet;

      // Determine if this is a new applet (isLocal) or an existing one
      if (applet.isLocal) {
        // Create new applet
        savedApplet = await createCustomAppletConfig(applet);
      } else {
        // Update existing applet
        savedApplet = await updateCustomAppletConfig(appletId, applet);
      }

      // Return consistently formatted result
      return {
        ...savedApplet,
        containers: savedApplet.containers || [],
        isDirty: false,
        isLocal: false,
        slugStatus: "unique",
      };
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to save applet");
    }
  },
);

export const createAppletThunk = createAsyncThunk<AppletBuilder, AppletBuilder>(
  "appletBuilder/createApplet",
  async (applet, { rejectWithValue }) => {
    try {
      const appletData = {
        ...applet,
        id:
          applet.id ||
          `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        containers: applet.containers || [],
      };
      const savedApplet = await createCustomAppletConfig(appletData);
      return {
        ...savedApplet,
        containers: savedApplet.containers || [],
        isDirty: false,
        isLocal: false,
        slugStatus: "unique",
      };
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to create applet");
    }
  },
);

export const updateAppletThunk = createAsyncThunk<
  AppletBuilder,
  { id: string; changes: Partial<AppletBuilder> }
>(
  "appletBuilder/updateApplet",
  async ({ id, changes }, { getState, rejectWithValue }) => {
    try {
      const currentApplet = (getState() as WithAppletBuilder).appletBuilder.applets[id];
      if (!currentApplet) {
        throw new Error(`Applet with ID ${id} not found`);
      }
      const updatedApplet = { ...currentApplet, ...changes };
      const result = await updateCustomAppletConfig(id, updatedApplet);
      return {
        ...result,
        containers: result.containers || [],
        isDirty: false,
        isLocal: false,
        slugStatus: "unique",
      };
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to update applet");
    }
  },
);

export const deleteAppletThunk = createAsyncThunk<void, string>(
  "appletBuilder/deleteApplet",
  async (id, { rejectWithValue }) => {
    try {
      await deleteCustomAppletConfig(id);
      return undefined;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to delete applet");
    }
  },
);

export const addContainerThunk = createAsyncThunk<
  AppletBuilder,
  { appletId: string; containerId: string }
>(
  "appletBuilder/addContainer",
  async ({ appletId, containerId }, { rejectWithValue }) => {
    try {
      // Add the container to the applet
      await addContainersToApplet(appletId, [containerId]);

      // Get the updated applet with the new container
      const updatedApplet = await getCustomAppletConfigById(appletId);

      if (!updatedApplet) {
        throw new Error("Failed to fetch updated applet");
      }

      // Verify the container was added
      const containerExists = updatedApplet.containers.some(
        (c: ContainerBuilder) => c.id === containerId,
      );
      if (!containerExists) {
        throw new Error("Container not found in applet after adding");
      }

      // Return the complete updated applet with consistent formatting
      return {
        ...updatedApplet,
        containers: updatedApplet.containers || [],
        isDirty: true,
        isLocal: false,
        slugStatus: "unique",
      };
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to add container");
    }
  },
);

export const removeContainerThunk = createAsyncThunk<
  void,
  { appletId: string; containerId: string }
>(
  "appletBuilder/removeContainer",
  async ({ appletId, containerId }, { getState, rejectWithValue }) => {
    try {
      const applet = (getState() as WithAppletBuilder).appletBuilder.applets[appletId];
      if (!applet) {
        throw new Error("Applet not found");
      }
      const updatedContainers = applet.containers.filter(
        (c) => c.id !== containerId,
      );
      await updateCustomAppletConfig(appletId, {
        ...applet,
        containers: updatedContainers,
      });
      return undefined;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to remove container");
    }
  },
);

export const recompileContainerThunk = createAsyncThunk<
  { appletId: string; containerId: string; updatedContainer: ContainerBuilder },
  { appletId: string; containerId: string },
  { state: WithAppletBuilder }
>(
  "appletBuilder/recompileContainer",
  async ({ appletId, containerId }, { getState, rejectWithValue }) => {
    try {
      const applet = (getState() as WithAppletBuilder).appletBuilder.applets[appletId];
      if (!applet) {
        throw new Error(`Applet with ID ${appletId} not found`);
      }
      const existingContainer = applet.containers.find(
        (c) => c.id === containerId,
      );
      if (!existingContainer) {
        throw new Error(
          `Container with ID ${containerId} not found in applet ${appletId}`,
        );
      }
      await recompileAllContainersInApplet(appletId); // Recompile all to ensure consistency
      const updatedApplet = await getCustomAppletConfigById(appletId);
      if (!updatedApplet) {
        throw new Error("Failed to fetch updated applet");
      }
      const updatedContainer = updatedApplet.containers.find(
        (c) => c.id === containerId,
      );
      if (!updatedContainer) {
        throw new Error(
          `Container with ID ${containerId} not found after recompilation`,
        );
      }
      return { appletId, containerId, updatedContainer };
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to recompile container");
    }
  },
);

export const recompileAppletThunk = createAsyncThunk<AppletBuilder, string>(
  "appletBuilder/recompileApplet",
  async (appletId, { rejectWithValue }) => {
    try {
      await recompileAllContainersInApplet(appletId);
      const updatedApplet = await getCustomAppletConfigById(appletId);
      if (!updatedApplet) {
        throw new Error("Failed to fetch recompiled applet");
      }
      return {
        ...updatedApplet,
        containers: updatedApplet.containers || [],
        isDirty: false,
        isLocal: false,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to recompile applet");
    }
  },
);

export const fetchAppletsThunk = createAsyncThunk<AppletBuilder[], void>(
  "appletBuilder/fetchApplets",
  async (_, { rejectWithValue }) => {
    try {
      const applets = await getAllCustomAppletConfigs();
      return applets.map((applet) => ({
        ...applet,
        containers: applet.containers || [],
        isDirty: false,
        isLocal: false,
        slugStatus: "unique",
      }));
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to fetch applets");
    }
  },
);

export const checkAppletSlugUniqueness = createAsyncThunk<
  boolean,
  { slug: string; appletId?: string },
  { state: WithAppletBuilder }
>(
  "appletBuilder/checkSlugUniqueness",
  async ({ slug, appletId }, { rejectWithValue }) => {
    try {
      const isAvailable = await isAppletSlugAvailable(slug, appletId);
      return isAvailable;
    } catch (error: any) {
      return rejectWithValue(
        error.message || "Failed to check slug uniqueness",
      );
    }
  },
);
