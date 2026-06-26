import type { Node } from "@xyflow/react";
import type {
  DeprecatedWorkflowNodeDataInsert,
  DeprecatedWorkflowNodeDataRow,
  DeprecatedWorkflowNodeDataUpdate,
} from "@/utils/supabase/deprecated-tables";
import type { InputMapping, Output, Dependency } from "../workflow/types";

export interface WorkflowRegisteredFunctionArg {
  name: string;
  required?: boolean;
  data_type?: string;
  ready?: boolean;
  default_value?: unknown;
  description?: string;
  examples?: unknown;
}

export interface WorkflowRegisteredFunctionBroker {
  id: string;
  name: string;
  color?: string | null;
  dataType?: string | null;
  defaultScope?: unknown;
  defaultValue?: unknown;
  inputComponent?: unknown;
  outputComponent?: unknown;
  fieldComponentId?: string | null;
}

export interface WorkflowRegisteredFunctionMetadata {
  id: string;
  name?: string;
  category?: string;
  description?: string;
  node_description?: string;
  tags?: unknown;
  icon?: string;
  args?: WorkflowRegisteredFunctionArg[];
  return_broker?: WorkflowRegisteredFunctionBroker | null;
}

export type WorkflowNodeDefinitionMetadata = {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  inputs?: unknown;
  outputs?: unknown;
} & Record<string, unknown>;

export interface WorkflowNodeMetadata {
  registered_function?: WorkflowRegisteredFunctionMetadata;
  nodeDefinitionId?: string;
  nodeDefinition?: WorkflowNodeDefinitionMetadata;
  [key: string]: unknown;
}

export interface WorkflowNodeUiData extends Omit<Node, "id" | "data"> {
  id?: never;
  data?: never;
}

export type XyFlowNodeType =
  | "default"
  | "functionNode"
  | "workflowNode"
  | "userInput"
  | "userDataSource"
  | "direct-input";

// Raw Supabase rows — these change automatically when the schema regenerates.
export type WorkflowNodeRow = DeprecatedWorkflowNodeDataRow;
export type WorkflowNodeRowInsert = DeprecatedWorkflowNodeDataInsert;
export type WorkflowNodeRowUpdate = DeprecatedWorkflowNodeDataUpdate;

// JSON column names are asserted against the DB schema so a rename/removal
// upstream triggers a compile error here rather than at every call site.
// If the DB schema drops one of these keys, the extends constraint fails.
type WorkflowNodeJsonCols =
  | "inputs"
  | "outputs"
  | "dependencies"
  | "metadata"
  | "ui_data";
type _AssertJsonCols = WorkflowNodeJsonCols extends keyof WorkflowNodeRow
  ? WorkflowNodeJsonCols
  : never;

// App-level WorkflowNode — same shape as the DB row, but Json columns are
// narrowed to the structures the app actually writes into them. All non-JSON
// columns flow straight through from the DB so column renames/removals
// surface as errors everywhere that touches them.
export type WorkflowNode = Omit<WorkflowNodeRow, _AssertJsonCols> & {
  inputs: InputMapping[] | null;
  outputs: Output[] | null;
  dependencies: Dependency[] | null;
  metadata: WorkflowNodeMetadata | null;
  ui_data: WorkflowNodeUiData | null;
};

export type WorkflowNodeCreateInput = Omit<
  WorkflowNodeRowInsert,
  _AssertJsonCols
> & {
  inputs?: InputMapping[] | null;
  outputs?: Output[] | null;
  dependencies?: Dependency[] | null;
  metadata?: WorkflowNodeMetadata | null;
  ui_data?: WorkflowNodeUiData | null;
};

export type WorkflowNodeUpdateInput = Omit<
  WorkflowNodeRowUpdate,
  _AssertJsonCols
> & {
  inputs?: InputMapping[] | null;
  outputs?: Output[] | null;
  dependencies?: Dependency[] | null;
  metadata?: WorkflowNodeMetadata | null;
  ui_data?: WorkflowNodeUiData | null;
};

export type WorkflowNodeStatus = "pending" | "executing" | "success" | "error";

export interface WorkflowNodeState {
  entities: Record<string, WorkflowNode>;
  ids: string[];
  activeId: string | null;
  selectedIds: string[];
  isDirty: Record<string, boolean>;
  status: Record<string, WorkflowNodeStatus>;
  results: Record<string, any>;
  isLoading: boolean;
  error: string | null;
  fetchTimestamp: number | null;
  dataFetched: boolean;
}
