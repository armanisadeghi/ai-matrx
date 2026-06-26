import type { Json } from "@/types/database.types";

/**
 * Tables/views removed from `database.types.ts`. Access goes through shims that
 * log loudly at runtime so remaining callers can be found and migrated.
 *
 * @see functionality-helpers.ts for the same stub pattern on deleted RPC tables.
 */

export const DEPRECATED_TABLE_NAMES = [
  "workflow_data",
  "workflow_node_data",
  "workflow_user_input",
  "view_registered_function",
  "ai_tasks",
  "workflow",
  "workflow_node",
  "workflow_edge",
  "workflow_relay",
  "data_broker",
  "broker_values",
  "recipe_complete",
  "compiled_recipe",
  "conversations",
  "conversation_participants",
] as const;

export type DeprecatedTableName = (typeof DEPRECATED_TABLE_NAMES)[number];

// ---------------------------------------------------------------------------
// Row stubs — compile-time only; not authoritative schema.
// ---------------------------------------------------------------------------

export interface DeprecatedWorkflowDataRow {
  id: string;
  user_id: string | null;
  name: string | null;
  description: string | null;
  workflow_type: string | null;
  category: string | null;
  is_active: boolean | null;
  is_public: boolean | null;
  public_read: boolean | null;
  auto_execute: boolean | null;
  organization_id: string | null;
  version: number | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  inputs: Json | null;
  outputs: Json | null;
  dependencies: Json | null;
  sources: Json | null;
  destinations: Json | null;
  actions: Json | null;
  metadata: Json | null;
  viewport: Json | null;
  tags: Json | null;
}

export type DeprecatedWorkflowDataInsert = Partial<DeprecatedWorkflowDataRow>;
export type DeprecatedWorkflowDataUpdate = Partial<DeprecatedWorkflowDataRow>;

export interface DeprecatedWorkflowNodeDataRow {
  id: string;
  workflow_id: string | null;
  user_id: string | null;
  function_id: string | null;
  function_type: string | null;
  type: string | null;
  node_type: string | null;
  step_name: string | null;
  execution_required: boolean | null;
  is_active: boolean | null;
  is_public: boolean | null;
  public_read: boolean | null;
  status: string | null;
  arguments: Json | null;
  created_at: string;
  updated_at: string | null;
  inputs: Json | null;
  outputs: Json | null;
  dependencies: Json | null;
  metadata: Json | null;
  ui_data: Json | null;
}

export type DeprecatedWorkflowNodeDataInsert =
  Partial<DeprecatedWorkflowNodeDataRow>;
export type DeprecatedWorkflowNodeDataUpdate =
  Partial<DeprecatedWorkflowNodeDataRow>;

export interface DeprecatedWorkflowUserInputRow {
  id: string;
  workflow_id: string | null;
  user_id: string;
  broker_id: string;
  label: string | null;
  data_type: string | null;
  default_value: Json | null;
  is_required: boolean | null;
  field_component_id: string | null;
  metadata: Json | null;
  ui_node_data: Json | null;
  created_at: string;
  updated_at: string;
}

export type DeprecatedWorkflowUserInputInsert =
  Partial<DeprecatedWorkflowUserInputRow>;
export type DeprecatedWorkflowUserInputUpdate =
  Partial<DeprecatedWorkflowUserInputRow>;

export interface DeprecatedViewRegisteredFunctionRow {
  id: string;
  name: string;
  class_name: string | null;
  description: string | null;
  module_path: string;
}

export interface DeprecatedAiTasksRow {
  id: string;
  run_id: string;
  user_id: string;
  task_id: string;
  service: string;
  task_name: string;
  provider: string | null;
  endpoint: string | null;
  model: string | null;
  model_id: string | null;
  request_data: Json | null;
  response_text: string | null;
  response_data: Json | null;
  response_info: Json | null;
  response_errors: Json | null;
  tool_updates: Json | null;
  response_complete: boolean | null;
  response_metadata: Json | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_total: number | null;
  cost: number | null;
  time_to_first_token: number | null;
  total_time: number | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type DeprecatedAiTasksInsert = Partial<DeprecatedAiTasksRow>;
export type DeprecatedAiTasksUpdate = Partial<DeprecatedAiTasksRow>;

export interface DeprecatedWorkflowRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  viewport: Json | null;
  auto_execute: boolean | null;
  tags: Json | null;
  category: string | null;
  metadata: Json | null;
  is_deleted: boolean | null;
  created_at: string;
  updated_at: string;
}

export type DeprecatedWorkflowInsert = Partial<DeprecatedWorkflowRow>;
export type DeprecatedWorkflowUpdate = Partial<DeprecatedWorkflowRow>;

export interface DeprecatedWorkflowNodeRow {
  id: string;
  workflow_id: string | null;
  user_id: string | null;
  function_id: string | null;
  function_type: string | null;
  type: string | null;
  node_type: string | null;
  step_name: string | null;
  execution_required: boolean | null;
  is_active: boolean | null;
  is_public: boolean | null;
  public_read: boolean | null;
  status: string | null;
  arguments: Json | null;
  additional_dependencies: Json | null;
  arg_mapping: Json | null;
  arg_overrides: Json | null;
  return_broker_overrides: Json | null;
  metadata: Json | null;
  ui_node_data: Json | null;
  created_at: string;
  updated_at: string | null;
}

