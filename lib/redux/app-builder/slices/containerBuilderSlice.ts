import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
    createContainerThunk,
    updateContainerThunk,
    deleteContainerThunk,
    addFieldAndCompileContainerThunk,
    removeFieldThunk,
    recompileContainerThunk,
    fetchContainersThunk,
    fetchContainerByIdThunk,
    updateFieldThunk,
    saveOrUpdateContainerToAppletThunk,
    moveFieldUpThunk,
    moveFieldDownThunk,
    saveContainerThunk,
    saveContainerAndUpdateAppletThunk,
    FetchContainerByIdSuccessAction,
} from "../thunks/containerBuilderThunks";
import { saveFieldAndUpdateContainerThunk, saveFieldToContainerThunk } from "../thunks/fieldBuilderThunks";
import { ContainerBuilder , ContainersState } from "../types";
import type { FieldDefinition } from "@/types/customAppTypes";
import { v4 as uuidv4 } from "uuid";

// Helper function to check if a container exists in state
const checkContainerExists = (state: ContainersState, id: string): boolean => {
    if (!state.containers[id]) {
        console.error(`Container with ID ${id} not found in state`);
        return false;
    }
    return true;
};

// Default container configuration
export const DEFAULT_CONTAINER: Partial<ContainerBuilder> = {
    label: "",
    shortLabel: "",
    description: "",
    hideDescription: false,
    helpText: "",
    fields: [],
    isPublic: true,
    authenticatedRead: true,
    publicRead: false,
    isDirty: false,
    isLocal: true,
};

// ContainersState is defined in ../types to avoid circular imports

const initialState: ContainersState = {
    containers: {},
    isLoading: false,
    error: null,
    activeContainerId: null,
    newContainerId: null,
};

