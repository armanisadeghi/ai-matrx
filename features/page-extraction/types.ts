/**
 * features/page-extraction/types.ts
 *
 * Type definitions for the per-page AI extraction system. Row shapes are
 * declared inline here (not pulled from generated `Database` types) so the
 * frontend compiles even before the schema regeneration step. When you
 * regenerate `types/database.types.ts` after running the migration, you can
 * optionally swap to the generated Row types — these stay 1:1 with the
 * Supabase columns.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

// ─── Wire-aligned shapes (1:1 with Supabase rows) ─────────────────────────

export interface PageExtractionJob {
  id: string;
  file_id: string;
  processed_document_id: string | null;
  name: string;
  description: string | null;
  agent_id: string | null;
  shortcut_id: string | null;
  variable_mapping: Record<string, string>;
  output_schema: Json;
  chunk_size: number;
  chunk_overlap: number;
  scope_pages: number[] | null;
  model_overrides: Record<string, Json> | null;
  max_concurrent: number;
  owner_id: string;
  organization_id: string | null;
  project_id: string | null;
  latest_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageExtractionRun {
  id: string;
  job_id: string;
  status: RunStatus;
  trigger_source: TriggerSource;
  triggered_by: string | null;
  chunk_count: number;
  completed_chunks: number;
  failed_chunks: number;
  result_count: number;
  total_cost: number;
  total_tokens: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  metadata: Record<string, Json>;
  created_at: string;
}

export interface PageExtractionPageRun {
  id: string;
  run_id: string;
  job_id: string;
  file_id: string;
  chunk_index: number;
  page_numbers: number[];
  page_ids: string[] | null;
  status: PageRunStatus;
  request_id: string | null;
  raw_response: string | null;
  parsed_payload: Json | null;
  parse_error: string | null;
  error: string | null;
  cost: number | null;
  tokens: number | null;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface PageExtractionResult {
  id: string;
  run_id: string;
  page_run_id: string;
  job_id: string;
  file_id: string;
  payload: Record<string, Json>;
  source_pages: number[];
  canonical_page: number | null;
  created_at: string;
}

export type PageExtractionJobInsert = Omit<
  PageExtractionJob,
  "id" | "created_at" | "updated_at" | "latest_run_id"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  latest_run_id?: string | null;
};

export type PageExtractionJobUpdate = Partial<PageExtractionJobInsert>;

// ─── Status unions (mirroring CHECK constraints) ──────────────────────────

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type PageRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type TriggerSource = "manual_ui" | "scheduled" | "api" | "tool_call";

// ─── Surface variable mapping ─────────────────────────────────────────────

/**
 * Canonical keys a surface (e.g. PDF Extractor) provides per chunk. A Job's
 * `variable_mapping` translates these to whatever variable names its agent
 * expects (e.g. `{ selection: "page_content", filename: "document_name" }`).
 *
 * Surfaces declare the contract; jobs do the mapping.
 */
export interface SurfaceChunkVariables {
  selection: string;
  content: string;
  filename: string;
  page_numbers: string;
  text_before?: string;
  text_after?: string;
}

// ─── Stream wire format ───────────────────────────────────────────────────

export type ExtractionStreamEvent =
  | { event: "run.started"; data: { run_id: string; chunk_count: number } }
  | {
      event: "page_run.started";
      data: {
        page_run_id: string;
        chunk_index: number;
        page_numbers: number[];
      };
    }
  | {
      event: "page_run.completed";
      data: {
        page_run_id: string;
        chunk_index: number;
        page_numbers: number[];
        result_count: number;
        cost: number;
        tokens: number;
        duration_ms: number;
      };
    }
  | {
      event: "page_run.failed";
      data: {
        page_run_id: string;
        chunk_index: number;
        page_numbers: number[];
        error: string;
      };
    }
  | {
      event: "run.completed";
      data: {
        run_id: string;
        result_count: number;
        completed_chunks: number;
        failed_chunks: number;
        total_cost: number;
        total_tokens: number;
      };
    }
  | { event: "run.failed"; data: { run_id: string; error: string } }
  | { event: "stream.error"; data: { message: string } };

// ─── Request bodies ───────────────────────────────────────────────────────

export interface RunExtractionRequest {
  job_id: string;
  scope_pages?: number[] | null;
  chunk_size?: number | null;
  max_concurrent?: number | null;
  dry_run?: boolean;
}

// ─── UI-friendly derived shapes ────────────────────────────────────────────

export interface ResultsTableRow {
  id: string;
  payload: Record<string, Json>;
  source_pages: number[];
  canonical_page: number | null;
  created_at: string;
}

export interface FlatObjectSchema {
  type: "object";
  properties: Record<string, FlatPropertySchema>;
  required?: string[];
}

export interface FlatPropertySchema {
  type: "string" | "number" | "integer" | "boolean";
  description?: string;
  enum?: (string | number)[];
}

export type JobOutputSchema =
  | FlatObjectSchema
  | { type: "array"; items: FlatObjectSchema };
