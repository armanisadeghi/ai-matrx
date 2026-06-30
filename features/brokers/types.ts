import type { DbRpcRow } from "@/types/supabase-rpc";
import type { Database } from "@/types/database.types";
import { Constants } from "@/types/database.types";

import type {
  DeprecatedDataBrokerInsert,
  DeprecatedDataBrokerRow,
  DeprecatedDataBrokerUpdate,
} from "@/utils/supabase/deprecated-tables";

/** Canonical broker row — matches removed `public.data_broker`. */
export type DataBroker = DeprecatedDataBrokerRow;
export type CreateBrokerInput = DeprecatedDataBrokerInsert;
export type UpdateBrokerInput = DeprecatedDataBrokerUpdate;

export type DataType = Database["public"]["Enums"]["data_type"];
export type Color = Database["public"]["Enums"]["color"];

export const DATA_TYPES: DataType[] = [...Constants.public.Enums.data_type];
export const COLORS: Color[] = [...Constants.public.Enums.color];

export enum TaskStatus {
  INCOMPLETE = "incomplete",
  COMPLETED = "completed",
}

export enum AIRunStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
  DELETED = "deleted",
}

export enum AIRunSourceType {
  PROMPT = "prompt",
  CHAT = "chat",
  APPLET = "applet",
  COCKPIT = "cockpit",
  WORKFLOW = "workflow",
  CUSTOM = "custom",
}

export enum AITaskStatus {
  PENDING = "pending",
  STREAMING = "streaming",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logo_url?: string | null;
  website?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  is_personal?: boolean;
  settings?: Record<string, any>;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  // Add other project fields as needed
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  project_id?: string | null;
  status: string;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
  user_id?: string | null;
  authenticated_read?: boolean;
  parent_task_id?: string | null;
  priority?: string | null; // task_priority enum - type not defined in schema
  assignee_id?: string | null;
}

export interface AIRun {
  id: string;
  user_id: string;
  source_type: string;
  source_id?: string | null;
  name?: string | null;
  description?: string | null;
  tags?: string[];
  messages: any; // jsonb
  settings: Record<string, any>; // jsonb
  variable_values?: Record<string, any> | null; // jsonb
  broker_values?: Record<string, any> | null; // jsonb
  attachments?: any[]; // jsonb array
  metadata?: Record<string, any>; // jsonb
  status?: string;
  is_starred?: boolean;
  total_tokens?: number;
  total_cost?: number;
  message_count?: number;
  task_count?: number;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

export interface AITask {
  id: string;
  run_id: string;
  user_id: string;
  task_id: string;
  service: string;
  task_name: string;
  provider?: string | null;
  endpoint?: string | null;
  model?: string | null;
  model_id?: string | null;
  request_data: Record<string, any>; // jsonb
  response_text?: string | null;
  response_data?: any; // jsonb
  response_info?: any; // jsonb
  response_errors?: any; // jsonb
  tool_updates?: any; // jsonb
  response_complete?: boolean;
  response_metadata?: Record<string, any>; // jsonb
  tokens_input?: number | null;
  tokens_output?: number | null;
  tokens_total?: number | null;
  cost?: number | null;
  time_to_first_token?: number | null;
  total_time?: number | null;
  status?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

// Broker Value types
export type ScopeLevel =
  | "global"
  | "user"
  | "organization"
  | "project"
  | "task"
  | "ai_run"
  | "ai_task";

// Enum value arrays for iteration and mapping
export const TASK_STATUSES = Object.values(TaskStatus);
export const AI_RUN_STATUSES = Object.values(AIRunStatus);
export const AI_RUN_SOURCE_TYPES = Object.values(AIRunSourceType);
export const AI_TASK_STATUSES = Object.values(AITaskStatus);
export const SCOPE_LEVELS: ScopeLevel[] = [
  "global",
  "user",
  "organization",
  "project",
  "task",
  "ai_run",
  "ai_task",
];

export interface BrokerValue {
  id: string;
  broker_id: string;
  is_global: boolean;
  user_id?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  ai_runs_id?: string | null;
  ai_tasks_id?: string | null;
  value: any; // JSONB - can be any valid JSON
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

// Function result types
export interface ResolvedBrokerValue {
  broker_id: string;
  value: any;
  scope_level: ScopeLevel;
  scope_id: string;
}
type _CheckResolvedBrokerValue =
  ResolvedBrokerValue extends DbRpcRow<"get_broker_values_for_context">
    ? true
    : false;
declare const _resolvedBrokerValue: _CheckResolvedBrokerValue;
true satisfies typeof _resolvedBrokerValue;

export interface CompleteBrokerData {
  broker_id: string;
  broker_name: string;
  data_type: string;
  value: any | null;
  has_value: boolean;
  scope_level: ScopeLevel;
  scope_id: string;
  default_value: string;
  description: string;
}
type _CheckCompleteBrokerData =
  CompleteBrokerData extends DbRpcRow<"get_complete_broker_data_for_context">
    ? true
    : false;
declare const _completeBrokerData: _CheckCompleteBrokerData;
true satisfies typeof _completeBrokerData;

// Context for broker resolution
export interface BrokerContext {
  user_id?: string;
  organization_id?: string;
  project_id?: string;
  task_id?: string;
  ai_runs_id?: string;
  ai_tasks_id?: string;
}

export interface CreateBrokerValueInput {
  broker_id: string;
  value: any;
  is_global?: boolean;
  user_id?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  ai_runs_id?: string | null;
  ai_tasks_id?: string | null;
  created_by?: string | null;
}

export interface BulkBrokerValueInput {
  broker_id: string;
  value: any;
}

export interface BulkUpsertBrokerResult {
  broker_id: string;
  broker_value_id: string;
  success: boolean;
}
type _CheckBulkUpsertBrokerResult =
  BulkUpsertBrokerResult extends DbRpcRow<"bulk_upsert_broker_values">
    ? true
    : false;
declare const _bulkUpsertBrokerResult: _CheckBulkUpsertBrokerResult;
true satisfies typeof _bulkUpsertBrokerResult;
