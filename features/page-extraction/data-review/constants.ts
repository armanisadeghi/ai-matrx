/**
 * features/page-extraction/data-review/constants.ts
 *
 * Shared constants for the Extraction Data workspace.
 */

import type { EntityType } from "@/features/scopes/types";

/**
 * The context-system entity type for an extraction dataset (one
 * `page_extraction_jobs` row). Declared once here and in the
 * `EntityType` union; `set_entity_scopes` stores it verbatim.
 */
export const EXTRACTION_ENTITY_TYPE: EntityType =
  "page_extraction_job";

/** Catalog route. */
export const EXTRACTIONS_ROUTE = "/knowledge/extractions";

/** Deep link to one dataset's grid. */
export const extractionDatasetHref = (jobId: string): string =>
  `${EXTRACTIONS_ROUTE}/${jobId}`;

/**
 * Upper bound on a dataset name, in characters.
 *
 * There is no CHECK constraint behind this — `page_extraction_jobs.name` is a
 * plain text column — so it is a UI bound, and it lives here because TWO
 * callers have to agree on it: the `extraction_dataset_name` write target's
 * model-facing contract prose in
 * `features/surfaces/manifests/knowledge.manifest.ts`, and the handler in
 * `ExtractionDatasetClient` that throws above it. Both now interpolate this
 * constant, so the number an agent is TOLD is provably the number that is
 * ENFORCED — they were two hand-typed `120`s before, the re-typed-literal
 * failure mode the surface campaign keeps flagging.
 */
export const EXTRACTION_JOB_NAME_MAX_LENGTH = 120;
