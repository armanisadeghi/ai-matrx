import type { Database, Json } from "@/types/database.types";
import type { AiTask, TaskStatus } from "@/features/ai-runs/types/aiRunTypes";

type AiTaskRow = Database["graveyard"]["Tables"]["ai_tasks"]["Row"];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `AiTask` uses `Record<string, any>` for flexible metadata; coerce validated objects only. */
function jsonToLooseMetadata(value: Json | null): Record<string, any> {
  if (value === null || value === undefined) return {};
  if (isPlainRecord(value)) return value as Record<string, any>;
  return {};
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
