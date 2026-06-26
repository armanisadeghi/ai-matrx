import { useMemo, useState } from "react";
import { getIconComponent } from "@/components/official/icons/IconResolver";
import {
  useNodeCategoryWithFetch,
  useRegisteredNodeWithFetch,
} from "@/lib/redux/entity/hooks/entityUsedHooks";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  WorkflowNode,
  WorkflowNodeUiData,
  XyFlowNodeType,
} from "@/lib/redux/workflow-nodes/types";
import { createWorkflowNode } from "@/lib/redux/workflow-nodes/thunks";
import { RegisteredNodeData } from "@/types/AutomationSchemaTypes";
import { normalizeInputMapping } from "../utils/normalizers";
import { InputMapping } from "@/lib/redux/workflow/types";

export interface CategoryNodeData {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

const RECIPE_FUNCTION_ID = "2ac5576b-d1ab-45b1-ab48-4e196629fdd8";

// interface Output {
//     broker_id: string | null;
//     is_default_output: boolean;
//     name: string | null;
//     bookmark: Bookmark | null;
//     conversion: any;
//     data_type: string | null;
//     result: Result | null;
//     relays?: Relay[];
//     metadata: Record<string, any>;
// }

export function newNodeFunction(
  nodeDefinition: RegisteredNodeData,
  workflowId: string,
  userId: string,
  categoryName: string,
  uiData?: WorkflowNodeUiData,
): Omit<WorkflowNode, "id" | "created_at" | "updated_at"> {
  const randomXOffset = Math.floor(Math.random() * 11) * 10;
  const randomYOffset = Math.floor(Math.random() * 11) * 10;
  const outputs = (nodeDefinition.outputs as unknown as any[]).map(
    (output) => ({
      broker_id: output.broker_id,
      is_default_output:
        output.output_type === "default_function_result" ? true : false,
      name: output.name,
      bookmark: null,
      conversion: null,
      data_type: output.data_type,
      result: null,
      relays: [],
      metadata: {
        component: output.component,
      },
    }),
  );

  return {
    function_id: nodeDefinition.registeredFunctionId,
    workflow_id: workflowId,
    function_type: "registered_function",
    type: "functionNode",
    node_type: categoryName,
    step_name: nodeDefinition.name,
    status: "pending",
    execution_required: true,
    arguments: null,
    inputs: Array.isArray(normalizeInputMapping(nodeDefinition.inputs))
      ? (normalizeInputMapping(nodeDefinition.inputs) as InputMapping[])
      : [normalizeInputMapping(nodeDefinition.inputs) as InputMapping],
    outputs: outputs,
    user_id: userId,
    is_active: true,
    ui_data: uiData || {
      width: 250,
      height: 125,
      position: {
        x: 500 + randomXOffset,
        y: 250 + randomYOffset,
      },
    },
    dependencies: [],
    metadata: {
      nodeDefinitionId: nodeDefinition.id,
      nodeDefinition: nodeDefinition,
    },
    is_public: false,
    public_read: false,
  };
}

export function createCustomInputNode(
  nodeDefinition: RegisteredNodeData,
  workflowId: string,
  userId: string,
  categoryName: string,
  nodeType: XyFlowNodeType,
  uiData?: WorkflowNodeUiData,
): Omit<WorkflowNode, "id" | "created_at" | "updated_at"> {
  const randomXOffset = Math.floor(Math.random() * 11) * 10;
  const randomYOffset = Math.floor(Math.random() * 11) * 10;
  const outputs = (nodeDefinition.outputs as unknown as any[]).map(
    (output) => ({
      broker_id: output.broker_id,
      is_default_output:
        output.output_type === "default_function_result" ? true : false,
      name: output.name,
      bookmark: null,
      conversion: null,
      data_type: output.data_type,
      result: null,
      relays: [],
      metadata: {
        component: output.component,
      },
    }),
  );

  return {
    function_id: null,
    workflow_id: workflowId,
    function_type: "registered_function",
    type: nodeType,
    node_type: nodeType,
    step_name: nodeDefinition.name,
    status: "pending",
    execution_required: false,
    arguments: null,
    inputs: [],
    outputs: outputs,
    user_id: userId,
    is_active: true,
    ui_data: uiData || {
      width: 250,
      height: 125,
      position: {
        x: 300 + randomXOffset,
        y: 150 + randomYOffset,
      },
    },
    dependencies: [],
    metadata: {
      nodeDefinitionId: nodeDefinition.id,
      nodeDefinition: nodeDefinition,
    },
    is_public: false,
    public_read: false,
  };
}

export const useCategoryNodeData = (workflowId?: string) => {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);

