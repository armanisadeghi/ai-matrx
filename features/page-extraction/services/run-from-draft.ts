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
import type { ChunkingConfigDraft } from "@/features/page-extraction/redux/pageExtractionSlice";
import type {
  PageExtractionJob,
  PageExtractionJobInsert,
  PageExtractionJobUpdate,
  SourceVariationKind,
} from "@/features/page-extraction/types";

/**
 * Surface keys that, when claimed by the variable mapping, imply the
 * corresponding `source_variation` must be enabled on the Job so the
 * Python backend actually computes that text shape per chunk. We used
 * to ask the user to tick checkboxes for these; now we derive them
 * automatically from the agent's variable wiring.
 */
const VARIATION_GATING_KEYS: ReadonlyArray<SourceVariationKind> = [
  "clean_text",
  "raw_text",
  "pdf_page",
];

/**
 * Derive the minimal `source_variations` list a Job needs from its
 * `variable_mapping`. A variation is required iff its name appears as
 * a key in the mapping (which means some agent variable is wired to
 * that chunk text shape).
 *
 * Returns `["clean_text"]` as a safety floor — the backend rejects an
 * empty list, and clean text is the most useful default. Users wiring
 * to other variations get those added on top automatically.
 */
export function deriveSourceVariations(
  mapping: Record<string, string>,
): SourceVariationKind[] {
  const claimed = new Set<SourceVariationKind>();
  for (const key of Object.keys(mapping)) {
    if (VARIATION_GATING_KEYS.includes(key as SourceVariationKind)) {
      claimed.add(key as SourceVariationKind);
    }
  }
  if (claimed.size === 0) claimed.add("clean_text");
  return Array.from(claimed);
}

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
 * (agent + at least one mapped variable). Page range / chunk size can be
 * set later before clicking Run.
 *
 * `source_variations` is no longer validated directly — it's derived
 * from `variable_mapping` at save time. As long as at least one agent
 * variable is wired, the derivation produces a non-empty list.
 */
export function validateDraft(draft: ChunkingConfigDraft): string[] {
  const issues: string[] = [];
  if (!draft.agentId) issues.push("Pick an agent.");
  if (draft.agentId && Object.keys(draft.variableMapping).length === 0) {
    issues.push("Wire at least one agent variable.");
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

  const name = draft.jobName.trim() || `${opts.fallbackName} extraction`;

  // `source_variations` is derived from the variable mapping — the
  // user doesn't tick boxes for it anymore. Whatever chunk text shape
  // they wire (clean_text / raw_text / pdf_page) ends up requested
  // from the backend.
  const sourceVariations = deriveSourceVariations(draft.variableMapping);

  // Saved templates are always is_saved=true going forward. The
  // distinction between "ad-hoc" and "saved" Jobs is going away — every
  // template the user creates is a named row they explicitly saved.
  if (opts.existingJobId) {
    const patch: PageExtractionJobUpdate = {
      name,
      agent_id: draft.agentId,
      variable_mapping: draft.variableMapping,
      output_schema: (draft.outputSchema ?? {
        type: "object",
        properties: {},
      }) as never,
      chunk_size: draft.chunkSize ?? 1,
      chunk_overlap: draft.chunkOverlap,
      scope_pages: draft.scopePages.length ? draft.scopePages : null,
      source_variations: sourceVariations,
      chunking_strategy: draft.chunkingStrategy,
      is_saved: true,
      extra_inputs: draft.extraInputs,
      attach_combined_pdf: draft.attachCombinedPdf,
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
    output_schema: (draft.outputSchema ?? {
      type: "object",
      properties: {},
    }) as never,
    chunk_size: draft.chunkSize ?? 1,
    chunk_overlap: draft.chunkOverlap,
    scope_pages: draft.scopePages.length ? draft.scopePages : null,
    source_variations: sourceVariations,
    chunking_strategy: draft.chunkingStrategy,
    is_saved: true,
    extra_inputs: draft.extraInputs,
    attach_combined_pdf: draft.attachCombinedPdf,
    model_overrides: null,
    max_concurrent: draft.maxConcurrent,
    // Null = inherit the agent's defaultRagBoost; a number overrides it
    // for this job's derivatives + chunks. Drafts default to null
    // (inherit) — users set non-null when they want this specific run
    // to outrank or underrank the agent's usual output.
    rag_boost: draft.ragBoost ?? null,
    owner_id: opts.ownerId,
    organization_id: opts.organizationId ?? null,
    project_id: null,
    archived_at: null,
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
  if (!arraysEqual(draft.scopePages, job.scope_pages ?? [])) return true;
  // `source_variations` is derived from the mapping at save time —
  // compare the *derived* shape against what's persisted, ignoring the
  // staler `draft.sourceVariations` (kept around only for back-compat).
  if (
    !arraysEqual(
      deriveSourceVariations(draft.variableMapping).slice().sort(),
      ((job.source_variations ?? []) as string[]).slice().sort(),
    )
  )
    return true;
  if (!shallowMapEqual(draft.variableMapping, job.variable_mapping ?? {}))
    return true;
  if (!extraInputsEqual(draft.extraInputs, job.extra_inputs ?? [])) return true;
  if ((draft.ragBoost ?? null) !== (job.rag_boost ?? null)) return true;
  if (draft.attachCombinedPdf !== (job.attach_combined_pdf ?? false))
    return true;
  return false;
}

function extraInputsEqual(
  a: { name: string; source_job_id: string }[],
  b: { name: string; source_job_id: string }[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    if (a[i].source_job_id !== b[i].source_job_id) return false;
  }
  return true;
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
