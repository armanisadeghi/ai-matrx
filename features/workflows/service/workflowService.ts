import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import {
  DbCompleteWorkflow,
  ConvertedWorkflowData,
  DbWorkflowEdge,
  WorkflowEdge,
} from "@/features/workflows/types";
import {
  batchUserInputsToReactFlow,
  saveWorkflowUserInput,
  updateUserInputWithConversion,
} from "./userInputService";
import {
  batchRelaysToReactFlow,
  saveWorkflowRelay,
  updateRelayWithConversion,
} from "./relayService";
import {
  batchDatabaseToReactFlow,
  saveWorkflowNode,
  updateFunctionNodeWithConversion,
} from "./functionNodeService";
import {
  saveWorkflowEdge,
  batchEdgesToReactFlow,
  reactFlowToEdge,
} from "./edgeService";

import {
  DbFunctionNode,
  DbUserInput,
  DbBrokerRelayData,
  FunctionNode,
  UserInputNode,
  BrokerRelayNode,
  DbWorkflow,
} from "@/features/workflows/types";

const wf = (
  table: "workflow" | "workflow_node" | "workflow_edge" | "workflow_relay",
  method: string,
) =>
  fromDeprecatedTable(
    table,
    `features/workflows/service/workflowService.ts:${method}`,
  );

export async function fetchUserWorkflows(
  userId: string,
): Promise<DbWorkflow[]> {
  const { data, error } = await wf("workflow", "fetchUserWorkflows")
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch workflows: ${error.message}`);
  return data || [];
}

export async function fetchWorkflowById(
  workflowId: string,
): Promise<DbCompleteWorkflow> {
  const [
    workflowResult,
    nodesResult,
    userInputsResult,
    relaysResult,
    edgesResult,
  ] = await Promise.all([
    wf("workflow", "fetchWorkflowById:workflow")
      .select("*")
      .eq("id", workflowId)
      .single(),
    wf("workflow_node", "fetchWorkflowById:nodes")
      .select("*")
      .eq("workflow_id", workflowId),
    fromDeprecatedTable(
      "workflow_user_input",
      "features/workflows/service/workflowService.ts:fetchWorkflowById",
    )
      .select("*")
      .eq("workflow_id", workflowId),
    wf("workflow_relay", "fetchWorkflowById:relays")
      .select("*")
      .eq("workflow_id", workflowId),
    wf("workflow_edge", "fetchWorkflowById:edges")
      .select("*")
      .eq("workflow_id", workflowId),
  ]);

  if (workflowResult.error)
    throw new Error(
      `Failed to fetch workflow: ${workflowResult.error.message}`,
    );
  if (nodesResult.error)
    throw new Error(`Failed to fetch nodes: ${nodesResult.error.message}`);
  if (userInputsResult.error)
    throw new Error(
      `Failed to fetch user inputs: ${userInputsResult.error.message}`,
    );
  if (relaysResult.error)
    throw new Error(`Failed to fetch relays: ${relaysResult.error.message}`);
  if (edgesResult.error)
    throw new Error(`Failed to fetch edges: ${edgesResult.error.message}`);

  // DB rows carry `unknown` for JSON columns; the app-level types narrow
  // them. Cast at this boundary rather than per-call; if a JSON column is
  // renamed/removed in the DB, the type definition will catch it upstream.
  return {
    workflow: workflowResult.data,
    functionNodes: (nodesResult.data || []) as unknown as DbFunctionNode[],
    userInputs: userInputsResult.data || [],
    relays: relaysResult.data || [],
    edges: edgesResult.data || [],
  };
}

export async function fetchWorkflowByIdWithConversion(
  workflowId: string,
): Promise<ConvertedWorkflowData> {
  const completeData = await fetchWorkflowById(workflowId);
  const { workflow, functionNodes, userInputs, relays, edges } = completeData;

  const convertedNodes = batchDatabaseToReactFlow(functionNodes);
  const userInputNodes = batchUserInputsToReactFlow(userInputs);
  const relayNodes = batchRelaysToReactFlow(relays);
  const convertedEdges = batchEdgesToReactFlow(edges);

  const allNodes = [...convertedNodes, ...userInputNodes, ...relayNodes];

  return {
    workflow: workflow,
    functionNodes: convertedNodes,
    edges: convertedEdges,
    userInputs: userInputNodes,
    relays: relayNodes,
    allNodes: allNodes,
  };
}

export async function createWorkflow(
  userId: string,
  data: Partial<DbWorkflow>,
): Promise<DbWorkflow> {
  const { data: workflow, error } = await wf("workflow", "createWorkflow")
    .insert({
      user_id: userId,
      name: data.name || "Untitled Workflow",
      description: data.description || null,
      viewport: data.viewport || { x: 0, y: 0, zoom: 1 },
      auto_execute: data.auto_execute || false,
      tags: data.tags || null,
      category: data.category || null,
      metadata: data.metadata || {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create workflow: ${error.message}`);
  return workflow;
}

