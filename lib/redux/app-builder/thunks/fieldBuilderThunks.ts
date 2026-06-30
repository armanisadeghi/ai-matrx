import { createAsyncThunk } from "@reduxjs/toolkit";
import type { FieldsState } from "../types";
import {
  createFieldComponent,
  updateFieldComponent,
  deleteFieldComponent,
  getAllFieldComponents,
  getFieldComponentById,
  setFieldComponentPublic,
} from "../service/fieldComponentService";
import { FieldBuilder } from "../types";
import { ContainerBuilder } from "../types";
import {
  addOrRefreshFieldInGroup,
  refreshAllFieldsInGroup,
} from "../service/fieldContainerService";
import { setActiveField } from "../fieldBuilderSyncActions";
import { getComponentTypeDefaults } from "@/features/applet/constants/field-constants";
import { v4 as uuidv4 } from "uuid";
import { normalizeFieldDefinitionWithUuid } from "@/features/applet/utils/field-normalization";

/**
 * Unified thunk for saving a field - handles both create and update
 */

type WithFieldBuilder = { fieldBuilder: FieldsState };

export const saveFieldThunk = createAsyncThunk<
  FieldBuilder,
  string,
  { state: WithFieldBuilder }
>("fieldBuilder/saveField", async (fieldId, { getState, rejectWithValue }) => {
  try {
    const field = getState().fieldBuilder.fields[fieldId] ?? null;

    if (!field) {
      throw new Error(`Field with ID ${fieldId} not found`);
    }

    let savedField: FieldBuilder;

    // Determine if this is a new field (isLocal) or an existing one
    if (field.isLocal) {
      // Create new field
      savedField = await createFieldComponent(field);
    } else {
      // Update existing field
      savedField = await updateFieldComponent(fieldId, field);
    }

    // Return consistently formatted result
    return {
      ...savedField,
      isDirty: false,
      isLocal: false,
    };
  } catch (error: any) {
    return rejectWithValue(error.message || "Failed to save field");
  }
});

/**
 * Integrated thunk to save a field and update its parent container
 */
export const saveFieldAndUpdateContainerThunk = createAsyncThunk.withTypes<{
  state: WithFieldBuilder;
}>()(
  "fieldBuilder/saveAndUpdateContainer",
  async (
    { fieldId, containerId }: { fieldId: string; containerId: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      // First save the field
      const saveResult = await dispatch(saveFieldThunk(fieldId)).unwrap();

      if (!saveResult) {
        throw new Error("Failed to save field");
      }

      // If successful, refresh the field in its container
      if (containerId) {
        // Refresh the specific field in the container and get the updated container
        const updatedContainer = await addOrRefreshFieldInGroup(
          containerId,
          saveResult.id,
        );

        // Verify we got a valid container back
        if (
          !updatedContainer ||
          typeof updatedContainer !== "object" ||
          !updatedContainer.id
        ) {
          console.error(
            "Invalid container returned from addOrRefreshFieldInGroup:",
            updatedContainer,
          );
          throw new Error("Failed to get updated container from database");
        }

        console.log("Container successfully updated:", updatedContainer);

        return {
          field: saveResult,
          containerId,
          updatedContainer,
        };
      }

      return {
        field: saveResult,
        containerId,
      };
    } catch (error: any) {
      console.error("Error in saveFieldAndUpdateContainerThunk:", error);
      return rejectWithValue(
        error.message || "Failed to save field and update container",
      );
    }
  },
);

