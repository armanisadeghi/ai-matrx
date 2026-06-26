import type { DeprecatedWorkflowEdgeRow } from "@/utils/supabase/deprecated-tables";
import { DataBrokerData } from "@/types/AutomationSchemaTypes";
import { Edge } from "reactflow";

export type DbWorkflowEdge = DeprecatedWorkflowEdgeRow;

export interface EnrichedEdgeData {
  id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  edge_type: string | null;
  animated: boolean | null;
  style: React.CSSProperties | null;
  connectionType?: string;
  sourceBrokerId: string;
  sourceBrokerName: string;
  targetBrokerId: string;
  targetBrokerName: string;
  metadata: {
    isKnownBroker?: boolean;
    knownBrokerData?: DataBrokerData;
    virtualEdgeFingerprint?: string;
    [key: string]: any;
  };
  label: string;
}

export type WorkflowEdge = Edge<EnrichedEdgeData>;