  const categoryHook = useNodeCategoryWithFetch();
  const registeredNodeHook = useRegisteredNodeWithFetch();

  const categoryRecords = categoryHook.nodeCategoryRecordsById;
  const registeredNodeRecords = registeredNodeHook.registeredNodeRecordsById;

  const [isAddingNode, setIsAddingNode] = useState(false);

  // Memoized nodes grouped by category for efficient lookup
  const nodesByCategory = useMemo(() => {
    const grouped: Record<string, CategoryNodeData[]> = {};

    Object.values(registeredNodeRecords).forEach((node) => {
      const categoryId = node.category;
      if (!grouped[categoryId]) {
        grouped[categoryId] = [];
      }
      grouped[categoryId].push({
        id: node.id,
        name: node.name,
        description: node.description || "No description available",
        icon: node.icon,
        color: node.color,
      });
    });

    return grouped;
  }, [registeredNodeRecords]);

  const getRegisteredNodeById = (nodeId: string) => {
    return registeredNodeRecords[nodeId];
  };
  const getNodeType = (nodeId: string) => {
    return registeredNodeRecords[nodeId]?.nodeType;
  };
  const getNodeFunctionId = (nodeId: string) => {
    return registeredNodeRecords[nodeId]?.registeredFunctionId;
  };

  const getRegisteredNodeByFunctionId = (functionId: string) => {
    return Object.values(registeredNodeRecords).find(
      (node) => node.registeredFunctionId === functionId,
    );
  };

  const handleAddWorkflowNode = async (
    functionId: string,
    targetWorkflowId?: string,
  ) => {
    if (!workflowId && !targetWorkflowId) {
      throw new Error("Workflow ID is required to add nodes");
    }

    const useWorkflowId = targetWorkflowId || workflowId!;
    setIsAddingNode(true);

    const registeredNode = getRegisteredNodeByFunctionId(functionId);
    if (!registeredNode) {
      throw new Error("Registered node not found");
    }

    try {
      const newNodeData = newNodeFunction(
        registeredNode,
        useWorkflowId,
        userId,
        registeredNode.category,
      );
      const newNode = await dispatch(createWorkflowNode(newNodeData)).unwrap();
      return newNode;
    } catch (error) {
      console.error("Failed to add node:", error);
      throw error;
    } finally {
      setIsAddingNode(false);
    }
  };

  const handleAddCustomInputNode = async (
    nodeId: string,
    targetWorkflowId?: string,
  ) => {
    setIsAddingNode(true);

    try {
      const registeredNode = getRegisteredNodeById(nodeId);
      const nodeCategory = categoryRecords[registeredNode.category];
      const nodeType = registeredNode.nodeType as XyFlowNodeType;
      const newNodeData = createCustomInputNode(
        registeredNode,
        workflowId,
        userId,
        nodeCategory.name,
        nodeType,
      );
      const newNode = await dispatch(createWorkflowNode(newNodeData)).unwrap();
      return newNode;
    } catch (error) {
      console.error("Failed to add node:", error);
      throw error;
    } finally {
      setIsAddingNode(false);
    }
  };

  const handleNodeAdd = async (
    nodeId: string,
    targetWorkflowId?: string,
    onRecipeNodeCreated?: (nodeData: WorkflowNode) => void,
  ) => {
    const nodeType = getNodeType(nodeId);
    if (nodeType === "functionNode") {
      const functionId = getNodeFunctionId(nodeId);
      if (!functionId) {
        throw new Error("Function ID not found for node");
      }
      // Check if this is a recipe node
      if (functionId === RECIPE_FUNCTION_ID) {
        const result = await handleAddWorkflowNode(
          functionId,
          targetWorkflowId,
        );
        if (result && onRecipeNodeCreated) {
          onRecipeNodeCreated(result);
        }
        return result;
      } else {
        return await handleAddWorkflowNode(functionId, targetWorkflowId);
      }
    } else if (nodeType === "userInput" || nodeType === "directInput") {
      return await handleAddCustomInputNode(nodeId, targetWorkflowId);
    }
  };

  return {
    categoryRecords,
    registeredNodeRecords,
    nodesByCategory,
    getNodeFunctionId,
    getRegisteredNode: getRegisteredNodeByFunctionId,
    handleAddWorkflowNode,
    handleNodeAdd,
    isAddingNode,
    newNodeFunction,
  };
};
