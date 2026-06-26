import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Viewport } from "@xyflow/react";
import {
  BrokerDestination,
  BrokerSourceConfig,
  Dependency,
  InputMapping,
  Output,
  Workflow,
  WorkflowMetadata,
  WorkflowState,
} from "./types";
import {
  fetchAllWorkflows,
  fetchOneWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  fetchOneWorkflowWithNodes,
  saveWorkflowWithNodes,
} from "./thunks";

export const DEFAULT_WORKFLOW: Omit<
  Workflow,
  "id" | "created_at" | "updated_at" | "user_id" | "version"
> = {
  name: "",
  description: null,
  workflow_type: null,
  inputs: null,
  outputs: null,
  dependencies: null,
  sources: null,
  destinations: null,
  actions: null,
  category: null,
  tags: null,
  is_active: true,
  is_deleted: false,
  auto_execute: false,
  metadata: null,
  viewport: null,
  is_public: false,
  public_read: false,
  organization_id: null,
};

const initialState: WorkflowState = {
  entities: {},
  ids: [],
  activeId: null,
  selectedIds: [],
  isDirty: {},
  isLoading: false,
  error: null,
  fetchTimestamp: null,
  dataFetched: false,
};

const workflowSlice = createSlice({
  name: "workflows",
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
      action: PayloadAction<{ id: string; field: keyof Workflow; value: any }>,
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
        state.entities[id].inputs!.push(input);
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

    // Source Management Actions
    updateSources: (
      state,
      action: PayloadAction<{ id: string; sources: BrokerSourceConfig[] }>,
    ) => {
      const { id, sources } = action.payload;
      if (state.entities[id]) {
        state.entities[id].sources = sources;
        state.isDirty[id] = true;
      }
    },
    addSource: (
      state,
      action: PayloadAction<{ id: string; source: BrokerSourceConfig }>,
    ) => {
      const { id, source } = action.payload;
      if (state.entities[id]) {
        if (!state.entities[id].sources) {
          state.entities[id].sources = [];
        }
        state.entities[id].sources!.push(source);
        state.isDirty[id] = true;
      }
    },
    removeSource: (
      state,
      action: PayloadAction<{ id: string; index: number }>,
    ) => {
      const { id, index } = action.payload;
      if (state.entities[id] && state.entities[id].sources) {
        state.entities[id].sources!.splice(index, 1);
        state.isDirty[id] = true;
      }
    },
    removeSourceByBrokerId: (
      state,
      action: PayloadAction<{ id: string; brokerId: string }>,
    ) => {
      const { id, brokerId } = action.payload;
      if (state.entities[id] && state.entities[id].sources) {
        state.entities[id].sources = state.entities[id].sources!.filter(
          (source) => source.brokerId !== brokerId,
        );
        state.isDirty[id] = true;
      }
    },
    updateSourceItem: (
      state,
      action: PayloadAction<{
        id: string;
        index: number;
        source: BrokerSourceConfig;
      }>,
    ) => {
      const { id, index, source } = action.payload;
      if (
        state.entities[id] &&
        state.entities[id].sources &&
        state.entities[id].sources![index]
      ) {
        state.entities[id].sources![index] = source;
        state.isDirty[id] = true;
      }
    },

    // Destination Management Actions
    updateDestinations: (
      state,
      action: PayloadAction<{ id: string; destinations: BrokerDestination[] }>,
    ) => {
      const { id, destinations } = action.payload;
      if (state.entities[id]) {
        state.entities[id].destinations = destinations;
        state.isDirty[id] = true;
      }
    },
    addDestination: (
      state,
      action: PayloadAction<{ id: string; destination: BrokerDestination }>,
    ) => {
      const { id, destination } = action.payload;
      if (state.entities[id]) {
        if (!state.entities[id].destinations) {
          state.entities[id].destinations = [];
        }
        state.entities[id].destinations!.push(destination);
        state.isDirty[id] = true;
      }
    },
    removeDestination: (
      state,
      action: PayloadAction<{ id: string; index: number }>,
    ) => {
      const { id, index } = action.payload;
      if (state.entities[id] && state.entities[id].destinations) {
        state.entities[id].destinations!.splice(index, 1);
        state.isDirty[id] = true;
      }
    },
    updateDestinationItem: (
      state,
      action: PayloadAction<{
        id: string;
        index: number;
        destination: BrokerDestination;
      }>,
    ) => {
      const { id, index, destination } = action.payload;
      if (
        state.entities[id] &&
        state.entities[id].destinations &&
        state.entities[id].destinations![index]
      ) {
        state.entities[id].destinations![index] = destination;
        state.isDirty[id] = true;
      }
    },

    // Metadata and Viewport Actions
    updateMetadata: (
      state,
      action: PayloadAction<{ id: string; metadata: WorkflowMetadata }>,
    ) => {
      const { id, metadata } = action.payload;
      if (state.entities[id]) {
        state.entities[id].metadata = metadata;
        state.isDirty[id] = true;
      }
    },
    updateViewport: (
      state,
      action: PayloadAction<{ id: string; viewport: Viewport }>,
    ) => {
      const { id, viewport } = action.payload;
      if (state.entities[id]) {
        state.entities[id].viewport = viewport;
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
    setAll: (state, action: PayloadAction<Workflow[]>) => {
      const workflows = action.payload;
      state.entities = {};
      state.ids = [];
      workflows.forEach((workflow) => {
        state.entities[workflow.id] = workflow;
        state.ids.push(workflow.id);
      });
      state.fetchTimestamp = Date.now();
      state.dataFetched = true;
    },
    reset: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch All
      .addCase(fetchAllWorkflows.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAllWorkflows.fulfilled, (state, action) => {
        state.isLoading = false;
        const workflows = action.payload;
        state.entities = {};
        state.ids = [];
        workflows.forEach((workflow) => {
          state.entities[workflow.id] = workflow;
          state.ids.push(workflow.id);
        });
        state.fetchTimestamp = Date.now();
        state.dataFetched = true;
      })
      .addCase(fetchAllWorkflows.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to fetch workflows";
      })
      // Fetch One
      .addCase(fetchOneWorkflow.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOneWorkflow.fulfilled, (state, action) => {
        state.isLoading = false;
        const workflow = action.payload;
        state.entities[workflow.id] = workflow;
        if (!state.ids.includes(workflow.id)) {
          state.ids.push(workflow.id);
        }
        state.fetchTimestamp = Date.now();
      })
      .addCase(fetchOneWorkflow.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to fetch workflow";
      })
      // Create
      .addCase(createWorkflow.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createWorkflow.fulfilled, (state, action) => {
        state.isLoading = false;
        const workflow = action.payload;
        state.entities[workflow.id] = workflow;
        state.ids.push(workflow.id);
        state.activeId = workflow.id;
        delete state.isDirty[workflow.id];
      })
      .addCase(createWorkflow.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to create workflow";
      })
      // Update
      .addCase(updateWorkflow.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateWorkflow.fulfilled, (state, action) => {
        state.isLoading = false;
        const workflow = action.payload;
        state.entities[workflow.id] = workflow;
        delete state.isDirty[workflow.id];
      })
      .addCase(updateWorkflow.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to update workflow";
      })
      // Delete
      .addCase(deleteWorkflow.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteWorkflow.fulfilled, (state, action) => {
        state.isLoading = false;
        const workflowId = action.payload;
        delete state.entities[workflowId];
        state.ids = state.ids.filter((id) => id !== workflowId);
        if (state.activeId === workflowId) {
          state.activeId = null;
        }
        state.selectedIds = state.selectedIds.filter((id) => id !== workflowId);
        delete state.isDirty[workflowId];
      })
      .addCase(deleteWorkflow.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to delete workflow";
      })
      // Fetch One With Nodes
      .addCase(fetchOneWorkflowWithNodes.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOneWorkflowWithNodes.fulfilled, (state, action) => {
        state.isLoading = false;
        const workflow = action.payload;
        state.entities[workflow.id] = workflow;
        if (!state.ids.includes(workflow.id)) {
          state.ids.push(workflow.id);
        }
        state.fetchTimestamp = Date.now();
      })
      .addCase(fetchOneWorkflowWithNodes.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.error.message || "Failed to fetch workflow with nodes";
      })
      // Save With Nodes
      .addCase(saveWorkflowWithNodes.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveWorkflowWithNodes.fulfilled, (state, action) => {
        state.isLoading = false;
        const workflow = action.payload;
        state.entities[workflow.id] = workflow;
        delete state.isDirty[workflow.id];
      })
      .addCase(saveWorkflowWithNodes.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.error.message || "Failed to save workflow with nodes";
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

  // Input Management
  updateInputs,
  addInput,
  removeInput,
  updateInputItem,

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

  // Source Management
  updateSources,
  addSource,
  removeSource,
  removeSourceByBrokerId,
  updateSourceItem,

  // Destination Management
  updateDestinations,
  addDestination,
  removeDestination,
  updateDestinationItem,

  // Metadata and Viewport
  updateMetadata,
  updateViewport,
} = workflowSlice.actions;

// Export just the slice actions
export const workflowActions = workflowSlice.actions;

export default workflowSlice.reducer;
