import {
  DbFunctionNode,
  ReactFlowUIMetadata,
  WorkflowDependency,
  ArgumentMapping,
  ArgumentOverride,
} from "@/features/workflows/types";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  asArgumentMappings,
  asArgumentOverrides,
  asStringArray,
  asWorkflowDependencies,
} from "@/features/workflows/utils/workflow-json-fields";

// Initial state for a single node
const initialNodeState = {
  id: "",
  created_at: new Date(0).toISOString(),
  updated_at: null,
  user_id: null,
  workflow_id: null,
  function_id: null,
  function_type: "registered_function",
  step_name: "Unnamed Step",
  node_type: "functionNode",
  execution_required: true,
  status: "pending",
  additional_dependencies: [],
  arg_mapping: [],
  return_broker_overrides: [],
  arg_overrides: [],
  metadata: {},
  is_public: null,
  public_read: null,
  ui_node_data: {
    position: { x: 0, y: 0 },
    type: "functionNode",
    draggable: true,
    selectable: true,
    connectable: true,
    deletable: true,
    hidden: false,
  },
};

const initialNodeStateTyped = initialNodeState as DbFunctionNode;

// State interface for the slice (managing multiple nodes)
interface DbFunctionNodeState {
  nodes: Record<string, DbFunctionNode>;
}

// Initial state for the slice
const initialState: DbFunctionNodeState = {
  nodes: {},
};

