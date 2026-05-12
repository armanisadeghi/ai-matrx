/**
 * features/page-extraction/services/run-from-draft.ts
 *
 * Takes an in-memory ChunkingConfigDraft and either:
 *   (a) reuses a saved Job that the user explicitly picked, OR
 *   (b) creates a new Job (ephemeral or named) from the draft
 *
 * Then dispatches the streaming Run. Returns the resolved Job + Run-start
 * promise. Validation (page range, chunk size, agent) lives upstream — the
 * service refuses to create a Job for an incomplete draft.
 */

"use client";

import { createJob } from "@/features/page-extraction/api/jobs";
import type {
  ChunkingConfigDraft,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import type {
  PageExtractionJob,
  PageExtractionJobInsert,
} from "@/features/page-extraction/types";

export interface DraftToJobOptions {
  fileId: string;
  /** Optional anchor to a processed_documents row that owns the page text. */
  processedDocumentId: string | null;
  /** auth.users.id of the runner. */
  ownerId: string;
  organizationId?: string | null;
  /** Human label when no explicit jobName is on the draft. */
  fallbackName: string;
}

export class DraftValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "DraftValidationError";
  }
}

export function validateDraft(draft: ChunkingConfigDraft): string[] {
  const issues: string[] = [];
  if (!draft.agentId) issues.push("Pick an agent.");
  if (draft.scopePages.length === 0)
    issues.push("Specify the page range.");
  if (draft.chunkSize == null || draft.chunkSize < 1)
    issues.push("Set a chunk size.");
  if (draft.sourceVariations.length === 0)
    issues.push("Pick at least one source variation.");
  // Empty variable_mapping means the agent's prompt template won't receive
  // any of our surface vars — the chunk text never reaches the model and
  // every agent call returns "[]". This is the silent failure mode that
  // caused the first round of broken runs. Block the run until there's
  // at least one wiring.
  if (
    draft.agentId &&
    Object.keys(draft.variableMapping).length === 0
  ) {
    issues.push(
      "Agent variables aren't wired yet. Wait for the agent definition to load (a moment after picking the agent).",
    );
  }
  return issues;
}

/**
 * Create a Job row from the draft. Throws DraftValidationError when the
 * draft isn't complete enough. The created Job's `is_saved` reflects
 * `draft.saveAsJob`.
 */
export async function createJobFromDraft(
  draft: ChunkingConfigDraft,
  opts: DraftToJobOptions,
): Promise<PageExtractionJob> {
  const issues = validateDraft(draft);
  if (issues.length > 0) throw new DraftValidationError(issues);

  const name =
    draft.jobName.trim() ||
    `${opts.fallbackName} — ${new Date().toLocaleString()}`;

  const insert: PageExtractionJobInsert = {
    file_id: opts.fileId,
    processed_document_id: opts.processedDocumentId,
    name,
    description: null,
    agent_id: draft.agentId,
    shortcut_id: null,
    variable_mapping: draft.variableMapping,
    output_schema: (draft.outputSchema ?? { type: "object", properties: {} }) as never,
    chunk_size: draft.chunkSize as number,
    chunk_overlap: draft.chunkOverlap,
    scope_pages: draft.scopePages,
    source_variations: draft.sourceVariations,
    chunking_strategy: draft.chunkingStrategy,
    is_saved: draft.saveAsJob,
    model_overrides: null,
    max_concurrent: draft.maxConcurrent,
    owner_id: opts.ownerId,
    organization_id: opts.organizationId ?? null,
    project_id: null,
  };

  return createJob(insert);
}
