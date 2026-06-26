import { supabase } from "@/utils/supabase/client";
import {
  fromDeprecatedTable,
  logDeprecatedTableAccess,
} from "@/utils/supabase/deprecated-tables";
import { Node, XYPosition } from "reactflow";
import { UserInputNode } from "@/features/workflows/types/userInputNodeTypes";
import { DbUserInput } from "@/features/workflows/types/userInputNodeTypes";
import {
  PythonDataType,
  ReactFlowUIMetadata,
} from "@/features/workflows/types";

const DEFAULT_POSITION: XYPosition = { x: 0, y: 0 };

const DEFAULT_UI_METADATA: Partial<ReactFlowUIMetadata> = {
  position: DEFAULT_POSITION,
  type: "userInput",
  draggable: true,
  selectable: true,
  connectable: true,
  deletable: true,
  hidden: false,
};

export function userInputToReactFlow(dbInput: DbUserInput): UserInputNode {
  const nodeData = (dbInput.ui_node_data || {}) as Partial<ReactFlowUIMetadata>;

  const userInputData = {
    id: dbInput.id,
    type: "userInput",
    workflow_id: dbInput.workflow_id,
    broker_id: dbInput.broker_id,
    label: dbInput.label,
    data_type: (dbInput.data_type ?? "str") as PythonDataType,
    default_value: dbInput.default_value,
    is_required: dbInput.is_required,
    field_component_id: dbInput.field_component_id,
    metadata: dbInput.metadata || {},
  };

  // Ensure type is always "userInput" for user input nodes
  const ensuredType =
    !nodeData.type || nodeData.type !== "userInput"
      ? "userInput"
      : nodeData.type;

  // Build ReactFlow node
  const reactFlowNode: UserInputNode = {
    id: dbInput.id,
    position: nodeData.position || { x: 0, y: 0 },
    data: userInputData,
    type: ensuredType,
    sourcePosition: nodeData.sourcePosition,
    targetPosition: nodeData.targetPosition,
    hidden: nodeData.hidden ?? DEFAULT_UI_METADATA.hidden,
    draggable: nodeData.draggable ?? DEFAULT_UI_METADATA.draggable,
    selectable: nodeData.selectable ?? DEFAULT_UI_METADATA.selectable,
    connectable: nodeData.connectable ?? DEFAULT_UI_METADATA.connectable,
    deletable: nodeData.deletable ?? DEFAULT_UI_METADATA.deletable,
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

/**
 * Convert database userInputs to React Flow nodes
 * Similar to batchDatabaseToReactFlow but for userInputs
 */
export function batchUserInputsToReactFlow(
  dbUserInputs: DbUserInput[],
): UserInputNode[] {
  return dbUserInputs.map((dbInput) => userInputToReactFlow(dbInput));
}

/**
 * Convert React Flow node back to database format
 * This is the reverse of userInputToReactFlow
 */
export function reactFlowToUserInput(
  reactFlowNode: UserInputNode,
): Partial<DbUserInput> {
  const userInputData = reactFlowNode.data;

  // Ensure type is always "userInput" for user input nodes
  const ensuredType =
    !reactFlowNode.type || reactFlowNode.type !== "userInput"
      ? "userInput"
      : reactFlowNode.type;

  // Build metadata object with all ReactFlow UI fields
  const nodeData: ReactFlowUIMetadata = {
    position: reactFlowNode.position,
    type: ensuredType,
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

  // Ensure ui_node_data always has type as "userInput"
  cleanNodeData.type = "userInput";

  // Build database userInput - map fields back exactly as they are
  const dbUserInput: Partial<DbUserInput> = {
    id: userInputData.id,
    workflow_id: userInputData.workflow_id,
    field_component_id: userInputData.field_component_id,
    broker_id: userInputData.broker_id,
    label: userInputData.label,
    data_type: userInputData.data_type,
    default_value: userInputData.default_value,
    is_required: userInputData.is_required,
    metadata: userInputData.metadata,
    ui_node_data: cleanNodeData,
  };

  return dbUserInput;
}

// ===== USER INPUT OPERATIONS =====

export async function saveWorkflowUserInput(
  workflowId: string,
  userId: string,
  inputData: Partial<DbUserInput>,
  isUpdate: boolean,
): Promise<DbUserInput> {
  if (isUpdate) {
    const { data: userInput, error } = await fromDeprecatedTable(
      "workflow_user_input",
      "features/workflows/service/userInputService.ts:saveWorkflowUserInput(update)",
    )
      .update(inputData)
      .eq("id", inputData.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update user input: ${error.message}`);
    return userInput;
  } else {
    const brokerId = inputData.broker_id;
    if (!brokerId) {
      throw new Error("broker_id is required to create a workflow user input");
    }

    const { data: userInput, error } = await fromDeprecatedTable(
      "workflow_user_input",
      "features/workflows/service/userInputService.ts:saveWorkflowUserInput(create)",
    )
      .insert({
        ...inputData,
        workflow_id: workflowId,
        user_id: userId,
        broker_id: brokerId,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create user input: ${error.message}`);
    return userInput;
  }
}

/**
 * Remove user input from workflow (clears workflow_id but keeps input in database)
 */
export async function removeUserInputFromWorkflow(
  inputId: string,
): Promise<void> {
  const { error } = await fromDeprecatedTable(
    "workflow_user_input",
    "features/workflows/service/userInputService.ts:removeUserInputFromWorkflow",
  )
    .update({ workflow_id: null })
    .eq("id", inputId);

  if (error)
    throw new Error(
      `Failed to remove user input from workflow: ${error.message}`,
    );
}

/**
 * Delete workflow user input permanently
 */
export async function deleteWorkflowUserInput(inputId: string): Promise<void> {
  const { error } = await fromDeprecatedTable(
    "workflow_user_input",
    "features/workflows/service/userInputService.ts:deleteWorkflowUserInput",
  )
    .delete()
    .eq("id", inputId);

  if (error) throw new Error(`Failed to delete user input: ${error.message}`);
}

export async function duplicateWorkflowUserInputRPC(
  inputId: string,
): Promise<DbUserInput> {
  logDeprecatedTableAccess(
    "workflow_user_input",
    "features/workflows/service/userInputService.ts:duplicateWorkflowUserInputRPC (duplicate_row RPC)",
  );

  const { data, error } = await supabase.rpc("duplicate_row", {
    p_table_name: "workflow_user_input",
    p_source_id: inputId,
    p_excluded_columns: ["id", "created_at", "updated_at"],
  });

  if (error)
    throw new Error(`Failed to duplicate user input via RPC: ${error.message}`);
  if (!data) throw new Error("No data returned from RPC duplication");

  return data as unknown as DbUserInput;
}

export async function duplicateUserInputWithConversion(
  inputId: string,
): Promise<Node> {
  const userInput = await duplicateWorkflowUserInputRPC(inputId);
  return userInputToReactFlow(userInput);
}

export async function updateUserInputWithConversion(
  reactFlowNode: UserInputNode,
): Promise<DbUserInput> {
  // Validate that this is a userInput node
  if (reactFlowNode.data.type !== "userInput") {
    throw new Error(
      `Invalid node type: expected 'userInput', got '${reactFlowNode.data.type}'`,
    );
  }

  // Convert ReactFlow node to database format
  const inputData = reactFlowToUserInput(reactFlowNode);

  // Save to database (workflow_id and user_id are already in the data)
  const savedUserInput = await saveWorkflowUserInput(
    inputData.workflow_id!,
    inputData.user_id || "",
    inputData,
    true, // isUpdate
  );

  return savedUserInput;
}
