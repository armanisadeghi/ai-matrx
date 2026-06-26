import { supabase } from "@/utils/supabase/client";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import { XYPosition } from "reactflow";
import {
  DbFunctionNode,
  FunctionNode,
  FunctionNodeData,
  WorkflowNodeInsert,
  WorkflowNodePersistShape,
} from "@/features/workflows/types/functionNodeTypes";
import { ReactFlowUIMetadata } from "@/features/workflows/types";

// ===== DEFAULT VALUES =====

const DEFAULT_WORKFLOW_DATA: Partial<FunctionNodeData> = {
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
};

const DEFAULT_POSITION: XYPosition = { x: 0, y: 0 };

const DEFAULT_UI_DATA: Partial<ReactFlowUIMetadata> = {
  position: DEFAULT_POSITION,
  type: "functionNode",
  draggable: true,
  selectable: true,
  connectable: true,
  deletable: true,
  hidden: false,
};

export function reactFlowToDatabase(
  reactFlowNode: FunctionNode,
  additionalDbFields?: Partial<WorkflowNodeInsert>,
): WorkflowNodeInsert {
  const workflowData = reactFlowNode.data;

  // Build metadata object with all ReactFlow UI fields
  const nodeData: ReactFlowUIMetadata = {
    position: reactFlowNode.position,
    type: reactFlowNode.type,
    sourcePosition: reactFlowNode.sourcePosition,
    targetPosition: reactFlowNode.targetPosition,
    hidden: reactFlowNode.hidden,
    draggable: reactFlowNode.draggable,
    selectable: reactFlowNode.selectable,
    connectable: reactFlowNode.connectable,
    deletable: reactFlowNode.deletable,
    dragHandle: reactFlowNode.dragHandle,
    parentId: reactFlowNode.parentNode,
    zIndex: reactFlowNode.zIndex,
    extent: reactFlowNode.extent,
    expandParent: reactFlowNode.expandParent,
    ariaLabel: reactFlowNode.ariaLabel,
    focusable: reactFlowNode.focusable,
    style: reactFlowNode.style,
    className: reactFlowNode.className,
  };

  // Remove undefined fields from metadata
  const cleanNodeData = Object.fromEntries(
    Object.entries(nodeData).filter(([_, value]) => value !== undefined),
  ) as ReactFlowUIMetadata;

  // Build database storage node - omit created_at and updated_at, let database handle them
  const dbNode: WorkflowNodeInsert = {
    id: reactFlowNode.id,
    user_id: workflowData.user_id || null,
    workflow_id: workflowData.workflow_id || null,
    function_id: workflowData.function_id || null,
    function_type: workflowData.function_type,
    step_name: workflowData.step_name,
    node_type: workflowData.node_type,
    execution_required: workflowData.execution_required,
    status: workflowData.status,
    additional_dependencies:
      workflowData.additional_dependencies as DbFunctionNode["additional_dependencies"],
    arg_mapping: workflowData.arg_mapping as DbFunctionNode["arg_mapping"],
    return_broker_overrides:
      workflowData.return_broker_overrides as DbFunctionNode["return_broker_overrides"],
    arg_overrides:
      workflowData.arg_overrides as DbFunctionNode["arg_overrides"],
    metadata: workflowData.metadata as DbFunctionNode["metadata"],
    ui_node_data: cleanNodeData as DbFunctionNode["ui_node_data"],
    is_public: null,
    public_read: null,
    ...additionalDbFields,
  };

  return dbNode;
}

/**
 * Creates a new ReactFlow node with safe defaults
 * Used when creating new nodes in the UI
 */
export function createNewReactFlowNode(
  id: string,
  functionId?: string,
  position?: XYPosition,
  additionalData?: Partial<FunctionNodeData>,
): FunctionNode {
  const workflowData: FunctionNodeData = {
    ...DEFAULT_WORKFLOW_DATA,
    function_id: functionId || "",
    ...additionalData,
  } as FunctionNodeData;

  const reactFlowNode: FunctionNode = {
    id,
    position: position || DEFAULT_POSITION,
    data: workflowData,
    ...DEFAULT_UI_DATA,
  };

  return reactFlowNode;
}

/**
 * Updates a ReactFlow node's workflow data while preserving UI state
 */
