import * as React from "react";
import { supabase } from "@/utils/supabase/client";
import {
  DbWorkflowEdge,
  EnrichedEdgeData,
  WorkflowEdge,
} from "@/features/workflows/types";

function parseStoredEdgeStyle(
  style: DbWorkflowEdge["style"],
): React.CSSProperties {
  if (style === null || typeof style !== "object" || Array.isArray(style)) {
    return {};
  }
  return style as React.CSSProperties;
}

export function edgeToReactFlow(dbEdge: DbWorkflowEdge): WorkflowEdge {
  const meta = (
    dbEdge.metadata && typeof dbEdge.metadata === "object"
      ? dbEdge.metadata
      : {}
  ) as EnrichedEdgeData["metadata"];
  const edgeData: EnrichedEdgeData = {
    id: dbEdge.id,
    source_node_id: dbEdge.source_node_id ?? "",
    target_node_id: dbEdge.target_node_id ?? "",
    source_handle: dbEdge.source_handle_id,
    target_handle: dbEdge.target_handle_id,
    edge_type: dbEdge.edge_type,
    animated: dbEdge.animated,
    style: dbEdge.style === null ? null : parseStoredEdgeStyle(dbEdge.style),
    connectionType: meta.connectionType ?? dbEdge.connection_type ?? undefined,
    sourceBrokerId: meta.sourceBrokerId || "",
    sourceBrokerName: meta.sourceBrokerName || "",
    targetBrokerId: meta.targetBrokerId || "",
    targetBrokerName: meta.targetBrokerName || "",
    metadata: meta,
    label: meta.label || dbEdge.label || "",
  };

  return {
    id: dbEdge.id,
    source: dbEdge.source_node_id ?? "",
    target: dbEdge.target_node_id ?? "",
    sourceHandle: dbEdge.source_handle_id,
    targetHandle: dbEdge.target_handle_id,
    type: dbEdge.edge_type || "default",
    animated: dbEdge.animated || false,
    style: parseStoredEdgeStyle(dbEdge.style),
    data: edgeData,
  };
}

export function reactFlowToEdge(
  reactFlowEdge: WorkflowEdge,
): Partial<DbWorkflowEdge> {
  const edgeData = reactFlowEdge.data;

  return {
    id: reactFlowEdge.id,
    source_node_id: reactFlowEdge.source,
    target_node_id: reactFlowEdge.target,
    source_handle_id: reactFlowEdge.sourceHandle ?? null,
    target_handle_id: reactFlowEdge.targetHandle ?? null,
    edge_type: reactFlowEdge.type ?? null,
    animated: reactFlowEdge.animated ?? null,
    style: reactFlowEdge.style as unknown as DbWorkflowEdge["style"],
    connection_type: edgeData.connectionType ?? null,
    label: edgeData.label || null,
    metadata: {
      connectionType: edgeData.connectionType,
      sourceBrokerId: edgeData.sourceBrokerId,
      sourceBrokerName: edgeData.sourceBrokerName,
      targetBrokerId: edgeData.targetBrokerId,
      targetBrokerName: edgeData.targetBrokerName,
      isKnownBroker: edgeData.metadata?.isKnownBroker,
      knownBrokerData: edgeData.metadata?.knownBrokerData,
      virtualEdgeFingerprint: edgeData.metadata?.virtualEdgeFingerprint,
      label: edgeData.label,
      ...edgeData.metadata,
    },
  };
}

export function createVirtualEdgeFingerprint(
  source: string,
  target: string,
  brokerId: string,
  connectionType: string,
): string {
  return `virtual_${source}_${target}_${brokerId}_${connectionType}`;
}

export function convertVirtualToSaved(
  virtualEdge: any,
  workflowId: string,
): Partial<DbWorkflowEdge> {
  const fingerprint = createVirtualEdgeFingerprint(
    virtualEdge.source,
    virtualEdge.target,
    virtualEdge.data.sourceBrokerId,
    virtualEdge.data.connectionType,
  );

  return {
    workflow_id: workflowId,
    source_node_id: virtualEdge.source,
    target_node_id: virtualEdge.target,
    source_handle_id: virtualEdge.sourceHandle ?? null,
    target_handle_id: virtualEdge.targetHandle ?? null,
    edge_type: virtualEdge.type ?? null,
    animated: virtualEdge.animated ?? null,
    style: virtualEdge.style as unknown as DbWorkflowEdge["style"],
    metadata: {
      ...virtualEdge.data.metadata,
      virtualEdgeFingerprint: fingerprint,
      connectionType: virtualEdge.data.connectionType,
      sourceBrokerId: virtualEdge.data.sourceBrokerId,
      sourceBrokerName: virtualEdge.data.sourceBrokerName,
      targetBrokerId: virtualEdge.data.targetBrokerId,
      targetBrokerName: virtualEdge.data.targetBrokerName,
      label: virtualEdge.data.label,
    },
  };
}

export function batchEdgesToReactFlow(
  dbEdges: DbWorkflowEdge[],
): WorkflowEdge[] {
  return dbEdges.map(edgeToReactFlow);
}

export async function saveWorkflowEdge(
  workflowId: string,
  edgeData: Partial<DbWorkflowEdge>,
): Promise<DbWorkflowEdge | null> {
  if (edgeData.id?.startsWith("virtual_")) {
    throw new Error(
      `Attempted to save virtual edge with ID: ${edgeData.id}. Virtual edges should be filtered out before saving.`,
    );
  }

  const { data: edge, error } = await supabase
    .from("workflow_edge")
    .upsert({
      ...edgeData,
      workflow_id: workflowId,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save edge: ${error.message}`);
  return edge;
}

export async function deleteWorkflowEdge(edgeId: string): Promise<void> {
  const { error } = await supabase
    .from("workflow_edge")
    .delete()
    .eq("id", edgeId);
  if (error) throw new Error(`Failed to delete edge: ${error.message}`);
}
