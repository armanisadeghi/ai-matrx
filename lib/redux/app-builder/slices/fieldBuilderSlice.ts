import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
    createFieldThunk,
    deleteFieldThunk,
    fetchFieldsThunk,
    fetchFieldByIdThunk,
    setFieldPublicThunk,
    saveFieldThunk,
    saveFieldAndUpdateContainerThunk,
    saveFieldToContainerThunk,
    FetchFieldByIdSuccessAction
} from "../thunks/fieldBuilderThunks";
import { setActiveField } from "../fieldBuilderSyncActions";
import { FieldBuilder } from "../types";
import {
    DEFAULT_FIELD,
    FIELD_DEFAULT_COMPONENT_PROPS,
} from "@/lib/redux/app-builder/fieldBuilderDefaultProps";
import { fieldDirection, FieldOption } from "@/types/customAppTypes";
import { ComponentProps } from "@/types/customAppTypes";

export { DEFAULT_FIELD, FIELD_DEFAULT_COMPONENT_PROPS } from "@/lib/redux/app-builder/fieldBuilderDefaultProps";

// Helper function to check if a field exists in state
const checkFieldExists = (state: FieldsState, id: string): boolean => {
    if (!id) return false;
    if (!state.fields[id]) {
        console.warn(`Field with ID ${id} not found in state`);
        return false;
    }
    return true;
};

// Helper function to normalize a FieldBuilder object with defaults
const normalizeField = (field: FieldBuilder): FieldBuilder => {
    // Merge componentProps with defaults
    const normalizedComponentProps: ComponentProps = {
        ...FIELD_DEFAULT_COMPONENT_PROPS,
        ...field.componentProps,
    };

    // Merge field with defaults
    return {
        ...DEFAULT_FIELD,
        ...field,
        componentProps: normalizedComponentProps,
        isDirty: false,
        isLocal: false,
    } as FieldBuilder;
};

interface FieldsState {
    fields: Record<string, FieldBuilder>;
    isLoading: boolean;
    error: string | null;
    activeFieldId: string | null;
    newFieldId: string | null;
    hasFetched: boolean;
}

const initialState: FieldsState = {
    fields: {},
    isLoading: false,
    error: null,
    activeFieldId: null,
    newFieldId: null,
    hasFetched: false,
};

