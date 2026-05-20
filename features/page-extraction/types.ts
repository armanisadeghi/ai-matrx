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
  source_variations: SourceVariationKind[];
  chunking_strategy: ChunkingStrategy;
  is_saved: boolean;
  archived_at: string | null;
  /** When pdf_page is active, also attach one combined PDF of the whole
   *  chunk's pages (continuous cross-page context). Default false. */
  attach_combined_pdf: boolean;
  /** Extra inputs sourced from OTHER templates' result rows. See
   *  `ExtraExtractionInput` for the shape. The wiring is described in
   *  the migration `page_extraction_jobs_extra_inputs.sql`. */
  extra_inputs: ExtraExtractionInput[];
  model_overrides: Record<string, Json> | null;
  max_concurrent: number;
  /**
   * Per-job override of the source agent's `default_rag_boost`. When
   * non-null, derivatives produced by this job (and chunks the
   * page-extraction → kg_chunks bridge writes) inherit this value
   * instead of the agent default. Use when one job's output deserves a
   * different retrieval weight than the agent's usual output — e.g.
   * "this scope is reference data, boost harder" or "this scope is
   * noisy, demote."
   *
   * Null means "inherit the agent default" (the common case).
   */
  rag_boost: number | null;
  owner_id: string;
  organization_id: string | null;
  project_id: string | null;
  latest_run_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A reference to another template's result rows that gets injected as an
 * input variable for this template's agent.
 *
 *   { name: "medical_findings", source_job_id: "<uuid>" }
 *
 * `name` is the surface variable key — the Job's `variable_mapping`
 * routes it to a specific agent variable name. The backend filters to
 * results whose `source_pages` overlap the current chunk's pages so the
 * variable is per-chunk-relevant; when the source template's results
 * don't carry pages, the full result set is injected.
 */
export interface ExtraExtractionInput {
  name: string;
  source_job_id: string;
}

/**
 * What we send to the agent for each chunk. A Job can request multiple
 * variations simultaneously — e.g. `clean_text` + `pdf_page` to give the
 * agent both a textual summary and the actual page as an attachment.
 *
 * The Job's `variable_mapping` controls how each variation key is routed
 * to a specific agent variable. A `clean_text` variation might map to
 * `page_content`, while `raw_text` could map to `raw_page_content`.
 */
export type SourceVariationKind =
  | "clean_text" // per-page AI-cleaned text
  | "raw_text" // per-page raw OCR text
  | "pdf_page"; // each page rendered as a PDF attachment (Phase 2)

/**
 * Extension point for future chunking algorithms. Only `pages` is supported
 * today (size-based by page count). The placeholders are reserved so the
 * UI / Job form can grow without another migration.
 */
export type ChunkingStrategy = "pages" | "keyword" | "manual" | "section";

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

// ─── Template output columns (the table definition) ───────────────────────

/**
 * Where a column's value comes from. This is the key generalization that
 * lets a template's table have MORE or FEWER columns than any single
 * agent returns:
 *
 *   - agent      → filled from the extraction agent's output (mapped by
 *                  `agentField`). Drop agent fields you don't want simply
 *                  by not declaring a column for them.
 *   - validation → filled by a later validation/dedup/enrich agent pass
 *                  over the accumulated rows (Push 2). Empty until then.
 *   - manual     → filled by a human in the Results table (confirmation /
 *                  review / notes). Editable cells.
 *   - system     → filled automatically by the pipeline (page anchor,
 *                  source chunk, etc.). Read-only.
 */
export type ColumnSource = "agent" | "validation" | "manual" | "system";

export type ColumnType = "string" | "number" | "integer" | "boolean";

export interface ExtractionColumn {
  /** Stable key. For agent columns this is also the payload key written
   *  at persist time (today we read via `agentField`; Push 2 normalizes). */
  key: string;
  label: string;
  type: ColumnType;
  description?: string;
  source: ColumnSource;
  /** For source==="agent": which agent-output field maps into this column.
   *  Defaults to `key` when omitted. */
  agentField?: string;
}

/**
 * The template's own output schema. When present, it is the source of
 * truth for the Results table columns. When absent (or the legacy empty
 * JSON-schema), the table falls back to inheriting the agent's schema /
 * inferring columns from the data.
 */
export interface TemplateColumnsSchema {
  kind: "extraction_columns";
  columns: ExtractionColumn[];
}

// ─── Surface variable mapping ─────────────────────────────────────────────

/**
 * Canonical keys a surface (e.g. PDF Extractor) provides per chunk. A Job's
 * `variable_mapping` translates these to whatever variable names its agent
 * expects (e.g. `{ selection: "page_content", filename: "document_name" }`).
 *
 * Surfaces declare the contract; jobs do the mapping.
 *
 * The map is open: every entry in `source_variations` adds its own key too
 * (e.g. `clean_text`, `raw_text`), so a Job that wants multiple variations
 * can route each one to its own agent variable.
 */
export interface SurfaceChunkVariables {
  selection: string;
  content: string;
  filename: string;
  page_numbers: string;
  text_before?: string;
  text_after?: string;
  /** Per-variation keys (e.g. clean_text, raw_text). Populated by the surface
   *  based on the Job's `source_variations`. */
  [variationKey: string]: string | undefined;
}

// ─── Chunk preview (in-memory, computed before run) ──────────────────────

/**
 * What the chunk preview renders for each chunk. Lives entirely in the
 * client until the user clicks Run — at which point the same shape is
 * recomputed on the backend from the persisted Job + scope.
 */
export interface ChunkPreviewItem {
  chunkIndex: number;
  pageNumbers: number[];
  /** Concatenated text of all selected source variations, with page
   *  markers — what would be sent to the agent. */
  preview: string;
  /** Char counts keyed by source variation (e.g. clean_text → 4231). */
  charsByVariation: Record<SourceVariationKind, number>;
  /** Total char count across all variations for the chunk. */
  totalChars: number;
}

export interface ChunkStats {
  chunkCount: number;
  totalChars: number;
  avgChars: number;
  longestChars: number;
  shortestChars: number;
  emptyChunks: number;
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
      event: "page_run.delta";
      data: {
        page_run_id: string;
        /** Token fragment from the agent's streaming output. The frontend
         *  appends to a per-page-run buffer; the buffer renders live in
         *  the ChunkCard's expanded pane. */
        text: string;
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
        /** Full text the agent emitted (post-stream). Embedded so the UI
         *  has it immediately without a separate Realtime hop. */
        raw_response: string;
        /** Parsed JSON array (or null on parse failure). */
        parsed_payload: Record<string, Json>[] | null;
      };
    }
  | {
      event: "page_run.failed";
      data: {
        page_run_id: string;
        chunk_index: number;
        page_numbers: number[];
        error: string;
        /** Raw text the agent emitted. Helps the user diagnose parse
         *  failures (the agent often wrote commentary instead of JSON). */
        raw_response?: string;
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