export function updateReactFlowNodeData(
  existingNode: FunctionNode,
  dataUpdates: Partial<FunctionNodeData>,
): FunctionNode {
  return {
    ...existingNode,
    data: {
      ...existingNode.data,
      ...dataUpdates,
    },
  };
}

/**
 * Updates a ReactFlow node's UI metadata while preserving workflow data
 */
export function updateReactFlowNodeUI(
  existingNode: FunctionNode,
  uiUpdates: Partial<Omit<FunctionNode, "id" | "data">>,
): FunctionNode {
  return {
    ...existingNode,
    ...uiUpdates,
  };
}

export function extractExecutionData(
  reactFlowNode: FunctionNode,
): FunctionNodeData {
  return { ...reactFlowNode.data };
}

/**
 * Batch converts array of ReactFlow nodes to database nodes
 */
export function batchReactFlowToDatabase(
  reactFlowNodes: FunctionNode[],
  commonDbFields?: Partial<WorkflowNodeInsert>,
): WorkflowNodeInsert[] {
  return reactFlowNodes.map((node) =>
    reactFlowToDatabase(node, commonDbFields),
  );
}

export function databaseToReactFlow(
  dbNode: WorkflowNodePersistShape,
): FunctionNode {
  const nodeData = (dbNode.ui_node_data || {}) as Partial<ReactFlowUIMetadata>;

  const additionalDeps = dbNode.additional_dependencies as
    | FunctionNodeData["additional_dependencies"]
    | null;
  const argMapping = dbNode.arg_mapping as
    | FunctionNodeData["arg_mapping"]
    | null;
  const returnBrokers = dbNode.return_broker_overrides as
    | FunctionNodeData["return_broker_overrides"]
    | null;
  const argOverrides = dbNode.arg_overrides as
    | FunctionNodeData["arg_overrides"]
    | null;
  const nodeMeta = dbNode.metadata as FunctionNodeData["metadata"] | null;

  // Build workflow data from database fields
  const workflowData: FunctionNodeData = {
    id: dbNode.id,
    user_id: dbNode.user_id,
    workflow_id: dbNode.workflow_id ?? undefined,
    function_id: dbNode.function_id || "",
    function_type: dbNode.function_type || DEFAULT_WORKFLOW_DATA.function_type!,
    step_name: dbNode.step_name || DEFAULT_WORKFLOW_DATA.step_name!,
    node_type: dbNode.node_type || DEFAULT_WORKFLOW_DATA.node_type!,
    execution_required:
      dbNode.execution_required ?? DEFAULT_WORKFLOW_DATA.execution_required!,
    status: dbNode.status || DEFAULT_WORKFLOW_DATA.status!,
    additional_dependencies:
      additionalDeps ?? DEFAULT_WORKFLOW_DATA.additional_dependencies!,
    arg_mapping: argMapping ?? DEFAULT_WORKFLOW_DATA.arg_mapping!,
    return_broker_overrides:
      returnBrokers ?? DEFAULT_WORKFLOW_DATA.return_broker_overrides!,
    arg_overrides: argOverrides ?? DEFAULT_WORKFLOW_DATA.arg_overrides!,
    metadata: nodeMeta ?? DEFAULT_WORKFLOW_DATA.metadata!,
  };

  // Build ReactFlow node
  const reactFlowNode: FunctionNode = {
    id: dbNode.id,
    position: nodeData.position || DEFAULT_POSITION,
    data: workflowData,
    type: nodeData.type || DEFAULT_UI_DATA.type,
    sourcePosition: nodeData.sourcePosition,
    targetPosition: nodeData.targetPosition,
    hidden: nodeData.hidden ?? DEFAULT_UI_DATA.hidden,
    draggable: nodeData.draggable ?? DEFAULT_UI_DATA.draggable,
    selectable: nodeData.selectable ?? DEFAULT_UI_DATA.selectable,
    connectable: nodeData.connectable ?? DEFAULT_UI_DATA.connectable,
    deletable: nodeData.deletable ?? DEFAULT_UI_DATA.deletable,
    dragHandle: nodeData.dragHandle,
    parentNode: nodeData.parentId,
    zIndex: nodeData.zIndex,
    extent: nodeData.extent,
    expandParent: nodeData.expandParent,
    ariaLabel: nodeData.ariaLabel,
    focusable: nodeData.focusable,
    style: nodeData.style,
    className: nodeData.className,
  };

  return reactFlowNode;
}