export const fieldBuilderSlice = createSlice({
    name: "fieldBuilder",
    initialState,
    reducers: {
        // Initialize a new field for creation
        startFieldCreation: (state, action: PayloadAction<{ id: string }>) => {
            const id = action.payload.id;
            state.fields[id] = {
                ...DEFAULT_FIELD,
                id,
            } as FieldBuilder;
            state.newFieldId = id;
            state.activeFieldId = id;
        },
        // Cancel creation of a local field
        cancelFieldCreation: (state, action: PayloadAction<string>) => {
            const id = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            if (state.fields[id].isLocal) {
                delete state.fields[id];
                if (state.newFieldId === id) {
                    state.newFieldId = null;
                }
                if (state.activeFieldId === id) {
                    state.activeFieldId = null;
                }
            }
        },
        // Direct actions for top-level FieldBuilder properties
        setLabel: (state, action: PayloadAction<{ id: string; label: string }>) => {
            const { id, label } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = { ...state.fields[id], label, isDirty: true };
        },
        setDescription: (state, action: PayloadAction<{ id: string; description?: string }>) => {
            const { id, description } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = {
                ...state.fields[id],
                description: description ?? state.fields[id].description,
                isDirty: true,
            };
        },
        setHelpText: (state, action: PayloadAction<{ id: string; helpText?: string }>) => {
            const { id, helpText } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = {
                ...state.fields[id],
                helpText: helpText ?? state.fields[id].helpText,
                isDirty: true,
            };
        },
        setGroup: (state, action: PayloadAction<{ id: string; group?: string }>) => {
            const { id, group } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = { ...state.fields[id], group, isDirty: true };
        },
        setIconName: (state, action: PayloadAction<{ id: string; iconName?: string }>) => {
            const { id, iconName } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = { ...state.fields[id], iconName, isDirty: true };
        },
        setComponent: (state, action: PayloadAction<{ id: string; component: FieldBuilder['component'] }>) => {
            const { id, component } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = { ...state.fields[id], component, isDirty: true };
        },
        setRequired: (state, action: PayloadAction<{ id: string; required?: boolean }>) => {
            const { id, required } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = {
                ...state.fields[id],
                required: required ?? state.fields[id].required,
                isDirty: true,
            };
        },
        setPlaceholder: (state, action: PayloadAction<{ id: string; placeholder?: string }>) => {
            const { id, placeholder } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = {
                ...state.fields[id],
                placeholder: placeholder ?? state.fields[id].placeholder,
                isDirty: true,
            };
        },
        setDefaultValue: (state, action: PayloadAction<{ id: string; defaultValue?: any }>) => {
            const { id, defaultValue } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = { ...state.fields[id], defaultValue, isDirty: true };
        },
        setComponentProps: (state, action: PayloadAction<{ id: string; componentProps: FieldBuilder['componentProps'] }>) => {
            const { id, componentProps } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = { ...state.fields[id], componentProps, isDirty: true };
        },
        setIncludeOther: (state, action: PayloadAction<{ id: string; includeOther?: boolean }>) => {
            const { id, includeOther } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = {
                ...state.fields[id],
                includeOther: includeOther ?? state.fields[id].includeOther,
                isDirty: true,
            };
        },
        setIsPublic: (state, action: PayloadAction<{ id: string; isPublic?: boolean }>) => {
            const { id, isPublic } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = { ...state.fields[id], isPublic, isDirty: true };
        },
        setIsDirty: (state, action: PayloadAction<{ id: string; isDirty?: boolean }>) => {
            const { id, isDirty } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = { ...state.fields[id], isDirty };
        },
        setIsLocal: (state, action: PayloadAction<{ id: string; isLocal?: boolean }>) => {
            const { id, isLocal } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = { ...state.fields[id], isLocal };
        },
        // Actions for ComponentProps properties
        setMin: (state, action: PayloadAction<{ id: string; min?: number }>) => {
            const { id, min } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, min: min ?? field.componentProps.min },
                isDirty: true,
            };
        },
        setMax: (state, action: PayloadAction<{ id: string; max?: number }>) => {
            const { id, max } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, max: max ?? field.componentProps.max },
                isDirty: true,
            };
        },
        setStep: (state, action: PayloadAction<{ id: string; step?: number }>) => {
            const { id, step } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, step: step ?? field.componentProps.step },
                isDirty: true,
            };
        },
        setRows: (state, action: PayloadAction<{ id: string; rows?: number }>) => {
            const { id, rows } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, rows: rows ?? field.componentProps.rows },
                isDirty: true,
            };
        },
        setMinDate: (state, action: PayloadAction<{ id: string; minDate?: string }>) => {
            const { id, minDate } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, minDate: minDate ?? field.componentProps.minDate },
                isDirty: true,
            };
        },
        setMaxDate: (state, action: PayloadAction<{ id: string; maxDate?: string }>) => {
            const { id, maxDate } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, maxDate: maxDate ?? field.componentProps.maxDate },
                isDirty: true,
            };
        },
        setOnLabel: (state, action: PayloadAction<{ id: string; onLabel?: string }>) => {
            const { id, onLabel } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, onLabel: onLabel ?? field.componentProps.onLabel },
                isDirty: true,
            };
        },
        setOffLabel: (state, action: PayloadAction<{ id: string; offLabel?: string }>) => {
            const { id, offLabel } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, offLabel: offLabel ?? field.componentProps.offLabel },
                isDirty: true,
            };
        },
        setMultiSelect: (state, action: PayloadAction<{ id: string; multiSelect?: boolean }>) => {
            const { id, multiSelect } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, multiSelect: multiSelect ?? field.componentProps.multiSelect },
                isDirty: true,
            };
        },
        setMaxItems: (state, action: PayloadAction<{ id: string; maxItems?: number }>) => {
            const { id, maxItems } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, maxItems: maxItems ?? field.componentProps.maxItems },
                isDirty: true,
            };
        },
        setMinItems: (state, action: PayloadAction<{ id: string; minItems?: number }>) => {
            const { id, minItems } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, minItems: minItems ?? field.componentProps.minItems },
                isDirty: true,
            };
        },
        setGridCols: (state, action: PayloadAction<{ id: string; gridCols?: string }>) => {
            const { id, gridCols } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, gridCols: gridCols ?? field.componentProps.gridCols },
                isDirty: true,
            };
        },
        setAutoComplete: (state, action: PayloadAction<{ id: string; autoComplete?: string }>) => {
            const { id, autoComplete } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, autoComplete: autoComplete ?? field.componentProps.autoComplete },
                isDirty: true,
            };
        },
        setDirection: (state, action: PayloadAction<{ id: string; direction?: fieldDirection }>) => {
            const { id, direction } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, direction: direction ?? field.componentProps.direction },
                isDirty: true,
            };
        },
        setCustomContent: (state, action: PayloadAction<{ id: string; customContent?: string }>) => {
            const { id, customContent } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            state.fields[id] = {
                ...state.fields[id],
                componentProps: { ...state.fields[id].componentProps, customContent },
                isDirty: true
            };
        },
        setShowSelectAll: (state, action: PayloadAction<{ id: string; showSelectAll?: boolean }>) => {
            const { id, showSelectAll } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, showSelectAll: showSelectAll ?? field.componentProps.showSelectAll },
                isDirty: true,
            };
        },
        setWidth: (state, action: PayloadAction<{ id: string; width?: string }>) => {
            const { id, width } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, width: width ?? field.componentProps.width },
                isDirty: true,
            };
        },
        setValuePrefix: (state, action: PayloadAction<{ id: string; valuePrefix?: string }>) => {
            const { id, valuePrefix } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, valuePrefix: valuePrefix ?? field.componentProps.valuePrefix },
                isDirty: true,
            };
        },
        setValueSuffix: (state, action: PayloadAction<{ id: string; valueSuffix?: string }>) => {
            const { id, valueSuffix } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, valueSuffix: valueSuffix ?? field.componentProps.valueSuffix },
                isDirty: true,
            };
        },
        setMaxLength: (state, action: PayloadAction<{ id: string; maxLength?: number }>) => {
            const { id, maxLength } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, maxLength: maxLength ?? field.componentProps.maxLength },
                isDirty: true,
            };
        },
        setSpellCheck: (state, action: PayloadAction<{ id: string; spellCheck?: boolean }>) => {
            const { id, spellCheck } = action.payload;
            if (!checkFieldExists(state, id)) return;
            const field = state.fields[id];
            state.fields[id] = {
                ...field,
                componentProps: { ...field.componentProps, spellCheck: spellCheck ?? field.componentProps.spellCheck },
                isDirty: true,
            };
        },
        // Actions for options
        addOption: (state, action: PayloadAction<{ id: string; option: FieldOption }>) => {
            const { id, option } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            const options = state.fields[id].options || [];
            state.fields[id] = { ...state.fields[id], options: [...options, option], isDirty: true };
        },
        updateOption: (state, action: PayloadAction<{ id: string; optionId: string; changes: Partial<FieldOption> }>) => {
            const { id, optionId, changes } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            if (state.fields[id].options) {
                const options = state.fields[id].options!.map((opt) =>
                    opt.id === optionId ? { ...opt, ...changes } : opt
                );
                state.fields[id] = { ...state.fields[id], options, isDirty: true };
            }
        },
        deleteOption: (state, action: PayloadAction<{ id: string; optionId: string }>) => {
            const { id, optionId } = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            if (state.fields[id].options) {
                const options = state.fields[id].options!.filter(opt => opt.id !== optionId);
                state.fields[id] = { ...state.fields[id], options, isDirty: true };
            }
        },
        // Other existing actions
        deleteField: (state, action: PayloadAction<string>) => {
            const id = action.payload;
            if (!checkFieldExists(state, id)) return;
            
            delete state.fields[id];
        },
        setLoading: (state, action: PayloadAction<boolean>) => {
            state.isLoading = action.payload;
        },
        setError: (state, action: PayloadAction<string | null>) => {
            state.error = action.payload;
        },
        startWithData: (state, action: PayloadAction<FieldBuilder>) => {
            const field = action.payload;
            state.fields[field.id] = {
                ...field,
                isLocal: field.isLocal !== undefined ? field.isLocal : true
            };
            state.newFieldId = field.id;
            state.activeFieldId = field.id;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(setActiveField, (state, action) => {
            const id = action.payload;
            if (id !== null && !state.fields[id]) {
                console.error(`Field with ID ${id} not found in state`);
            }
            state.activeFieldId = id;
        });

        // Create Field
        builder.addCase(createFieldThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(createFieldThunk.fulfilled, (state, action) => {
            state.fields[action.payload.id] = { ...action.payload, isDirty: false, isLocal: false };
            // Remove temporary field if it had a different ID
            Object.keys(state.fields).forEach((key) => {
                if (key.startsWith("temp_") && key !== action.payload.id) {
                    delete state.fields[key];
                }
            });
            state.isLoading = false;
        });
        builder.addCase(createFieldThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to create field";
        });

        // Delete Field
        builder.addCase(deleteFieldThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(deleteFieldThunk.fulfilled, (state, action) => {
            delete state.fields[action.meta.arg];
            state.isLoading = false;
        });
        builder.addCase(deleteFieldThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to delete field";
        });

        // Fetch Fields
        builder.addCase(fetchFieldsThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(fetchFieldsThunk.fulfilled, (state, action) => {
            // Create a new fields object that preserves local fields
            const newFields = action.payload.reduce((acc, field) => {
                acc[field.id] = normalizeField(field);
                return acc;
            }, {} as Record<string, FieldBuilder>);
            
            // Preserve any local fields in the current state
            Object.entries(state.fields).forEach(([id, field]) => {
                if (field.isLocal) {
                    newFields[id] = field;
                }
            });
            
            state.fields = newFields;
            state.isLoading = false;
            state.hasFetched = true;
        });
        builder.addCase(fetchFieldsThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to fetch fields";
            state.hasFetched = true;
        });

        // Fetch Field By Id
        builder.addCase(fetchFieldByIdThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(fetchFieldByIdThunk.fulfilled, (state, action) => {
            state.fields[action.payload.id] = normalizeField(action.payload);
            state.isLoading = false;
        });
        builder.addCase(fetchFieldByIdThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to fetch field";
        });

        // Set Field Public
        builder.addCase(setFieldPublicThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(setFieldPublicThunk.fulfilled, (state) => {
            state.isLoading = false;
        });
        builder.addCase(setFieldPublicThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to set field visibility";
        });

        // Unified Save Field
        builder.addCase(saveFieldThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(saveFieldThunk.fulfilled, (state, action) => {
            const oldId = state.activeFieldId;
            const newId = action.payload.id;
            
            // Handle case where local ID is replaced with server ID
            if (oldId && oldId !== newId) {
                // If the saved field had a temporary ID, we need to remove the temp entry
                delete state.fields[oldId];
                
                // Update active and new field IDs to the new server-generated ID
                if (state.activeFieldId === oldId) {
                    state.activeFieldId = newId;
                }
                
                if (state.newFieldId === oldId) {
                    state.newFieldId = null; // No longer a "new" field
                }
            }
            
            // Update the field with server data
            state.fields[newId] = { 
                ...action.payload, 
                isDirty: false, 
                isLocal: false
            };
            
            state.isLoading = false;
        });
        builder.addCase(saveFieldThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to save field";
        });

        // Save Field and Update Container
        builder.addCase(saveFieldAndUpdateContainerThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(saveFieldAndUpdateContainerThunk.fulfilled, (state, action) => {
            const { field } = action.payload;
            if (field) {
                state.fields[field.id] = {
                    ...field,
                    isDirty: false,
                    isLocal: false,
                };
            }
            state.isLoading = false;
        });
        builder.addCase(saveFieldAndUpdateContainerThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to save field and update container";
        });

        // Save Field to Container
        builder.addCase(saveFieldToContainerThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(saveFieldToContainerThunk.fulfilled, (state, action) => {
            // Only handles the field state loading status
            // The container state is updated in containerBuilderSlice
            state.isLoading = false;
        });
        builder.addCase(saveFieldToContainerThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to save field to container";
        });

        // Handle fetchFieldByIdSuccess (used by setActiveFieldWithFetchThunk)
        builder.addCase("fieldBuilder/fetchFieldByIdSuccess", (state, action: FetchFieldByIdSuccessAction) => {
            state.fields[action.payload.id] = normalizeField(action.payload);
            state.isLoading = false;
        });
    },
});

export const {
    startFieldCreation,
    cancelFieldCreation,
    setLabel,
    setDescription,
    setHelpText,
    setGroup,
    setIconName,
    setComponent,
    setRequired,
    setPlaceholder,
    setDefaultValue,
    setComponentProps,
    setIncludeOther,
    setIsPublic,
    setIsDirty,
    setIsLocal,
    setMin,
    setMax,
    setStep,
    setRows,
    setMinDate,
    setMaxDate,
    setOnLabel,
    setOffLabel,
    setMultiSelect,
    setMaxItems,
    setMinItems,
    setGridCols,
    setAutoComplete,
    setDirection,
    setCustomContent,
    setShowSelectAll,
    setWidth,
    setValuePrefix,
    setValueSuffix,
    setMaxLength,
    setSpellCheck,
    addOption,
    updateOption,
    deleteOption,
    deleteField,
    setLoading,
    setError,
    startWithData,
} = fieldBuilderSlice.actions;

export { setActiveField } from "../fieldBuilderSyncActions";

export default fieldBuilderSlice.reducer;