export const containerBuilderSlice = createSlice({
    name: "containerBuilder",
    initialState,
    reducers: {
        // Initialize a new container
        startNewContainer: (state, action: PayloadAction<{ id: string }>) => {
            const id = action.payload.id;
            state.containers[id] = {
                ...DEFAULT_CONTAINER,
                id,
            } as ContainerBuilder;
            state.newContainerId = id;
            state.activeContainerId = id;
        },
        // Cancel creation of a local container
        cancelNewContainer: (state, action: PayloadAction<string>) => {
            const id = action.payload;

            if (state.containers[id].isLocal) {
                delete state.containers[id];
            }
            if (state.newContainerId === id) {
                state.newContainerId = null;
            }
            if (state.activeContainerId === id) {
                state.activeContainerId = null;
            }
        },
        // Set the active container for editing
        setActiveContainer: (state, action: PayloadAction<string | null>) => {
            const id = action.payload;
            if (id !== null && !state.containers[id]) {
                console.error(`Container with ID ${id} not found in state`);
            }
            state.activeContainerId = id;
        },
        // Specific actions for ContainerBuilder properties
        setLabel: (state, action: PayloadAction<{ id: string; label: string }>) => {
            const { id, label } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], label, isDirty: true };
        },
        setShortLabel: (state, action: PayloadAction<{ id: string; shortLabel?: string }>) => {
            const { id, shortLabel } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], shortLabel, isDirty: true };
        },
        setDescription: (state, action: PayloadAction<{ id: string; description?: string }>) => {
            const { id, description } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], description, isDirty: true };
        },
        setHideDescription: (state, action: PayloadAction<{ id: string; hideDescription?: boolean }>) => {
            const { id, hideDescription } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], hideDescription, isDirty: true };
        },
        setHelpText: (state, action: PayloadAction<{ id: string; helpText?: string }>) => {
            const { id, helpText } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], helpText, isDirty: true };
        },
        setIsPublic: (state, action: PayloadAction<{ id: string; isPublic?: boolean }>) => {
            const { id, isPublic } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], isPublic, isDirty: true };
        },
        setAuthenticatedRead: (state, action: PayloadAction<{ id: string; authenticatedRead?: boolean }>) => {
            const { id, authenticatedRead } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], authenticatedRead, isDirty: true };
        },
        setPublicRead: (state, action: PayloadAction<{ id: string; publicRead?: boolean }>) => {
            const { id, publicRead } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], publicRead, isDirty: true };
        },
        setIsDirty: (state, action: PayloadAction<{ id: string; isDirty?: boolean }>) => {
            const { id, isDirty } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], isDirty };
        },
        setIsLocal: (state, action: PayloadAction<{ id: string; isLocal?: boolean }>) => {
            const { id, isLocal } = action.payload;
            if (!checkContainerExists(state, id)) return;

            state.containers[id] = { ...state.containers[id], isLocal };
        },
        // Field management actions
        addField: (state, action: PayloadAction<{ containerId: string; field: FieldDefinition }>) => {
            const { containerId, field } = action.payload;
            if (!checkContainerExists(state, containerId)) return;

            state.containers[containerId].fields = [...state.containers[containerId].fields, field];
            state.containers[containerId].isDirty = true;
        },
        updateField: (state, action: PayloadAction<{ containerId: string; fieldId: string; changes: Partial<FieldDefinition> }>) => {
            const { containerId, fieldId, changes } = action.payload;
            if (!checkContainerExists(state, containerId)) return;

            const fieldIndex = state.containers[containerId].fields.findIndex((f) => f.id === fieldId);
            if (fieldIndex >= 0) {
                state.containers[containerId].fields[fieldIndex] = {
                    ...state.containers[containerId].fields[fieldIndex],
                    ...changes,
                };
                state.containers[containerId].isDirty = true;
            } else {
                console.error(`Field with ID ${fieldId} not found in container ${containerId}`);
            }
        },
        removeField: (state, action: PayloadAction<{ containerId: string; fieldId: string }>) => {
            const { containerId, fieldId } = action.payload;
            if (!checkContainerExists(state, containerId)) return;

            state.containers[containerId].fields = state.containers[containerId].fields.filter((f) => f.id !== fieldId);
            state.containers[containerId].isDirty = true;
        },
        recompileField: (state, action: PayloadAction<{ containerId: string; fieldId: string; updatedField: FieldDefinition }>) => {
            const { containerId, fieldId, updatedField } = action.payload;
            if (!checkContainerExists(state, containerId)) return;

            const fieldIndex = state.containers[containerId].fields.findIndex((f) => f.id === fieldId);
            if (fieldIndex >= 0) {
                state.containers[containerId].fields[fieldIndex] = updatedField;
                state.containers[containerId].isDirty = true;
            } else {
                console.error(`Field with ID ${fieldId} not found in container ${containerId}`);
            }
        },
        recompileAllFields: (state, action: PayloadAction<{ containerId: string; updatedFields: FieldDefinition[] }>) => {
            const { containerId, updatedFields } = action.payload;
            if (!checkContainerExists(state, containerId)) return;

            state.containers[containerId].fields = updatedFields;
            state.containers[containerId].isDirty = true;
        },
        // Other actions
        deleteContainer: (state, action: PayloadAction<string>) => {
            const id = action.payload;
            if (!checkContainerExists(state, id)) return;

            delete state.containers[id];
            if (state.activeContainerId === id) {
                state.activeContainerId = null;
            }
            if (state.newContainerId === id) {
                state.newContainerId = null;
            }
        },
        setLoading: (state, action: PayloadAction<boolean>) => {
            state.isLoading = action.payload;
        },
        setError: (state, action: PayloadAction<string | null>) => {
            state.error = action.payload;
        },
        // Create a new container in local state: THIS SHOULD NOT BE USED! Use Start new container.
        createNewContainer: (state) => {
            const newId = uuidv4();
            state.containers[newId] = {
                ...DEFAULT_CONTAINER,
                id: newId,
                isLocal: true,
            } as ContainerBuilder;
            state.newContainerId = newId;
            state.activeContainerId = newId;
        },
        startWithData: (state, action: PayloadAction<ContainerBuilder>) => {
            const container = action.payload;
            state.containers[container.id] = {
                ...container,
                isLocal: container.isLocal !== undefined ? container.isLocal : true
            };
            state.newContainerId = container.id;
            state.activeContainerId = container.id;
        },
    },
    extraReducers: (builder) => {
        // Create Container
        builder.addCase(createContainerThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(createContainerThunk.fulfilled, (state, action) => {
            state.containers[action.payload.id] = { ...action.payload, isDirty: false, isLocal: false };
            if (state.newContainerId) {
                delete state.containers[state.newContainerId];
                state.newContainerId = null;
            }
            state.activeContainerId = action.payload.id;
            state.isLoading = false;
        });
        builder.addCase(createContainerThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to create container";
        });

        // Update Container
        builder.addCase(updateContainerThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(updateContainerThunk.fulfilled, (state, action) => {
            state.containers[action.payload.id] = { ...action.payload, isDirty: false };
            state.isLoading = false;
        });
        builder.addCase(updateContainerThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to update container";
        });

        // Delete Container
        builder.addCase(deleteContainerThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(deleteContainerThunk.fulfilled, (state, action) => {
            delete state.containers[action.meta.arg];
            if (state.activeContainerId === action.meta.arg) {
                state.activeContainerId = null;
            }
            state.isLoading = false;
        });
        builder.addCase(deleteContainerThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to delete container";
        });

        // Add Field
        builder.addCase(addFieldAndCompileContainerThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(addFieldAndCompileContainerThunk.fulfilled, (state, action) => {
            const { containerId, field } = action.payload;
            if (state.containers[containerId]) {
                state.containers[containerId].fields = [...state.containers[containerId].fields, field];
                state.containers[containerId].isDirty = true;
            }
            state.isLoading = false;
        });
        builder.addCase(addFieldAndCompileContainerThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to add field";
        });

        // Remove Field
        builder.addCase(removeFieldThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(removeFieldThunk.fulfilled, (state, action) => {
            const { containerId, fieldId } = action.meta.arg;
            if (state.containers[containerId]) {
                state.containers[containerId].fields = state.containers[containerId].fields.filter((f) => f.id !== fieldId);
                state.containers[containerId].isDirty = true;
            }
            state.isLoading = false;
        });
        builder.addCase(removeFieldThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to remove field";
        });

        // Recompile Container
        builder.addCase(recompileContainerThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(recompileContainerThunk.fulfilled, (state, action) => {
            state.containers[action.payload.id] = { ...action.payload, isDirty: false, isLocal: false };
            state.isLoading = false;
        });
        builder.addCase(recompileContainerThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to recompile container";
        });

        // Fetch Containers
        builder.addCase(fetchContainersThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(fetchContainersThunk.fulfilled, (state, action) => {
            // Create a new containers object that preserves local containers
            const newContainers = action.payload.reduce((acc, container) => {
                acc[container.id] = { ...container, isDirty: false, isLocal: false };
                return acc;
            }, {} as Record<string, ContainerBuilder>);
            
            // Preserve any local containers in the current state
            Object.entries(state.containers).forEach(([id, container]) => {
                if (container.isLocal) {
                    newContainers[id] = container;
                }
            });
            
            state.containers = newContainers;
            state.isLoading = false;
        });
        builder.addCase(fetchContainersThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to fetch containers";
        });

        // Fetch Container By ID
        builder.addCase(fetchContainerByIdThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(fetchContainerByIdThunk.fulfilled, (state, action) => {
            state.containers[action.payload.id] = { ...action.payload, isDirty: false, isLocal: false };
            state.isLoading = false;
        });
        builder.addCase(fetchContainerByIdThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to fetch container";
        });

        // Update Field
        builder.addCase(updateFieldThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(updateFieldThunk.fulfilled, (state, action) => {
            const { containerId, fieldId, updatedField, updatedContainer } = action.payload;
            if (state.containers[containerId]) {
                if (updatedContainer) {
                    // Use the complete updated container from the database
                    state.containers[containerId] = {
                        ...updatedContainer,
                        isDirty: false,
                        isLocal: false
                    };
                } else {
                    // Fallback to just updating the specific field (legacy support)
                    const fieldIndex = state.containers[containerId].fields.findIndex((f) => f.id === fieldId);
                    if (fieldIndex >= 0) {
                        state.containers[containerId].fields[fieldIndex] = updatedField;
                        state.containers[containerId].isDirty = false;
                    }
                }
            }
            state.isLoading = false;
        });
        builder.addCase(updateFieldThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to update field";
        });

        // Save or Update Container To Applet
        builder.addCase(saveOrUpdateContainerToAppletThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(saveOrUpdateContainerToAppletThunk.fulfilled, (state) => {
            state.isLoading = false;
        });
        builder.addCase(saveOrUpdateContainerToAppletThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to save or update container to applet";
        });

        // Move Field Up
        builder.addCase(moveFieldUpThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(moveFieldUpThunk.fulfilled, (state, action) => {
            const { containerId, newFieldsOrder } = action.payload;
            if (state.containers[containerId]) {
                state.containers[containerId].fields = newFieldsOrder;
                state.containers[containerId].isDirty = true;
            }
            state.isLoading = false;
        });
        builder.addCase(moveFieldUpThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to move field up";
        });

        // Move Field Down
        builder.addCase(moveFieldDownThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(moveFieldDownThunk.fulfilled, (state, action) => {
            const { containerId, newFieldsOrder } = action.payload;
            if (state.containers[containerId]) {
                state.containers[containerId].fields = newFieldsOrder;
                state.containers[containerId].isDirty = true;
            }
            state.isLoading = false;
        });
        builder.addCase(moveFieldDownThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to move field down";
        });

        // Unified Save Container
        builder.addCase(saveContainerThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(saveContainerThunk.fulfilled, (state, action) => {
            const oldId = state.activeContainerId;
            const newId = action.payload.id;

            // Handle case where local ID is replaced with server ID
            if (oldId && oldId !== newId) {
                // If the saved container had a temporary ID, we need to remove the temp entry
                delete state.containers[oldId];

                // Update active and new container IDs to the new server-generated ID
                if (state.activeContainerId === oldId) {
                    state.activeContainerId = newId;
                }

                if (state.newContainerId === oldId) {
                    state.newContainerId = null; // No longer a "new" container
                }
            }

            // Update the container with server data
            state.containers[newId] = {
                ...action.payload,
                isDirty: false,
                isLocal: false,
            };

            state.isLoading = false;
        });
        builder.addCase(saveContainerThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to save container";
        });

        // Save Container to Applet and Update
        builder.addCase(saveContainerAndUpdateAppletThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(saveContainerAndUpdateAppletThunk.fulfilled, (state, action) => {
            const { container } = action.payload;
            if (container) {
                state.containers[container.id] = {
                    ...container,
                    isDirty: false,
                    isLocal: false,
                };
            }
            state.isLoading = false;
        });
        builder.addCase(saveContainerAndUpdateAppletThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to save container and update applet";
        });

        // Handle saveFieldAndUpdateContainerThunk
        builder.addCase(saveFieldAndUpdateContainerThunk.fulfilled, (state, action) => {
            const { field, containerId, updatedContainer } = action.payload;

            if (containerId && state.containers[containerId]) {
                if (updatedContainer) {
                    // Use the complete updated container from the database
                    state.containers[containerId] = {
                        ...updatedContainer,
                        isDirty: false,
                        isLocal: false
                    };
                } else if (field) {
                    // Fallback to just updating the specific field (legacy support)
                    const fieldIndex = state.containers[containerId].fields.findIndex((f) => f.id === field.id);

                    if (fieldIndex >= 0) {
                        // Update existing field
                        state.containers[containerId].fields[fieldIndex] = field;
                        state.containers[containerId].isDirty = false;
                    }
                }
            }
        });

        // Handle fetchContainerByIdSuccess (used by setActiveContainerWithFetchThunk)
        builder.addCase("containerBuilder/fetchContainerByIdSuccess", (state, action: FetchContainerByIdSuccessAction) => {
            state.containers[action.payload.id] = { ...action.payload, isDirty: false, isLocal: false };
            state.isLoading = false;
        });

        // Handle saveFieldToContainerThunk
        builder.addCase(saveFieldToContainerThunk.fulfilled, (state, action) => {
            const { containerId, updatedContainer } = action.payload;

            if (containerId && updatedContainer) {
                console.log("Updating container state with:", updatedContainer);

                // Make sure we always have a fields array
                const fields = updatedContainer.fields || [];

                // Update the container in state
                state.containers[containerId] = {
                    ...updatedContainer,
                    fields, // Ensure fields is properly populated
                    isDirty: false,
                    isLocal: false,
                };
            } else {
                console.warn("saveFieldToContainerThunk succeeded but missing data:", action.payload);
            }
        });
    },
});

export const {
    startNewContainer,
    cancelNewContainer,
    setActiveContainer,
    setLabel,
    setShortLabel,
    setDescription,
    setHideDescription,
    setHelpText,
    setIsPublic,
    setAuthenticatedRead,
    setPublicRead,
    setIsDirty,
    setIsLocal,
    addField,
    updateField,
    removeField,
    recompileField,
    recompileAllFields,
    deleteContainer,
    setLoading,
    setError,
    createNewContainer,
    startWithData,
} = containerBuilderSlice.actions;

export default containerBuilderSlice.reducer;
