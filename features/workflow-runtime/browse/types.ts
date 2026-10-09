// features/workflow-runtime/browse/types.ts
//
// What is genuinely WORKFLOW-specific about the canonical entity list. The
// query/filter/facet/count shapes live in lib/entity-list/types.ts and the
// scope vocabulary in lib/list-scope/types.ts — this file is what remains when
// you take the feature out.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";
import type { WithFilledMandates } from "@/features/mandates/filled-by/service";

/**
 * One row, exactly as wfx_list_scoped returns it (never hand-mirrored), plus
 * the mandates it fills for the viewer — attached per page by
 * `attachFilledMandates` (one `mnd_filled_by` call), never per row.
 */
export type WorkflowBrowseRow = WithFilledMandates<
  Database["public"]["Functions"]["wfx_list_scoped"]["Returns"][number] & {
    /**
     * Step warnings since the last edit. The live `wfx_list_scoped` does not return it
     * until `migrations/inverse/wfx_warnings_column.sql` (a chair step) is applied and
     * `database.types.ts` is regenerated; delete this intersection then. Absent reads as 0.
     */
    warning_count?: number | null;
  }
>;

/**
 * Which scopes this surface supports, in tab order — the same five as the
 * agents list (features/agents/browse/types.ts). System is the platform's own
 * workflows: every signed-in person reads the published built-ins, a platform
 * admin also reads the unpublished and feature-made ones. `wfx_list_scoped`
 * decides which, never this list; feature-made (`generated`) workflows never
 * reach a person's own lanes.
 */
export const WORKFLOW_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
  "system",
];

/** Fields the table can write back inline. */
export interface WorkflowRowEdit {
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}