export type DeprecatedWorkflowNodeInsert = Partial<DeprecatedWorkflowNodeRow>;
export type DeprecatedWorkflowNodeUpdate = Partial<DeprecatedWorkflowNodeRow>;

export interface DeprecatedWorkflowEdgeRow {
  id: string;
  workflow_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  source_handle_id: string | null;
  target_handle_id: string | null;
  edge_type: string | null;
  connection_type: string | null;
  label: string | null;
  animated: boolean | null;
  style: Json | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

export type DeprecatedWorkflowEdgeInsert = Partial<DeprecatedWorkflowEdgeRow>;
export type DeprecatedWorkflowEdgeUpdate = Partial<DeprecatedWorkflowEdgeRow>;

export interface DeprecatedWorkflowRelayRow {
  id: string;
  workflow_id: string;
  user_id: string | null;
  label: string | null;
  source_broker_id: string;
  target_broker_ids: Json | null;
  metadata: Json | null;
  ui_node_data: Json | null;
  created_at: string;
  updated_at: string;
}

export type DeprecatedWorkflowRelayInsert = Partial<DeprecatedWorkflowRelayRow>;
export type DeprecatedWorkflowRelayUpdate = Partial<DeprecatedWorkflowRelayRow>;

export interface DeprecatedDataBrokerRow {
  id: string;
  name: string;
  user_id: string | null;
  data_type: string | null;
  color: string | null;
  default_value: Json | null;
  description: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

export type DeprecatedDataBrokerInsert = Partial<DeprecatedDataBrokerRow>;
export type DeprecatedDataBrokerUpdate = Partial<DeprecatedDataBrokerRow>;

export interface DeprecatedBrokerValuesRow {
  id: string;
  broker_id: string;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  ai_runs_id: string | null;
  ai_tasks_id: string | null;
  value: Json | null;
  scope_level: string | null;
  created_at: string;
  updated_at: string;
}

export type DeprecatedBrokerValuesInsert = Partial<DeprecatedBrokerValuesRow>;
export type DeprecatedBrokerValuesUpdate = Partial<DeprecatedBrokerValuesRow>;

export interface DeprecatedRecipeCompleteRow {
  recipe_id: string;
  name: string | null;
  description: string | null;
  metadata: Json | null;
}

export interface DeprecatedCompiledRecipeRow {
  id: string;
  recipe_id: string;
  created_at: string;
  metadata: Json | null;
}

export interface DeprecatedConversationsRow {
  id: string;
  type: string;
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type DeprecatedConversationsInsert = Partial<DeprecatedConversationsRow>;

export interface DeprecatedConversationParticipantsRow {
  conversation_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export type DeprecatedConversationParticipantsInsert =
  Partial<DeprecatedConversationParticipantsRow>;

const DEPRECATED_QUERY_ERROR = {
  message: "Deprecated table access — table no longer exists in DB schema",
  code: "DEPRECATED_TABLE",
  details: null,
  hint: "Search codebase for fromDeprecatedTable callers and migrate",
} as const;

export function logDeprecatedTableAccess(
  table: DeprecatedTableName,
  caller: string,
): void {
  console.error(
    `%c[DEPRECATED TABLE] ${table}`,
    "color: #ff4444; font-weight: bold; font-size: 14px",
    "\n📍 Caller:",
    caller,
    "\n⚠️  This table was removed from the database. The query returned empty/null.",
    "\n⚠️  Migrate this caller to the replacement table or delete the dead path.",
    "\nStack:",
    new Error().stack,
  );
}

const CHAIN_METHODS = new Set([
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "containedBy",
  "range",
  "overlaps",
  "filter",
  "match",
  "not",
  "or",
  "order",
  "limit",
  "offset",
  "single",
  "maybeSingle",
  "returns",
  "throwOnError",
  "textSearch",
]);

function createDeprecatedQueryBuilder(
  table: DeprecatedTableName,
  caller: string,
): unknown {
  logDeprecatedTableAccess(table, caller);

  const handler: ProxyHandler<object> = {
    get(_target, prop: string | symbol) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) => {
          resolve({
            data: null,
            error: DEPRECATED_QUERY_ERROR,
            count: null,
            status: 400,
            statusText: "Deprecated Table",
          });
        };
      }

      if (typeof prop === "string" && CHAIN_METHODS.has(prop)) {
        return (..._args: unknown[]) => new Proxy({}, handler);
      }

      if (prop === Symbol.toStringTag) {
        return "DeprecatedSupabaseQueryBuilder";
      }

      return (..._args: unknown[]) => new Proxy({}, handler);
    },
  };

  return new Proxy({}, handler);
}

/** Drop-in replacement for `supabase.from('<deprecated_table>')`. */
export function fromDeprecatedTable(
  table: DeprecatedTableName,
  caller: string,
): // eslint-disable-next-line @typescript-eslint/no-explicit-any
any {
  return createDeprecatedQueryBuilder(table, caller);
}
