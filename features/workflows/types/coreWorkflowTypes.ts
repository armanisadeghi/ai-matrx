import type { DeprecatedWorkflowRow } from "@/utils/supabase/deprecated-tables";
import type { NodeKnownBrokers } from "./knownBrokersTypes";

export interface WorkflowNodeMetadata {
  knownBrokers?: NodeKnownBrokers;
  ui?: Record<string, unknown>;
  custom?: Record<string, unknown>;
}

export type DbWorkflow = DeprecatedWorkflowRow;
