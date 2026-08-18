// features/workflow-runtime/browse/types.ts
//
// What is genuinely WORKFLOW-specific about the canonical entity list. The
// query/filter/facet/count shapes live in lib/entity-list/types.ts and the
// scope vocabulary in lib/list-scope/types.ts — this file is what remains when
// you take the feature out.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

/** One row, exactly as wfx_list_scoped returns it. Never hand-mirrored. */
export type WorkflowBrowseRow =
  Database["public"]["Functions"]["wfx_list_scoped"]["Returns"][number];

/**
 * Which of the fixed five scopes this surface supports. Workflows have no
 * industry corpus, so it declares four — the tab bar renders exactly these, in
 * this order.
 */
export const WORKFLOW_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
];

/** Fields the table can write back inline. */
export interface WorkflowRowEdit {
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}
