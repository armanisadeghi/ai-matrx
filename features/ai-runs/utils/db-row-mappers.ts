import type { Database, Json } from "@/types/database.types";
import type {
  AiRun,
  AiTask,
  Attachment,
  RunMessage,
  RunStatus,
  SourceType,
  TaskStatus,
} from "@/features/ai-runs/types/aiRunTypes";

type AiRunRow = Database["graveyard"]["Tables"]["ai_runs"]["Row"];
type AiTaskRow = Database["graveyard"]["Tables"]["ai_tasks"]["Row"];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `AiRun` / `AiTask` use `Record<string, any>` for flexible metadata; coerce validated objects only. */
function jsonToLooseMetadata(value: Json | null): Record<string, any> {
  if (value === null || value === undefined) return {};
  if (isPlainRecord(value)) return value as Record<string, any>;
  return {};
}

function jsonToStringRecord(value: Json | null): Record<string, string> {
  if (value === null || value === undefined || !isPlainRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean")
      out[k] = String(v);
  }
  return out;
}

function jsonToRunMessages(value: Json | null): RunMessage[] {
  if (value === null || !Array.isArray(value)) return [];
  return value as RunMessage[];
}

function jsonToAttachments(value: Json | null): Attachment[] {
  if (value === null || !Array.isArray(value)) return [];
  return value as Attachment[];
}

/** Read `messages` JSON column when only that field is selected. */
export function runMessagesFromJson(value: Json | null): RunMessage[] {
  return jsonToRunMessages(value);
}

export function mapAiRunRow(row: AiRunRow): AiRun {
  return {
    id: row.id,
    user_id: row.user_id,
    source_type: row.source_type as SourceType,
    source_id: row.source_id,
    name: row.name,
    description: row.description,
    tags: row.tags ?? [],
    messages: jsonToRunMessages(row.messages),
    settings: jsonToLooseMetadata(row.settings),
    variable_values: jsonToStringRecord(row.variable_values ?? null),
    broker_values: jsonToStringRecord(row.broker_values ?? null),
    attachments: jsonToAttachments(row.attachments ?? null),
    metadata: jsonToLooseMetadata(row.metadata ?? null),
    status: (row.status ?? "active") as RunStatus,
    is_starred: row.is_starred ?? false,
    total_tokens: row.total_tokens ?? 0,
    total_cost: Number(row.total_cost ?? 0),
    message_count: row.message_count ?? 0,
    task_count: row.task_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message_at: row.last_message_at,
  };
}

export function mapAiTaskRow(row: AiTaskRow): AiTask {
  return {
    id: row.id,
    run_id: row.run_id,
    user_id: row.user_id,
    task_id: row.task_id,
    service: row.service,
    task_name: row.task_name,
    provider: row.provider,
    endpoint: row.endpoint,
    model: row.model,
    model_id: row.model_id,
    request_data: jsonToLooseMetadata(row.request_data),
    response_text: row.response_text,
    response_data:
      row.response_data != null ? jsonToLooseMetadata(row.response_data) : null,
    response_info:
      row.response_info != null ? jsonToLooseMetadata(row.response_info) : null,
    response_errors:
      row.response_errors != null
        ? jsonToLooseMetadata(row.response_errors)
        : null,
    tool_updates:
      row.tool_updates != null ? jsonToLooseMetadata(row.tool_updates) : null,
    response_complete: row.response_complete ?? false,
    response_metadata:
      row.response_metadata != null
        ? jsonToLooseMetadata(row.response_metadata)
        : {},
    tokens_input: row.tokens_input,
    tokens_output: row.tokens_output,
    tokens_total: row.tokens_total,
    cost: row.cost,
    time_to_first_token: row.time_to_first_token,
    total_time: row.total_time,
    status: (row.status ?? "pending") as TaskStatus,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}