export async function updateWorkflow(
  workflowId: string,
  data: Partial<DbWorkflow>,
): Promise<DbWorkflow> {
  const { data: workflow, error } = await wf("workflow", "updateWorkflow")
    .update(data)
    .eq("id", workflowId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update workflow: ${error.message}`);
  return workflow;
}

// ===== BATCH OPERATIONS =====

/**
 * Save complete workflow data (useful for bulk updates)
 */
export async function saveCompleteDbFormatWorkflow(
  workflowId: string,
  userId: string,
  data: {
    workflow?: DbWorkflow;
    functionNodes?: DbFunctionNode[];
    userInputs?: DbUserInput[];
    relays?: DbBrokerRelayData[];
    edges?: DbWorkflowEdge[];
  },
): Promise<void> {
  const operations: Promise<any>[] = [];

  if (data.workflow) {
    operations.push(updateWorkflow(workflowId, data.workflow));
  }

  if (data.functionNodes) {
    operations.push(
      ...data.functionNodes.map((node) =>
        saveWorkflowNode(workflowId, userId, node, true),
      ),
    );
  }

  if (data.userInputs) {
    operations.push(
      ...data.userInputs.map((input) =>
        saveWorkflowUserInput(workflowId, userId, input, true),
      ),
    );
  }

  if (data.relays) {
    operations.push(
      ...data.relays.map((relay) =>
        saveWorkflowRelay(workflowId, userId, relay, true),
      ),
    );
  }

  if (data.edges) {
    const realEdges = data.edges.filter(
      (edge) => !edge.id?.startsWith("virtual_"),
    );
    operations.push(
      ...realEdges.map((edge) => saveWorkflowEdge(workflowId, edge)),
    );
  }

  await Promise.all(operations);
}

// ===== UNIFIED NODE UPDATE UTILITY =====

export type WorkflowNode = FunctionNode | UserInputNode | BrokerRelayNode;

export async function updateNode(node: WorkflowNode): Promise<void> {
  if (node.type === "userInput") {
    await updateUserInputWithConversion(node as UserInputNode);
  } else if (node.type === "brokerRelay") {
    await updateRelayWithConversion(node as BrokerRelayNode);
  } else {
    await updateFunctionNodeWithConversion(node as FunctionNode);
  }
}

/**
 * Save complete workflow data with ReactFlow conversion
 * Accepts FullReactFlowNode array and converts to database format
 */
export async function saveCompleteWorkflowWithConversion(
  workflow: DbWorkflow,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Promise<void> {
  const operations: Promise<any>[] = [];

  if (workflow) {
    operations.push(updateWorkflow(workflow.id, workflow));
  }

  if (nodes) {
    for (const node of nodes) {
      if (node.type === "userInput") {
        operations.push(updateUserInputWithConversion(node as UserInputNode));
      } else if (node.type === "brokerRelay") {
        operations.push(updateRelayWithConversion(node as BrokerRelayNode));
      } else {
        operations.push(updateFunctionNodeWithConversion(node as FunctionNode));
      }
    }
  }

  if (edges) {
    const realEdges = edges.filter((edge) => !edge.id?.startsWith("virtual_"));
    const dbEdges = realEdges.map((edge) => reactFlowToEdge(edge));
    operations.push(
      ...dbEdges.map((edge) => saveWorkflowEdge(workflow.id, edge)),
    );
  }

  await Promise.all(operations);
}
