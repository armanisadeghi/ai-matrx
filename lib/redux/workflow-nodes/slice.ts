import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  WorkflowNode,
  WorkflowNodeMetadata,
  WorkflowNodeState,
  WorkflowNodeUiData,
  WorkflowNodeStatus,
} from "./types";
import {
  InputMapping,
  Output,
  Dependency,
  NodeInputType,
} from "../workflow/types";
import {
  fetchAllWorkflowNodes,
  fetchOneWorkflowNode,
  fetchWorkflowNodesByWorkflowId,
  createWorkflowNode,
  updateWorkflowNode,
  deleteWorkflowNode,
  duplicateWorkflowNode,
} from "./thunks";
import { NodeInput } from "@/features/workflows-xyflow/nodes/base/NodeHandles";

export const DEFAULT_WORKFLOW_NODE: Omit<
  WorkflowNode,
  "id" | "created_at" | "updated_at" | "user_id"
> = {
  workflow_id: null,
  function_id: null,
  function_type: null,
  type: null,
  step_name: null,
  node_type: null,
  status: null,
  execution_required: false,
  arguments: null,
  inputs: null,
  outputs: null,
  dependencies: null,
  is_active: true,
  metadata: null,
  ui_data: null,
  is_public: false,
  public_read: true,
};

const initialState: WorkflowNodeState = {
  entities: {},
  ids: [],
  activeId: null,
  selectedIds: [],
  isDirty: {},
  status: {},
  results: {},
  isLoading: false,
  error: null,
  fetchTimestamp: null,
  dataFetched: false,
};

// Helper function to upsert inputs based on arg_name
const upsertInputs = (
  existingInputs: InputMapping[],
  newInputs: InputMapping[],
): InputMapping[] => {
  const result = [...existingInputs];

  newInputs.forEach((newInput) => {
    const argName = newInput.arg_name;

    // If arg_name is empty string, null, or undefined, always add as new input
    if (argName === "" || argName === null || argName === undefined) {
      result.push(newInput);
      return;
    }

    // Find existing input with the same arg_name
    const existingIndex = result.findIndex(
      (input) => input.arg_name === argName,
    );

    if (existingIndex !== -1) {
      // Update existing input with new fields
      result[existingIndex] = { ...result[existingIndex], ...newInput };
    } else {
      // Add new input
      result.push(newInput);
    }
  });

  return result;
};