export function batchDatabaseToReactFlow(
  dbNodes: DbFunctionNode[],
): FunctionNode[] {
  return dbNodes.map((dbNode) => databaseToReactFlow(dbNode));
}

export async function duplicateWorkflowNodeRPC(
  nodeId: string,
): Promise<DbFunctionNode> {
  const { data, error } = await supabase.rpc("duplicate_row", {
    p_table_name: "workflow_node",
    p_source_id: nodeId,
    p_excluded_columns: ["id", "created_at", "updated_at"],
  });

  if (error)
    throw new Error(`Failed to duplicate node via RPC: ${error.message}`);
  if (!data) throw new Error("No data returned from RPC duplication");

  return data as unknown as DbFunctionNode;
}

export async function duplicateWorkflowNodeWithConversion(
  nodeId: string,
): Promise<FunctionNode> {
  const dbNode = await duplicateWorkflowNodeRPC(nodeId);
  return databaseToReactFlow(dbNode);
}

export async function saveWorkflowNode(
  workflowId: string,
  userId: string,
  nodeData: Partial<DbFunctionNode>,
  isUpdate: boolean,
): Promise<DbFunctionNode> {
  if (isUpdate) {
    const { data: node, error } = await fromDeprecatedTable(
      "workflow_node",
      "features/workflows/service/functionNodeService.ts",
    )
      .update(nodeData as never)
      .eq("id", nodeData.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update node: ${error.message}`);
    // DB row uses `unknown` for JSON columns; DbFunctionNode narrows them.
    return node as unknown as DbFunctionNode;
  } else {
    const { data: node, error } = await fromDeprecatedTable(
      "workflow_node",
      "features/workflows/service/functionNodeService.ts",
    )
      .insert({
        ...nodeData,
        workflow_id: workflowId,
        user_id: userId,
      } as never)
      .select()
      .single();

    if (error) throw new Error(`Failed to create node: ${error.message}`);
    return node as unknown as DbFunctionNode;
  }
}

/**
 * Save workflow node with ReactFlow conversion
 * Accepts FullReactFlowNode format and converts to database format
 */
export async function saveWorkflowNodeWithConversion(
  workflowId: string,
  userId: string,
  reactFlowNode: FunctionNode,
): Promise<FunctionNode> {
  // Convert ReactFlow format to database format
  const dbNode = reactFlowToDatabase(reactFlowNode, {
    workflow_id: workflowId,
    user_id: userId,
  });

  // Save to database using existing function
  const savedNode = await saveWorkflowNode(workflowId, userId, dbNode, true);

  // Convert back to ReactFlow format for return
  return databaseToReactFlow(savedNode as DbFunctionNode);
}

/**
 * Remove node from workflow (clears workflow_id but keeps node in database)
 */
export async function removeNodeFromWorkflow(nodeId: string): Promise<void> {
  const { error } = await fromDeprecatedTable(
    "workflow_node",
    "features/workflows/service/functionNodeService.ts",
  )
    .update({ workflow_id: null })
    .eq("id", nodeId);

  if (error)
    throw new Error(`Failed to remove node from workflow: ${error.message}`);
}

/**
 * Delete workflow node permanently
 */
export async function deleteWorkflowNode(nodeId: string): Promise<void> {
  const { error } = await fromDeprecatedTable(
    "workflow_node",
    "features/workflows/service/functionNodeService.ts",
  )
    .delete()
    .eq("id", nodeId);

  if (error) throw new Error(`Failed to delete node: ${error.message}`);
}

export async function updateFunctionNodeWithConversion(
  reactFlowNode: FunctionNode,
): Promise<DbFunctionNode> {
  // Convert ReactFlow node to database format
  const nodeData = reactFlowToDatabase(reactFlowNode);

  // Save to database (workflow_id and user_id are already in the data)
  const savedNode = await saveWorkflowNode(
    nodeData.workflow_id!,
    nodeData.user_id || "",
    nodeData,
    true, // isUpdate
  );

  return savedNode;
}

const INITIAL_FUNCTION_NODE_DATA: Partial<FunctionNodeData> = {
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