export const createFieldThunk = createAsyncThunk<FieldBuilder, FieldBuilder>(
  "fieldBuilder/createField",
  async (field, { rejectWithValue }) => {
    try {
      const savedField = await createFieldComponent(field);
      return savedField;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

// export const updateFieldThunk = createAsyncThunk<FieldBuilder, { id: string; changes: Partial<FieldBuilder> }>(
//     "fieldBuilder/updateField",
//     async ({ id, changes }, { rejectWithValue }) => {
//         try {
//             const updatedField = await updateFieldComponent(id, {
//                 id,
//                 label: changes.label || '',
//                 component: changes.component || 'input',
//                 componentProps: changes.componentProps || {},
//                 ...changes
//             });
//             return updatedField;
//         } catch (error: any) {
//             return rejectWithValue(error.message);
//         }
//     }
// );

export const deleteFieldThunk = createAsyncThunk<void, string>(
  "fieldBuilder/deleteField",
  async (id, { rejectWithValue }) => {
    try {
      await deleteFieldComponent(id);
      return undefined;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const fetchFieldsThunk = createAsyncThunk<FieldBuilder[], void>(
  "fieldBuilder/fetchFields",
  async (_, { rejectWithValue }) => {
    try {
      return await getAllFieldComponents();
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const fetchFieldByIdThunk = createAsyncThunk<FieldBuilder, string>(
  "fieldBuilder/fetchFieldById",
  async (id, { rejectWithValue }) => {
    try {
      const field = await getFieldComponentById(id);
      if (!field) {
        throw new Error(`Field with ID ${id} not found`);
      }
      return field as FieldBuilder;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const setFieldPublicThunk = createAsyncThunk<
  void,
  { id: string; isPublic: boolean }
>(
  "fieldBuilder/setFieldPublic",
  async ({ id, isPublic }, { rejectWithValue }) => {
    try {
      await setFieldComponentPublic(id, isPublic);
      return undefined;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

/**
 * Thunk to save a field to a container
 */
export const saveFieldToContainerThunk = createAsyncThunk<
  { containerId: string; updatedContainer: ContainerBuilder },
  { containerId: string; fieldId: string },
  { state: WithFieldBuilder }
>(
  "fieldBuilder/saveFieldToContainer",
  async ({ containerId, fieldId }, { rejectWithValue }) => {
    try {
      // Refresh the field in the container and get the updated container
      const updatedContainer = await addOrRefreshFieldInGroup(
        containerId,
        fieldId,
      );

      // Return the updated container for the reducer to update state
      return {
        containerId,
        updatedContainer,
      };
    } catch (error: any) {
      console.error("Error saving field to container:", error);
      return rejectWithValue(
        error.message || "Failed to save field to container",
      );
    }
  },
);

// Define action creator for fetchFieldByIdSuccess
export const fetchFieldByIdSuccess = (field: FieldBuilder) => ({
  type: "fieldBuilder/fetchFieldByIdSuccess" as const,
  payload: field,
});

// Use this type for proper typing in the slice
export type FetchFieldByIdSuccessAction = ReturnType<
  typeof fetchFieldByIdSuccess
>;

/**
 * Thunk that sets a field as active, fetching it first if not in state
 */
export const setActiveFieldWithFetchThunk = createAsyncThunk<
  void,
  string,
  { state: WithFieldBuilder }
>(
  "fieldBuilder/setActiveFieldWithFetch",
  async (fieldId, { getState, dispatch, rejectWithValue }) => {
    try {
      // Check if field already exists in state
      const field = getState().fieldBuilder.fields[fieldId] ?? null;

      if (field) {
        // If it exists, just set it as active
        dispatch(setActiveField(fieldId));
      } else {
        // Otherwise, fetch it first
        try {
          const fetchedField = await getFieldComponentById(fieldId);

          if (fetchedField) {
            // Add the fetched field to state with required type properties
            dispatch(
              fetchFieldByIdSuccess({
                ...fetchedField,
                isDirty: false,
                isLocal: false,
              }),
            );

            // Set it as active
            dispatch(setActiveField(fieldId));
          } else {
            console.error(`Field with ID ${fieldId} not found on server`);
            dispatch(setActiveField(null));
          }
        } catch (error: any) {
          console.error(
            `Failed to fetch field with ID ${fieldId}: ${error.message}`,
          );
          dispatch(setActiveField(null));
          return rejectWithValue(error.message || "Failed to fetch field");
        }
      }
      return undefined;
    } catch (error: any) {
      console.error(`Error in setActiveFieldWithFetchThunk: ${error.message}`);
      return rejectWithValue(error.message || "Failed to set active field");
    }
  },
);
