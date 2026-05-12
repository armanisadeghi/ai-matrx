/**
 * features/page-extraction/services/run-from-draft.ts
 *
 * Template lifecycle helpers. Three distinct operations:
 *
 *   1. validateDraft(draft)        — list blocking issues, used by Save + Run
 *   2. saveTemplateFromDraft(...)  — INSERT a new Job or UPDATE an existing one
 *   3. validateForRun(draft, job)  — extra checks needed to actually run
 *
 * The form is the single editor surface; this module owns the rules.
 */

"use client";

import { createJob, updateJob } from "@/features/page-extraction/api/jobs";
import type {
  ChunkingConfigDraft,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import type {
  PageExtractionJob,
  PageExtractionJobInsert,
  PageExtractionJobUpdate,
} from "@/features/page-extraction/types";

export interface SaveTemplateOptions {
  fileId: string;
  processedDocumentId: string | null;
  ownerId: string;
  organizationId?: string | null;
  /** Human label when no explicit jobName is on the draft. */
  fallbackName: string;
  /** When set, UPDATE this job instead of INSERTing a new one. */
  existingJobId?: string | null;
}

export class DraftValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "DraftValidationError";
  }
}

/**
 * Save-level validation. Lighter than the run-level checks: we only refuse
 * a Save when the draft is missing things that would make the row invalid
 * (agent, source variations). Page range / chunk size can be set later
 * before clicking Run.
 */
export function validateDraft(draft: ChunkingConfigDraft): string[] {
  const issues: string[] = [];
  if (!draft.agentId) issues.push("Pick an agent.");
  if (draft.sourceVariations.length === 0)
    issues.push("Pick at least one source variation.");
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
 * Run-level validation. Save-level issues PLUS: page range must be
 * specified and chunk size must be set.
 */
export function validateForRun(draft: ChunkingConfigDraft): string[] {
  const issues = validateDraft(draft);
  if (draft.scopePages.length === 0) issues.push("Specify the page range.");
  if (draft.chunkSize == null || draft.chunkSize < 1)
    issues.push("Set a chunk size.");
  return issues;
}

/**
 * Persist the draft as a Job. If `existingJobId` is supplied, the Job is
 * UPDATED in place (template editing). Otherwise a new Job is inserted.
 *
 * Throws DraftValidationError when the draft is incomplete.
 */
export async function saveTemplateFromDraft(
  draft: ChunkingConfigDraft,
  opts: SaveTemplateOptions,
): Promise<PageExtractionJob> {
  const issues = validateDraft(draft);
  if (issues.length > 0) throw new DraftValidationError(issues);

  const name =
    draft.jobName.trim() || `${opts.fallbackName} extraction`;

  // Saved templates are always is_saved=true going forward. The
  // distinction between "ad-hoc" and "saved" Jobs is going away — every
  // template the user creates is a named row they explicitly saved.
  if (opts.existingJobId) {
    const patch: PageExtractionJobUpdate = {
      name,
      agent_id: draft.agentId,
      variable_mapping: draft.variableMapping,
      output_schema: (draft.outputSchema ??
        { type: "object", properties: {} }) as never,
      chunk_size: draft.chunkSize ?? 1,
      chunk_overlap: draft.chunkOverlap,
      scope_pages: draft.scopePages.length ? draft.scopePages : null,
      source_variations: draft.sourceVariations,
      chunking_strategy: draft.chunkingStrategy,
      is_saved: true,
      model_overrides: null,
      max_concurrent: draft.maxConcurrent,
    };
    return updateJob(opts.existingJobId, patch);
  }

  const insert: PageExtractionJobInsert = {
    file_id: opts.fileId,
    processed_document_id: opts.processedDocumentId,
    name,
    description: null,
    agent_id: draft.agentId,
    shortcut_id: null,
    variable_mapping: draft.variableMapping,
    output_schema: (draft.outputSchema ??
      { type: "object", properties: {} }) as never,
    chunk_size: draft.chunkSize ?? 1,
    chunk_overlap: draft.chunkOverlap,
    scope_pages: draft.scopePages.length ? draft.scopePages : null,
    source_variations: draft.sourceVariations,
    chunking_strategy: draft.chunkingStrategy,
    is_saved: true,
    model_overrides: null,
    max_concurrent: draft.maxConcurrent,
    owner_id: opts.ownerId,
    organization_id: opts.organizationId ?? null,
    project_id: null,
  };

  return createJob(insert);
}

/**
 * Compare draft against a persisted Job. Returns true when the draft has
 * unsaved changes the user would lose if they hit Run before Save.
 *
 * Compared fields are the ones `saveTemplateFromDraft` writes — anything
 * that doesn't round-trip through Save is excluded.
 */
export function draftDiffersFromJob(
  draft: ChunkingConfigDraft,
  job: PageExtractionJob | null | undefined,
): boolean {
  if (!job) return true;
  if (draft.agentId !== job.agent_id) return true;
  if ((draft.chunkSize ?? 1) !== job.chunk_size) return true;
  if (draft.chunkOverlap !== job.chunk_overlap) return true;
  if (draft.maxConcurrent !== job.max_concurrent) return true;
  if (draft.chunkingStrategy !== job.chunking_strategy) return true;
  if (draft.jobName.trim() && draft.jobName.trim() !== job.name) return true;
  if (
    !arraysEqual(draft.scopePages, job.scope_pages ?? [])
  )
    return true;
  if (
    !arraysEqual(
      draft.sourceVariations,
      (job.source_variations ?? []) as string[],
    )
  )
    return true;
  if (!shallowMapEqual(draft.variableMapping, job.variable_mapping ?? {}))
    return true;
  return false;
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function shallowMapEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}