const dbFunctionNodeSlice = createSlice({
  name: "dbFunctionNode",
  initialState,
  reducers: {
    // Node-level actions
    addNode: (state, action: PayloadAction<DbFunctionNode>) => {
      state.nodes[action.payload.id] = {
        ...initialNodeStateTyped,
        ...action.payload,
      };
    },
    removeNode: (state, action: PayloadAction<string>) => {
      delete state.nodes[action.payload];
    },
    overwriteNode: (state, action: PayloadAction<DbFunctionNode>) => {
      const { id, created_at, updated_at, ...rest } = action.payload;
      state.nodes[id] = { ...state.nodes[id], ...rest };
    },

    // Individual field actions (excluding created_at and updated_at)
    updateUserId: (
      state,
      action: PayloadAction<{ id: string; user_id: string | null }>,
    ) => {
      state.nodes[action.payload.id].user_id = action.payload.user_id;
    },
    updateWorkflowId: (
      state,
      action: PayloadAction<{ id: string; workflow_id: string }>,
    ) => {
      state.nodes[action.payload.id].workflow_id = action.payload.workflow_id;
    },
    updateFunctionId: (
      state,
      action: PayloadAction<{ id: string; function_id: string }>,
    ) => {
      state.nodes[action.payload.id].function_id = action.payload.function_id;
    },
    updateFunctionType: (
      state,
      action: PayloadAction<{ id: string; function_type: string }>,
    ) => {
      state.nodes[action.payload.id].function_type =
        action.payload.function_type;
    },
    updateStepName: (
      state,
      action: PayloadAction<{ id: string; step_name: string }>,
    ) => {
      state.nodes[action.payload.id].step_name = action.payload.step_name;
    },
    updateNodeType: (
      state,
      action: PayloadAction<{ id: string; node_type: string }>,
    ) => {
      state.nodes[action.payload.id].node_type = action.payload.node_type;
    },
    updateExecutionRequired: (
      state,
      action: PayloadAction<{ id: string; execution_required: boolean }>,
    ) => {
      state.nodes[action.payload.id].execution_required =
        action.payload.execution_required;
    },
    updateStatus: (
      state,
      action: PayloadAction<{ id: string; status: string }>,
    ) => {
      state.nodes[action.payload.id].status = action.payload.status;
    },
    updateIsPublic: (
      state,
      action: PayloadAction<{ id: string; is_public: boolean }>,
    ) => {
      state.nodes[action.payload.id].is_public = action.payload.is_public;
    },
    updatePublicRead: (
      state,
      action: PayloadAction<{ id: string; public_read: boolean }>,
    ) => {
      state.nodes[action.payload.id].public_read = action.payload.public_read;
    },
    updateMetadata: (
      state,
      action: PayloadAction<{ id: string; metadata: Record<string, any> }>,
    ) => {
      state.nodes[action.payload.id].metadata = action.payload.metadata;
    },
    updateUiNodeData: (
      state,
      action: PayloadAction<{ id: string; ui_node_data: ReactFlowUIMetadata }>,
    ) => {
      state.nodes[action.payload.id].ui_node_data = action.payload.ui_node_data;
    },

    // Array field actions: additional_dependencies
    updateAdditionalDependencies: (
      state,
      action: PayloadAction<{ id: string; dependencies: WorkflowDependency[] }>,
    ) => {
      const node = state.nodes[action.payload.id];
      node.additional_dependencies = action.payload
        .dependencies as DbFunctionNode["additional_dependencies"];
    },
    addAdditionalDependency: (
      state,
      action: PayloadAction<{ id: string; dependency: WorkflowDependency }>,
    ) => {
      const node = state.nodes[action.payload.id];
      const next = [
        ...asWorkflowDependencies(node.additional_dependencies),
        action.payload.dependency,
      ];
      node.additional_dependencies =
        next as DbFunctionNode["additional_dependencies"];
    },
    removeAdditionalDependency: (
      state,
      action: PayloadAction<{ id: string; source_broker_id: string }>,
    ) => {
      const node = state.nodes[action.payload.id];
      const filtered = asWorkflowDependencies(
        node.additional_dependencies,
      ).filter(
        (dep) => dep.source_broker_id !== action.payload.source_broker_id,
      );
      node.additional_dependencies =
        filtered as DbFunctionNode["additional_dependencies"];
    },

    // Array field actions: arg_mapping
    updateArgMapping: (
      state,
      action: PayloadAction<{ id: string; mappings: ArgumentMapping[] }>,
    ) => {
      const node = state.nodes[action.payload.id];
      node.arg_mapping = action.payload
        .mappings as DbFunctionNode["arg_mapping"];
    },
    addArgMapping: (
      state,
      action: PayloadAction<{ id: string; mapping: ArgumentMapping }>,
    ) => {
      const node = state.nodes[action.payload.id];
      const next = [
        ...asArgumentMappings(node.arg_mapping),
        action.payload.mapping,
      ];
      node.arg_mapping = next as DbFunctionNode["arg_mapping"];
    },
    removeArgMapping: (
      state,
      action: PayloadAction<{
        id: string;
        source_broker_id: string;
        target_arg_name: string;
      }>,
    ) => {
      const node = state.nodes[action.payload.id];
      const filtered = asArgumentMappings(node.arg_mapping).filter(
        (map) =>
          !(
            map.source_broker_id === action.payload.source_broker_id &&
            map.target_arg_name === action.payload.target_arg_name
          ),
      );
      node.arg_mapping = filtered as DbFunctionNode["arg_mapping"];
    },

    // Array field actions: return_broker_overrides
    updateReturnBrokerOverrides: (
      state,
      action: PayloadAction<{ id: string; overrides: string[] }>,
    ) => {
      const node = state.nodes[action.payload.id];
      node.return_broker_overrides = action.payload
        .overrides as DbFunctionNode["return_broker_overrides"];
    },
    addReturnBrokerOverride: (
      state,
      action: PayloadAction<{ id: string; override: string }>,
    ) => {
      const node = state.nodes[action.payload.id];
      const next = [
        ...asStringArray(node.return_broker_overrides),
        action.payload.override,
      ];
      node.return_broker_overrides =
        next as DbFunctionNode["return_broker_overrides"];
    },
    removeReturnBrokerOverride: (
      state,
      action: PayloadAction<{ id: string; override: string }>,
    ) => {
      const node = state.nodes[action.payload.id];
      const filtered = asStringArray(node.return_broker_overrides).filter(
        (ov) => ov !== action.payload.override,
      );
      node.return_broker_overrides =
        filtered as DbFunctionNode["return_broker_overrides"];
    },

    // Array field actions: arg_overrides
    updateArgOverrides: (
      state,
      action: PayloadAction<{ id: string; overrides: ArgumentOverride[] }>,
    ) => {
      const node = state.nodes[action.payload.id];
      node.arg_overrides = action.payload
        .overrides as DbFunctionNode["arg_overrides"];
    },
    addArgOverride: (
      state,
      action: PayloadAction<{ id: string; override: ArgumentOverride }>,
    ) => {
      const node = state.nodes[action.payload.id];
      const next = [
        ...asArgumentOverrides(node.arg_overrides),
        action.payload.override,
      ];
      node.arg_overrides = next as DbFunctionNode["arg_overrides"];
    },
    removeArgOverride: (
      state,
      action: PayloadAction<{ id: string; name: string }>,
    ) => {
      const node = state.nodes[action.payload.id];
      const filtered = asArgumentOverrides(node.arg_overrides).filter(
        (ov) => ov.name !== action.payload.name,
      );
      node.arg_overrides = filtered as DbFunctionNode["arg_overrides"];
    },
  },
});

export const {
  addNode,
  removeNode,
  overwriteNode,
  updateUserId,
  updateWorkflowId,
  updateFunctionId,
  updateFunctionType,
  updateStepName,
  updateNodeType,
  updateExecutionRequired,
  updateStatus,
  updateIsPublic,
  updatePublicRead,
  updateMetadata,
  updateUiNodeData,
  updateAdditionalDependencies,
  addAdditionalDependency,
  removeAdditionalDependency,
  updateArgMapping,
  addArgMapping,
  removeArgMapping,
  updateReturnBrokerOverrides,
  addReturnBrokerOverride,
  removeReturnBrokerOverride,
  updateArgOverrides,
  addArgOverride,
  removeArgOverride,
} = dbFunctionNodeSlice.actions;

export default dbFunctionNodeSlice.reducer;
