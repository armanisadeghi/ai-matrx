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
