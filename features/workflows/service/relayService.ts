import { XYPosition } from "reactflow";
import { supabase } from "@/utils/supabase/client";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import {
  DbBrokerRelayData,
  BrokerRelayNode,
} from "@/features/workflows/types/relaynodeTypes";
import { ReactFlowUIMetadata } from "@/features/workflows/types";

const DEFAULT_POSITION: XYPosition = { x: 0, y: 0 };

const DEFAULT_UI_METADATA: Partial<ReactFlowUIMetadata> = {
  position: DEFAULT_POSITION,
  type: "brokerRelay",
  draggable: true,
  selectable: true,
  connectable: true,
  deletable: true,
  hidden: false,
};

export function relayToReactFlow(dbRelay: DbBrokerRelayData): BrokerRelayNode {
  const nodeData = (dbRelay.ui_node_data || {}) as Partial<ReactFlowUIMetadata>;

  // Build relay data from database fields - keep ALL fields exactly as they are
  const relayData = {
    id: dbRelay.id,
    type: "brokerRelay", // Add type identifier for editor routing
    workflow_id: dbRelay.workflow_id,
    source_broker_id: dbRelay.source_broker_id,
    label: dbRelay.label,
    target_broker_ids: Array.isArray(dbRelay.target_broker_ids)
      ? (dbRelay.target_broker_ids as string[])
      : [],
    metadata: dbRelay.metadata || {},
  };

  // Build ReactFlow node
  const reactFlowNode: BrokerRelayNode = {
    id: dbRelay.id,
    position: nodeData.position || { x: 0, y: 0 },
    data: relayData,
    type: nodeData.type || DEFAULT_UI_METADATA.type,
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

export function batchRelaysToReactFlow(
  dbRelays: DbBrokerRelayData[],
): BrokerRelayNode[] {
  return dbRelays.map((dbRelay) => relayToReactFlow(dbRelay));
}

export function reactFlowToRelay(
  reactFlowNode: BrokerRelayNode,
): Partial<DbBrokerRelayData> {
  const relayData = reactFlowNode.data;

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

  // Build database relay - map fields back exactly as they are
  const dbRelay: Partial<DbBrokerRelayData> = {
    id: relayData.id,
    workflow_id: relayData.workflow_id,
    source_broker_id: relayData.source_broker_id,
    target_broker_ids: relayData.target_broker_ids,
    label: relayData.label,
    metadata: relayData.metadata,
    ui_node_data: cleanNodeData,
  };

  return dbRelay;
}

export async function saveWorkflowRelay(
  workflowId: string,
  userId: string,
  relayData: Partial<DbBrokerRelayData>,
  isUpdate: boolean,
): Promise<DbBrokerRelayData> {
  if (isUpdate) {
    const { data: relay, error } = await fromDeprecatedTable(
      "workflow_relay",
      "features/workflows/service/relayService.ts",
    )
      .update(relayData)
      .eq("id", relayData.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update relay: ${error.message}`);
    return relay;
  } else {
    const sourceBrokerId = relayData.source_broker_id;
    if (!sourceBrokerId) {
      throw new Error(
        "source_broker_id is required to create a workflow relay",
      );
    }

    const { data: relay, error } = await fromDeprecatedTable(
      "workflow_relay",
      "features/workflows/service/relayService.ts",
    )
      .insert({
        ...relayData,
        workflow_id: workflowId,
        user_id: userId,
        source_broker_id: sourceBrokerId,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create relay: ${error.message}`);
    return relay;
  }
}

export async function removeRelayFromWorkflow(relayId: string): Promise<void> {
  const { error } = await fromDeprecatedTable(
    "workflow_relay",
    "features/workflows/service/relayService.ts",
  )
    .update({ workflow_id: null })
    .eq("id", relayId);

  if (error)
    throw new Error(`Failed to remove relay from workflow: ${error.message}`);
}

export async function deleteWorkflowRelay(relayId: string): Promise<void> {
  const { error } = await fromDeprecatedTable(
    "workflow_relay",
    "features/workflows/service/relayService.ts",
  )
    .delete()
    .eq("id", relayId);

  if (error) throw new Error(`Failed to delete relay: ${error.message}`);
}

export async function duplicateWorkflowRelayRPC(
  relayId: string,
): Promise<DbBrokerRelayData> {
  const { data, error } = await supabase.rpc("duplicate_row", {
    p_table_name: "workflow_relay",
    p_source_id: relayId,
    p_excluded_columns: ["id", "created_at", "updated_at"],
  });

  if (error)
    throw new Error(`Failed to duplicate relay via RPC: ${error.message}`);
  if (!data) throw new Error("No data returned from RPC duplication");

  return data as unknown as DbBrokerRelayData;
}

export async function duplicateRelayWithConversion(
  relayId: string,
): Promise<BrokerRelayNode> {
  const relay = await duplicateWorkflowRelayRPC(relayId);
  return relayToReactFlow(relay);
}

export async function updateRelayWithConversion(
  reactFlowNode: BrokerRelayNode,
): Promise<DbBrokerRelayData> {
  // Validate that this is a brokerRelay node
  if (reactFlowNode.data.type !== "brokerRelay") {
    throw new Error(
      `Invalid node type: expected 'brokerRelay', got '${reactFlowNode.data.type}'`,
    );
  }

  // Convert ReactFlow node to database format
  const relayData = reactFlowToRelay(reactFlowNode);

  // Save to database (workflow_id and user_id are already in the data)
  const savedRelay = await saveWorkflowRelay(
    relayData.workflow_id!,
    relayData.user_id || "",
    relayData,
    true, // isUpdate
  );

  return savedRelay;
}
