import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  createComponentGroup,
  updateComponentGroup,
  deleteComponentGroup,
  addFieldToGroup,
  removeFieldFromGroup,
  addOrRefreshFieldInGroup,
  refreshAllFieldsInGroup,
  getAllComponentGroups,
  getComponentGroupById,
} from "../service/fieldContainerService";
import { ContainerBuilder } from "../types";
import { v4 as uuidv4 } from "uuid";
import { selectContainerById } from "../selectors/containerSelectors";
import {
  addContainersToApplet,
  recompileContainerInAppletById,
  recompileAllContainersInApplet,
} from "../service/customAppletService";
import { FieldDefinition } from "@/types/customAppTypes";
import { saveFieldAndUpdateContainerThunk } from "./fieldBuilderThunks";

/**
 * Unified thunk for saving a container - handles both create and update
 */

import type { ContainersState } from "../types";

type WithContainerBuilder = { containerBuilder: ContainersState };

export const saveContainerThunk = createAsyncThunk<
  ContainerBuilder,
  string,
  { state: WithContainerBuilder }
>(
  "containerBuilder/saveContainer",
  async (containerId, { getState, rejectWithValue }) => {
    try {
      const container = selectContainerById(getState(), containerId);

      // console.log("saveContainerThunk container", JSON.stringify(container, null, 2));

      if (!container) {
        throw new Error(`Container with ID ${containerId} not found`);
      }

      let savedContainer;

      // Determine if this is a new container (isLocal) or an existing one
      if (container.isLocal) {
        // Create new container
        savedContainer = await createComponentGroup(container);
        // console.log("saveContainerThunk savedContainer", JSON.stringify(savedContainer, null, 2));
      } else {
        // Update existing container
        savedContainer = await updateComponentGroup(containerId, container);
        // console.log("saveContainerThunk savedContainer", JSON.stringify(savedContainer, null, 2));
      }

      // Return consistently formatted result
      return {
        ...savedContainer,
        fields: savedContainer.fields || [],
        isDirty: false,
        isLocal: false,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to save container");
    }
  },
);

/**
 * Integrated thunk to save a container and update its parent applet
 */
export const saveContainerAndUpdateAppletThunk = createAsyncThunk.withTypes<{
  state: WithContainerBuilder;
}>()(
  "containerBuilder/saveAndUpdateApplet",
  async (
    { containerId, appletId }: { containerId: string; appletId: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      // First save the container
      const saveResult = await dispatch(
        saveContainerThunk(containerId),
      ).unwrap();

      if (!saveResult) {
        throw new Error("Failed to save container");
      }

      // If successful, add/update the container in the applet and recompile
      if (appletId) {
        // Add the container to the applet if needed
        await addContainersToApplet(appletId, [saveResult.id]);

        // Recompile the specific container in the applet
        await recompileContainerInAppletById(appletId, saveResult.id);
      }

      return {
        container: saveResult,
        appletId,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.message || "Failed to save container and update applet",
      );
    }
  },
);

// Create a new container
export const createContainerThunk = createAsyncThunk<
  ContainerBuilder,
  Partial<ContainerBuilder>,
  { state: WithContainerBuilder }
>(
  "containerBuilder/createContainer",
  async (containerData, { rejectWithValue }) => {
    try {
      // If no ID is provided, generate a unique ID using uuid v4
      const container = {
        ...containerData,
        id: containerData.id || uuidv4(),
        fields: containerData.fields || [],
      };

      const result = await createComponentGroup(container as ContainerBuilder);
      return {
        ...result,
        fields: result.fields || [],
        isDirty: false,
        isLocal: false,
      };
    } catch (error: any) {
      console.error("Error creating container:", error);
      return rejectWithValue(error.message || "Failed to create container");
    }
  },
);

// Update an existing container
export const updateContainerThunk = createAsyncThunk<
  ContainerBuilder,
  { id: string; changes: Partial<ContainerBuilder> },
  { state: WithContainerBuilder }
>(
  "containerBuilder/updateContainer",
  async ({ id, changes }, { getState, rejectWithValue }) => {
    try {
      // Get the current container from state
      const currentContainer = selectContainerById(getState(), id);

      if (!currentContainer) {
        throw new Error(`Container with ID ${id} not found`);
      }

      // Merge changes with current container data
      const updatedContainer = {
        ...currentContainer,
        ...changes,
      };

      const result = await updateComponentGroup(id, updatedContainer);
      return {
        ...result,
        fields: result.fields || [],
        isDirty: false,
        isLocal: false,
      };
    } catch (error: any) {
      console.error("Error updating container:", error);
      return rejectWithValue(error.message || "Failed to update container");
    }
  },
);

// Delete a container
export const deleteContainerThunk = createAsyncThunk<
  void,
  string,
  { state: WithContainerBuilder }
>(
  "containerBuilder/deleteContainer",
  async (containerId, { rejectWithValue }) => {
    try {
      await deleteComponentGroup(containerId);
      return undefined;
    } catch (error: any) {
      console.error("Error deleting container:", error);
      return rejectWithValue(error.message || "Failed to delete container");
    }
  },
);

// Add a field to a container
export const addFieldAndCompileContainerThunk = createAsyncThunk<
  { containerId: string; field: FieldDefinition },
  { containerId: string; field: FieldDefinition },
  { state: WithContainerBuilder }
>(
  "containerBuilder/addField",
  async ({ containerId, field }, { getState, rejectWithValue }) => {
    try {
      // Add field ID if not provided
      const fieldWithId = {
        ...field,
        id: field.id || uuidv4(),
      };

      // Add the field to the container
      await addFieldToGroup(containerId, fieldWithId.id);

      // // Refresh the field in the group to ensure it's properly added
      // await refreshFieldInGroup(containerId, fieldWithId.id);

      return { containerId, field: fieldWithId };
    } catch (error: any) {
      console.error("Error adding field to container:", error);
      return rejectWithValue(
        error.message || "Failed to add field to container",
      );
    }
  },
);

// Remove a field from a container
export const removeFieldThunk = createAsyncThunk<
  void,
  { containerId: string; fieldId: string },
  { state: WithContainerBuilder }
>(
  "containerBuilder/removeField",
  async ({ containerId, fieldId }, { rejectWithValue }) => {
    try {
      await removeFieldFromGroup(containerId, fieldId);
      return undefined;
    } catch (error: any) {
      console.error("Error removing field from container:", error);
      return rejectWithValue(
        error.message || "Failed to remove field from container",
      );
    }
  },
);

// Update a field within a container
export const updateFieldThunk = createAsyncThunk<
  {
    containerId: string;
    fieldId: string;
    updatedField: FieldDefinition;
    updatedContainer: ContainerBuilder;
  },
  { containerId: string; fieldId: string; changes: Partial<FieldDefinition> },
  { state: WithContainerBuilder }
>(
  "containerBuilder/updateField",
  async ({ containerId, fieldId, changes }, { getState, rejectWithValue }) => {
    try {
      // Get the current container
      const container = selectContainerById(getState(), containerId);

      if (!container) {
        throw new Error(`Container with ID ${containerId} not found`);
      }

      // Find the field to update
      const existingField = container.fields.find((f) => f.id === fieldId);

      if (!existingField) {
        throw new Error(
          `Field with ID ${fieldId} not found in container ${containerId}`,
        );
      }

      // Create the updated field
      const updatedField = {
        ...existingField,
        ...changes,
      };

      // Refresh the field to ensure consistency and get the updated container
      const updatedContainer = await addOrRefreshFieldInGroup(
        containerId,
        fieldId,
      );

      return { containerId, fieldId, updatedField, updatedContainer };
    } catch (error: any) {
      console.error("Error updating field:", error);
      return rejectWithValue(error.message || "Failed to update field");
    }
  },
);

// Recompile a container (refresh all its data from source)
export const recompileContainerThunk = createAsyncThunk<
  ContainerBuilder,
  string,
  { state: WithContainerBuilder }
>(
  "containerBuilder/recompileContainer",
  async (containerId, { rejectWithValue }) => {
    try {
      // Refresh all fields in the group
      await refreshAllFieldsInGroup(containerId);

      // Get the updated container
      const result = await getComponentGroupById(containerId);

      console.log(
        "recompileContainerThunk result",
        JSON.stringify(result, null, 2),
      );

      if (!result) {
        throw new Error("Failed to fetch recompiled container");
      }

      return result;
    } catch (error: any) {
      console.error("Error recompiling container:", error);
      return rejectWithValue(error.message || "Failed to recompile container");
    }
  },
);

// Fetch all containers
export const fetchContainersThunk = createAsyncThunk<
  ContainerBuilder[],
  void,
  { state: WithContainerBuilder }
>("containerBuilder/fetchContainers", async (_, { rejectWithValue }) => {
  try {
    const containers = await getAllComponentGroups();
    return containers;
  } catch (error: any) {
    console.error("Error fetching containers:", error);
    return rejectWithValue(error.message || "Failed to fetch containers");
  }
});

// Fetch a single container by ID
export const fetchContainerByIdThunk = createAsyncThunk<
  ContainerBuilder,
  string,
  { state: WithContainerBuilder }
>(
  "containerBuilder/fetchContainerById",
  async (containerId, { rejectWithValue }) => {
    try {
      const container = await getComponentGroupById(containerId);

      if (!container) {
        throw new Error(`Container with ID ${containerId} not found`);
      }

      return container;
    } catch (error: any) {
      console.error("Error fetching container:", error);
      return rejectWithValue(error.message || "Failed to fetch container");
    }
  },
);

// This will save OR update, but we need to make sure it's not dirty. If it's dirty, we need to save it first.
export const saveOrUpdateContainerToAppletThunk = createAsyncThunk<
  { appletId: string; updatedApplet: ContainerBuilder[] | null },
  { appletId: string; containerId: string; recompileAllFields?: boolean },
  { state: WithContainerBuilder }
>(
  "containerBuilder/saveOrUpdateContainerToApplet",
  async (
    { appletId, containerId, recompileAllFields = false },
    { getState, dispatch, rejectWithValue },
  ) => {
    try {
      const container = selectContainerById(getState(), containerId);
      // console.log("saveOrUpdateContainerToAppletThunk container", JSON.stringify(container, null, 2));

      if (!container) {
        throw new Error(`Container with ID ${containerId} not found`);
      }

      // Save the container if it's dirty
      if (container.isDirty) {
        // console.log("saveOrUpdateContainerToAppletThunk container is dirty, saving it first");
        try {
          await dispatch(saveContainerThunk(containerId)).unwrap();
        } catch (error: any) {
          throw new Error(
            `Failed to save container before adding to applet: ${error.message}`,
          );
        }
      } else {
        // console.log("saveOrUpdateContainerToAppletThunk container is not dirty, skipping save");
      }

      // Recompile all fields if requested
      if (recompileAllFields) {
        try {
          await dispatch(recompileContainerThunk(containerId)).unwrap();
        } catch (error: any) {
          throw new Error(`Failed to recompile container: ${error.message}`);
        }
      }

      console.log(
        "saveOrUpdateContainerToAppletThunk adding container to applet",
        appletId,
        containerId,
      );

      const updatedApplet = await addContainersToApplet(appletId, [
        containerId,
      ]);

      console.log(
        "saveOrUpdateContainerToAppletThunk updatedApplet",
        JSON.stringify(updatedApplet, null, 2),
      );

      const updatedContainer = selectContainerById(getState(), containerId);

      console.log(
        "saveOrUpdateContainerToAppletThunk updatedContainer",
        JSON.stringify(updatedContainer, null, 2),
      );

      if (!updatedApplet) {
        throw new Error("Failed to add container to applet");
      }

      return { appletId, updatedApplet: updatedApplet.containers ?? null };
    } catch (error: any) {
      console.error("Error saving container to applet:", error);
      return rejectWithValue(
        error.message || "Failed to save container to applet",
      );
    }
  },
);

// Move a field up in the container order
export const moveFieldUpThunk = createAsyncThunk<
  { containerId: string; newFieldsOrder: FieldDefinition[] },
  { containerId: string; fieldId: string },
  { state: WithContainerBuilder }
>(
  "containerBuilder/moveFieldUp",
  async ({ containerId, fieldId }, { getState, rejectWithValue }) => {
    try {
      // Get the current container
      const container = selectContainerById(getState(), containerId);

      if (!container) {
        throw new Error(`Container with ID ${containerId} not found`);
      }

      // Find the index of the field to move
      const fieldIndex = container.fields.findIndex((f) => f.id === fieldId);

      if (fieldIndex === -1) {
        throw new Error(
          `Field with ID ${fieldId} not found in container ${containerId}`,
        );
      }

      // Can't move up if already at the top
      if (fieldIndex === 0) {
        return { containerId, newFieldsOrder: container.fields };
      }

      // Create a new array with the field moved up
      const newFieldsOrder = [...container.fields];
      const temp = newFieldsOrder[fieldIndex];
      newFieldsOrder[fieldIndex] = newFieldsOrder[fieldIndex - 1];
      newFieldsOrder[fieldIndex - 1] = temp;

      return { containerId, newFieldsOrder };
    } catch (error: any) {
      console.error("Error moving field up:", error);
      return rejectWithValue(error.message || "Failed to move field up");
    }
  },
);

// Move a field down in the container order
export const moveFieldDownThunk = createAsyncThunk<
  { containerId: string; newFieldsOrder: FieldDefinition[] },
  { containerId: string; fieldId: string },
  { state: WithContainerBuilder }
>(
  "containerBuilder/moveFieldDown",
  async ({ containerId, fieldId }, { getState, rejectWithValue }) => {
    try {
      // Get the current container
      const container = selectContainerById(getState(), containerId);

      if (!container) {
        throw new Error(`Container with ID ${containerId} not found`);
      }

      // Find the index of the field to move
      const fieldIndex = container.fields.findIndex((f) => f.id === fieldId);

      if (fieldIndex === -1) {
        throw new Error(
          `Field with ID ${fieldId} not found in container ${containerId}`,
        );
      }

      // Can't move down if already at the bottom
      if (fieldIndex === container.fields.length - 1) {
        return { containerId, newFieldsOrder: container.fields };
      }

      // Create a new array with the field moved down
      const newFieldsOrder = [...container.fields];
      const temp = newFieldsOrder[fieldIndex];
      newFieldsOrder[fieldIndex] = newFieldsOrder[fieldIndex + 1];
      newFieldsOrder[fieldIndex + 1] = temp;

      return { containerId, newFieldsOrder };
    } catch (error: any) {
      console.error("Error moving field down:", error);
      return rejectWithValue(error.message || "Failed to move field down");
    }
  },
);

// Define action creator for fetchContainerByIdSuccess
export const fetchContainerByIdSuccess = (container: ContainerBuilder) => ({
  type: "containerBuilder/fetchContainerByIdSuccess" as const,
  payload: container,
});

// Use this type for proper typing in the slice
export type FetchContainerByIdSuccessAction = ReturnType<
  typeof fetchContainerByIdSuccess
>;

/**
 * Thunk that sets a container as active, fetching it first if not in state
 */
export const setActiveContainerWithFetchThunk = createAsyncThunk<
  void,
  string,
  { state: WithContainerBuilder }
>(
  "containerBuilder/setActiveContainerWithFetch",
  async (containerId, { getState, dispatch, rejectWithValue }) => {
    try {
      // Check if container already exists in state
      const container = selectContainerById(
        getState() as WithContainerBuilder,
        containerId,
      );

      if (container) {
        // If it exists, just set it as active
        dispatch({ type: 'containerBuilder/setActiveContainer', payload: containerId });
      } else {
        // Otherwise, fetch it first
        try {
          const fetchedContainer = await getComponentGroupById(containerId);

          if (fetchedContainer) {
            // Add the fetched container to state with required type properties
            dispatch(
              fetchContainerByIdSuccess({
                ...fetchedContainer,
                isDirty: false,
                isLocal: false,
              }),
            );

            // Set it as active
            dispatch({ type: 'containerBuilder/setActiveContainer', payload: containerId });
          } else {
            console.error(
              `Container with ID ${containerId} not found on server`,
            );
            dispatch({ type: 'containerBuilder/setActiveContainer', payload: null });
          }
        } catch (error: any) {
          console.error(
            `Failed to fetch container with ID ${containerId}: ${error.message}`,
          );
          dispatch({ type: 'containerBuilder/setActiveContainer', payload: null });
          return rejectWithValue(error.message || "Failed to fetch container");
        }
      }
      return undefined;
    } catch (error: any) {
      console.error(
        `Error in setActiveContainerWithFetchThunk: ${error.message}`,
      );
      return rejectWithValue(error.message || "Failed to set active container");
    }
  },
);