const workflowNodeSlice = createSlice({
  name: "workflowNodes",
  initialState,
  reducers: {
    setActive: (state, action: PayloadAction<string | null>) => {
      state.activeId = action.payload;
    },
    setSelected: (state, action: PayloadAction<string[]>) => {
      state.selectedIds = action.payload;
    },
    updateField: (
      state,
      action: PayloadAction<{
        id: string;
        field: keyof WorkflowNode;
        value: any;
      }>,
    ) => {
      const { id, field, value } = action.payload;
      if (state.entities[id]) {
        (state.entities[id] as any)[field] = value;
        state.isDirty[id] = true;
      }
    },

    // Input Management Actions
    updateInputs: (
      state,
      action: PayloadAction<{ id: string; inputs: InputMapping[] }>,
    ) => {
      const { id, inputs } = action.payload;
      if (state.entities[id]) {
        state.entities[id].inputs = inputs;
        state.isDirty[id] = true;
      }
    },
    addInput: (
      state,
      action: PayloadAction<{ id: string; input: InputMapping }>,
    ) => {
      const { id, input } = action.payload;
      if (state.entities[id]) {
        if (!state.entities[id].inputs) {
          state.entities[id].inputs = [];
        }

        // Upsert the input (update if exists, add if new)
        state.entities[id].inputs = upsertInputs(state.entities[id].inputs!, [
          input,
        ]);
        state.isDirty[id] = true;
      }
    },
    addInputs: (
      state,
      action: PayloadAction<{
        id: string;
        inputs: InputMapping | InputMapping[];
      }>,
    ) => {
      const { id, inputs } = action.payload;
      if (state.entities[id]) {
        if (!state.entities[id].inputs) {
          state.entities[id].inputs = [];
        }

        const inputsToAdd = Array.isArray(inputs) ? inputs : [inputs];
        state.entities[id].inputs = upsertInputs(
          state.entities[id].inputs!,
          inputsToAdd,
        );
        state.isDirty[id] = true;
      }
    },

    removeInput: (
      state,
      action: PayloadAction<{ id: string; index: number }>,
    ) => {
      const { id, index } = action.payload;
      if (state.entities[id] && state.entities[id].inputs) {
        state.entities[id].inputs!.splice(index, 1);
        state.isDirty[id] = true;
      }
    },
    updateInputItem: (
      state,
      action: PayloadAction<{ id: string; index: number; input: InputMapping }>,
    ) => {
      const { id, index, input } = action.payload;
      if (
        state.entities[id] &&
        state.entities[id].inputs &&
        state.entities[id].inputs![index]
      ) {
        state.entities[id].inputs![index] = input;
        state.isDirty[id] = true;
      }
    },
    updateNodeInputByArgName: (
      state,
      action: PayloadAction<{
        nodeId: string;
        argName: string;
        updates: Partial<InputMapping>;
      }>,
    ) => {
      const { nodeId, argName, updates } = action.payload;
      const node = state.entities[nodeId];
      if (node && node.inputs) {
        const input = node.inputs.find((input) => input.arg_name === argName);
        if (input) {
          Object.assign(input, updates);
          state.isDirty[nodeId] = true;
        }
      }
    },
    updateInputValue: (
      state,
      action: PayloadAction<{
        nodeId: string;
        inputId: string;
        value: any;
        inputType: string;
      }>,
    ) => {
      const { nodeId, inputId, value, inputType } = action.payload;
      const node = state.entities[nodeId];
      if (node) {
        if (!node.inputs) {
          node.inputs = [];
        }

        // Find existing input or create new one
        let input = node.inputs.find((input) => input.arg_name === inputId);
        if (!input) {
          input = {
            type: inputType as NodeInputType,
            arg_name: inputId,
            default_value: value,
            ready: true,
            metadata: {},
          };
          node.inputs.push(input);
        } else {
          input.default_value = value;
        }

        state.isDirty[nodeId] = true;
      }
    },

    // Output Management Actions
    updateOutputs: (
      state,
      action: PayloadAction<{ id: string; outputs: Output[] }>,
    ) => {
      const { id, outputs } = action.payload;
      if (state.entities[id]) {
        state.entities[id].outputs = outputs;
        state.isDirty[id] = true;
      }
    },
    addOutput: (
      state,
      action: PayloadAction<{ id: string; output: Output }>,
    ) => {
      const { id, output } = action.payload;
      if (state.entities[id]) {
        if (!state.entities[id].outputs) {
          state.entities[id].outputs = [];
        }
        state.entities[id].outputs!.push(output);
        state.isDirty[id] = true;
      }
    },
    removeOutput: (
      state,
      action: PayloadAction<{ id: string; index: number }>,
    ) => {
      const { id, index } = action.payload;
      if (state.entities[id] && state.entities[id].outputs) {
        state.entities[id].outputs!.splice(index, 1);
        state.isDirty[id] = true;
      }
    },
    updateOutputItem: (
      state,
      action: PayloadAction<{ id: string; index: number; output: Output }>,
    ) => {
      const { id, index, output } = action.payload;
      if (
        state.entities[id] &&
        state.entities[id].outputs &&
        state.entities[id].outputs![index]
      ) {
        state.entities[id].outputs![index] = output;
        state.isDirty[id] = true;
      }
    },

    addOrUpdateOutput: (
      state,
      action: PayloadAction<{ id: string; output: Output }>,
    ) => {
      const { id, output } = action.payload;
      if (state.entities[id]) {
        if (!state.entities[id].outputs) {
          state.entities[id].outputs = [];
        }

        const brokerId = output.broker_id;
        if (brokerId) {
          const existingOutputIndex = state.entities[id].outputs!.findIndex(
            (o) => o.broker_id === brokerId,
          );
          if (existingOutputIndex !== -1) {
            state.entities[id].outputs![existingOutputIndex] = output;
          } else {
            state.entities[id].outputs!.push(output);
          }
        } else {
          state.entities[id].outputs!.push(output);
        }

        state.isDirty[id] = true;
      }
    },

    // Dependency Management Actions
    updateDependencies: (
      state,
      action: PayloadAction<{ id: string; dependencies: Dependency[] }>,
    ) => {
      const { id, dependencies } = action.payload;
      if (state.entities[id]) {
        state.entities[id].dependencies = dependencies;
        state.isDirty[id] = true;
      }
    },
    addDependency: (
      state,
      action: PayloadAction<{ id: string; dependency: Dependency }>,
    ) => {
      const { id, dependency } = action.payload;
      if (state.entities[id]) {
        if (!state.entities[id].dependencies) {
          state.entities[id].dependencies = [];
        }
        state.entities[id].dependencies!.push(dependency);
        state.isDirty[id] = true;
      }
    },
    clearDependencies: (state, action: PayloadAction<{ id: string }>) => {
      const { id } = action.payload;
      if (state.entities[id]) {
        state.entities[id].dependencies = [];
        state.isDirty[id] = true;
      }
    },
    removeDependency: (
      state,
      action: PayloadAction<{ id: string; index: number }>,
    ) => {
      const { id, index } = action.payload;
      if (state.entities[id] && state.entities[id].dependencies) {
        state.entities[id].dependencies!.splice(index, 1);
        state.isDirty[id] = true;
      }
    },
    updateDependencyItem: (
      state,
      action: PayloadAction<{
        id: string;
        index: number;
        dependency: Dependency;
      }>,
    ) => {
      const { id, index, dependency } = action.payload;
      if (
        state.entities[id] &&
        state.entities[id].dependencies &&
        state.entities[id].dependencies![index]
      ) {
        state.entities[id].dependencies![index] = dependency;
        state.isDirty[id] = true;
      }
    },

    // Metadata and UI Data Actions
    updateMetadata: (
      state,
      action: PayloadAction<{ id: string; metadata: WorkflowNodeMetadata }>,
    ) => {
      const { id, metadata } = action.payload;
      if (state.entities[id]) {
        state.entities[id].metadata = metadata;
        state.isDirty[id] = true;
      }
    },
    addInputsToNodeDefinition: (
      state,
      action: PayloadAction<{ id: string; inputs: NodeInput[] }>,
    ) => {
      const { id, inputs } = action.payload;
      const entity = state.entities[id];
      if (entity) {
        if (!entity.metadata) entity.metadata = {};
        if (!entity.metadata.nodeDefinition)
          entity.metadata.nodeDefinition = {};
        const existing = entity.metadata.nodeDefinition.inputs;
        const existingArr = Array.isArray(existing) ? existing : [];
        entity.metadata.nodeDefinition.inputs = [...existingArr, ...inputs];
        state.isDirty[id] = true;
      }
    },
    updateUiData: (
      state,
      action: PayloadAction<{ id: string; ui_data: WorkflowNodeUiData }>,
    ) => {
      const { id, ui_data } = action.payload;
      if (state.entities[id]) {
        state.entities[id].ui_data = ui_data;
        state.isDirty[id] = true;
      }
    },

    // General State Management
    setDirty: (
      state,
      action: PayloadAction<{ id: string; isDirty: boolean }>,
    ) => {
      const { id, isDirty } = action.payload;
      state.isDirty[id] = isDirty;
    },
    clearDirty: (state, action: PayloadAction<string>) => {
      delete state.isDirty[action.payload];
    },

    // Status Management
    setStatus: (
      state,
      action: PayloadAction<{ id: string; status: WorkflowNodeStatus }>,
    ) => {
      const { id, status } = action.payload;
      state.status[id] = status;
    },
    clearStatus: (state, action: PayloadAction<string>) => {
      delete state.status[action.payload];
    },

    // Results Management
    setResults: (
      state,
      action: PayloadAction<{ id: string; results: any }>,
    ) => {
      const { id, results } = action.payload;
      state.results[id] = results;
    },
    clearResults: (state, action: PayloadAction<string>) => {
      delete state.results[action.payload];
    },
    setAll: (state, action: PayloadAction<WorkflowNode[]>) => {
      const nodes = action.payload;
      state.entities = {};
      state.ids = [];
      nodes.forEach((node) => {
        state.entities[node.id] = node;
        state.ids.push(node.id);
        // Initialize status as pending for new nodes
        if (!state.status[node.id]) {
          state.status[node.id] = "pending";
        }
      });
      state.fetchTimestamp = Date.now();
      state.dataFetched = true;
    },
    reset: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch All
      .addCase(fetchAllWorkflowNodes.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAllWorkflowNodes.fulfilled, (state, action) => {
        state.isLoading = false;
        const nodes = action.payload;
        state.entities = {};
        state.ids = [];
        nodes.forEach((node) => {
          state.entities[node.id] = node;
          state.ids.push(node.id);
          // Initialize status as pending for new nodes
          if (!state.status[node.id]) {
            state.status[node.id] = "pending";
          }
        });
        state.fetchTimestamp = Date.now();
        state.dataFetched = true;
      })
      .addCase(fetchAllWorkflowNodes.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to fetch workflow nodes";
      })
      // Fetch One
      .addCase(fetchOneWorkflowNode.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOneWorkflowNode.fulfilled, (state, action) => {
        state.isLoading = false;
        const node = action.payload;
        state.entities[node.id] = node;
        if (!state.ids.includes(node.id)) {
          state.ids.push(node.id);
        }
        // Initialize status as pending for new nodes
        if (!state.status[node.id]) {
          state.status[node.id] = "pending";
        }
        state.fetchTimestamp = Date.now();
      })
      .addCase(fetchOneWorkflowNode.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to fetch workflow node";
      })
      // Fetch By Workflow ID
      .addCase(fetchWorkflowNodesByWorkflowId.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchWorkflowNodesByWorkflowId.fulfilled, (state, action) => {
        state.isLoading = false;
        const nodes = action.payload;
        // Update existing entities and add new ones
        nodes.forEach((node) => {
          state.entities[node.id] = node;
          if (!state.ids.includes(node.id)) {
            state.ids.push(node.id);
          }
          // Initialize status as pending for new nodes
          if (!state.status[node.id]) {
            state.status[node.id] = "pending";
          }
        });
        state.fetchTimestamp = Date.now();
      })
      .addCase(fetchWorkflowNodesByWorkflowId.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to fetch workflow nodes";
      })
      // Create
      .addCase(createWorkflowNode.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createWorkflowNode.fulfilled, (state, action) => {
        state.isLoading = false;
        const node = action.payload;
        state.entities[node.id] = node;
        state.ids.push(node.id);
        state.activeId = node.id;
        // Initialize status as pending for new nodes
        state.status[node.id] = "pending";
        delete state.isDirty[node.id];
      })
      .addCase(createWorkflowNode.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to create workflow node";
      })
      // Update
      .addCase(updateWorkflowNode.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateWorkflowNode.fulfilled, (state, action) => {
        state.isLoading = false;
        const node = action.payload;
        state.entities[node.id] = node;
        delete state.isDirty[node.id];
      })
      .addCase(updateWorkflowNode.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to update workflow node";
      })
      // Delete
      .addCase(deleteWorkflowNode.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteWorkflowNode.fulfilled, (state, action) => {
        state.isLoading = false;
        const nodeId = action.payload;
        delete state.entities[nodeId];
        state.ids = state.ids.filter((id) => id !== nodeId);
        if (state.activeId === nodeId) {
          state.activeId = null;
        }
        state.selectedIds = state.selectedIds.filter((id) => id !== nodeId);
        delete state.isDirty[nodeId];
        delete state.status[nodeId];
        delete state.results[nodeId];
      })
      .addCase(deleteWorkflowNode.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to delete workflow node";
      })
      // Duplicate
      .addCase(duplicateWorkflowNode.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(duplicateWorkflowNode.fulfilled, (state, action) => {
        state.isLoading = false;
        const node = action.payload;
        state.entities[node.id] = node;
        state.ids.push(node.id);
        state.activeId = node.id;
        // Initialize status as pending for new nodes
        state.status[node.id] = "pending";
        delete state.isDirty[node.id];
      })
      .addCase(duplicateWorkflowNode.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.error.message || "Failed to duplicate workflow node";
      });
  },
});

export const {
  // General State Management
  setActive,
  setSelected,
  updateField,
  setDirty,
  clearDirty,
  setAll,
  reset,

  // Status Management
  setStatus,
  clearStatus,

  // Results Management
  setResults,
  clearResults,

  // Input Management
  updateInputs,
  addInput,
  addInputs,
  removeInput,
  updateInputItem,
  updateInputValue,
  updateNodeInputByArgName,

  // Output Management
  updateOutputs,
  addOutput,
  removeOutput,
  updateOutputItem,

  // Dependency Management
  updateDependencies,
  addDependency,
  removeDependency,
  updateDependencyItem,
  clearDependencies,

  // Metadata and UI Data
  updateMetadata,
  updateUiData,
} = workflowNodeSlice.actions;

// Combined actions object that includes both slice actions and thunks
export const workflowNodesActions = {
  // Slice actions
  ...workflowNodeSlice.actions,

  // Thunks
  fetchAllWorkflowNodes,
  fetchOneWorkflowNode,
  fetchWorkflowNodesByWorkflowId,
  createWorkflowNode,
  updateWorkflowNode,
  deleteWorkflowNode,
  duplicateWorkflowNode,
};

export default workflowNodeSlice.reducer;
