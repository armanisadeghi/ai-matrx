// Internal structure types matching Python dataclasses

import { UserDataReference } from "@/components/user-generated-table-data/tableReferences";
import { BrokerMapEntry } from "../brokerSlice/types";
import { Viewport } from "@xyflow/react";
import type {
  DeprecatedWorkflowDataInsert,
  DeprecatedWorkflowDataRow,
  DeprecatedWorkflowDataUpdate,
} from "@/utils/supabase/deprecated-tables";

export type NodeInputType =
  | "unused"
  | "arg_override"
  | "arg_mapping"
  | "user_input"
  | "environment"
  | "broker"
  | "direct";

export interface InputMapping {
  type?: NodeInputType;
  arg_name?: string | null;
  source_broker_id?: string | null;
  default_value?: any;
  ready?: boolean;
  use_system_default?: boolean;
  required?: boolean;
  data_type?: string;
  metadata?: Record<string, any>;
}

export interface ArgMapping {
  arg_name: string;
  ready: boolean;
}

// Simple type mapping
type MappingDetails = {
  user_input: BrokerMapEntry;
  arg_mapping: ArgMapping;
  dependency: Record<string, any>;
  environment: Record<string, any>;
  other: Record<string, any>;
};

export interface InputConfig<
  T extends keyof MappingDetails = keyof MappingDetails,
> {
  mappingType: T;
  scope:
    | "global"
    | "session"
    | "task"
    | "organization"
    | "user"
    | "workflow"
    | "action"
    | "temporary"
    | string;
  scopeId: string;
  brokerId: string;
  mappingDetails: MappingDetails[T];
  extraction?: "label" | "id" | "object" | "string" | null;
  metadata?: Record<string, any> | null;
}

export interface Bookmark {
  name?: string | null;
  path?: string[];
}

export interface Result {
  component?: string | null;
  bookmark?: Bookmark | null;
  metadata?: Record<string, any>;
}

export interface Relay {
  type?: string | null;
  id?: string | null;
}

export interface Output {
  broker_id: string | null;
  is_default_output: boolean;
  name: string | null;
  bookmark: Bookmark | null;
  conversion: any;
  data_type: string | null;
  result: Result | null;
  relays?: Relay[];
  metadata: Record<string, any>;
}

export interface Dependency {
  type?: string | null;
  id?: string | null;
  metadata?: Record<string, any>;
}

export interface BrokerDestination {
  [key: string]: any;
}

// Simple type mapping
type SourceDetailsMap = {
  user_data: UserDataReference;
  user_input: BrokerMapEntry;
  user_list: Record<string, any>;
  system_table: Record<string, any>;
  api: Record<string, any>;
  other: Record<string, any>;
};

export interface BrokerSourceConfig<
  T extends keyof SourceDetailsMap = keyof SourceDetailsMap,
> {
  brokerId: string;
  scope:
    | "global"
    | "session"
    | "task"
    | "organization"
    | "user"
    | "workflow"
    | "action"
    | "temporary"
    | string;
  sourceType: T;
  sourceDetails: SourceDetailsMap[T];
  extraction?: "label" | "id" | "object" | "string" | null;
  relays?: Relay[];
  metadata?: Record<string, any> | null;
}

export interface WorkflowMetadata {
  [key: string]: unknown;
}

// Raw Supabase rows. These change automatically on `pnpm types` regeneration.
export type WorkflowRow = DeprecatedWorkflowDataRow;
export type WorkflowRowInsert = DeprecatedWorkflowDataInsert;
export type WorkflowRowUpdate = DeprecatedWorkflowDataUpdate;

// JSON column names are asserted against the DB schema — a rename/removal
// upstream surfaces here (`_AssertJsonCols` resolves to `never`).
type WorkflowJsonCols =
  | "inputs"
  | "outputs"
  | "dependencies"
  | "sources"
  | "destinations"
  | "actions"
  | "metadata"
  | "viewport"
  | "tags";
type _AssertJsonCols = WorkflowJsonCols extends keyof WorkflowRow
  ? WorkflowJsonCols
  : never;

// App-level Workflow — same as the DB row, but JSON columns are narrowed to
// the runtime shapes the app uses. Non-JSON columns flow through from the DB.
export type Workflow = Omit<WorkflowRow, _AssertJsonCols> & {
  inputs: InputMapping[] | null;
  outputs: Output[] | null;
  dependencies: Dependency[] | null;
  sources: BrokerSourceConfig[] | null;
  destinations: BrokerDestination[] | null;
  actions: unknown[] | null;
  metadata: WorkflowMetadata | null;
  viewport: Viewport | null;
  tags: string[] | null;
};

export type WorkflowCreateInput = Omit<WorkflowRowInsert, _AssertJsonCols> & {
  inputs?: InputMapping[] | null;
  outputs?: Output[] | null;
  dependencies?: Dependency[] | null;
  sources?: BrokerSourceConfig[] | null;
  destinations?: BrokerDestination[] | null;
  actions?: unknown[] | null;
  metadata?: WorkflowMetadata | null;
  viewport?: Viewport | null;
  tags?: string[] | null;
};

export type WorkflowUpdateInput = Omit<WorkflowRowUpdate, _AssertJsonCols> & {
  inputs?: InputMapping[] | null;
  outputs?: Output[] | null;
  dependencies?: Dependency[] | null;
  sources?: BrokerSourceConfig[] | null;
  destinations?: BrokerDestination[] | null;
  actions?: unknown[] | null;
  metadata?: WorkflowMetadata | null;
  viewport?: Viewport | null;
  tags?: string[] | null;
};

export interface WorkflowState {
  entities: Record<string, Workflow>;
  ids: string[];
  activeId: string | null;
  selectedIds: string[];
  isDirty: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  fetchTimestamp: number | null;
  dataFetched: boolean;
}
