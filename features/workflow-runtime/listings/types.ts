// features/workflow-runtime/listings/types.ts
//
// THE WORKFLOW PICKER'S VOCABULARY.
//
// A Workflow can hold a job exactly as an Agent can, so the control that picks
// one must be the equal of `AgentListDropdown` — same tabs, same search, same
// sort, same category/tag filters, same hover detail card, same sneak peek,
// same doors. This file is the small workflow-shaped half of that; everything
// generic (search box, filter chips, panel geometry) is IMPORTED from the
// agent listing core rather than re-invented.
//
// The row shape is DERIVED from `wfx_list_scoped` (the canonical workflow list
// RPC that already powers /workflows/all) — never hand-mirrored, so a column
// added there arrives here typed.

import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { ListScopeKind } from "@/lib/list-scope/types";
import type { WorkflowBrowseRow } from "../browse/types";

/** The four scopes a workflow list can answer. `system` has no workflow corpus. */
export type WorkflowTab = Extract<
  ListScopeKind,
  "mine" | "orgs" | "shared" | "public"
>;

export const WORKFLOW_PICKER_TABS: readonly {
  value: WorkflowTab;
  label: string;
}[] = [
  { value: "mine", label: "Mine" },
  { value: "orgs", label: "Team" },
  { value: "shared", label: "Shared" },
  { value: "public", label: "Public" },
];

/** Sort values the RPC accepts, in the order the panel offers them. */
export type WorkflowSortOption =
  | "updated-desc"
  | "created-desc"
  | "name-asc"
  | "name-desc"
  | "category-asc"
  | "steps-desc"
  | "runs-desc";

export const WORKFLOW_SORT_OPTIONS: {
  value: WorkflowSortOption;
  label: string;
}[] = [
  { value: "updated-desc", label: "Recent" },
  { value: "created-desc", label: "Created" },
  { value: "name-asc", label: "A → Z" },
  { value: "name-desc", label: "Z → A" },
  { value: "category-asc", label: "Category" },
  { value: "steps-desc", label: "Most steps" },
  { value: "runs-desc", label: "Most run" },
];

/** One picker option's sort split into the two arguments the RPC takes. */
export function sortArgs(option: WorkflowSortOption): {
  sort: string;
  direction: "asc" | "desc";
} {
  switch (option) {
    case "created-desc":
      return { sort: "created", direction: "desc" };
    case "name-asc":
      return { sort: "name", direction: "asc" };
    case "name-desc":
      return { sort: "name", direction: "desc" };
    case "category-asc":
      return { sort: "category", direction: "asc" };
    case "steps-desc":
      return { sort: "steps", direction: "desc" };
    case "runs-desc":
      return { sort: "runs", direction: "desc" };
    default:
      return { sort: "updated", direction: "desc" };
  }
}

/**
 * One workflow as the picker renders it: the RPC row plus the ONE thing the
 * RPC does not carry — the author's declared `output_kind`, which is what a
 * Mandate's bind gate compares against. Decorated in a second batched read
 * (`fetchWorkflowFacts`), never guessed.
 */
export interface WorkflowListRecord {
  row: WorkflowBrowseRow;
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  isFavorite: boolean;
  isOwner: boolean;
  accessLevel: string | null;
  visibility: string | null;
  organizationName: string | null;
  ownerEmail: string | null;
  version: number | null;
  stepCount: number;
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunId: string | null;
  isArchived: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** Author's declaration. `null` = undeclared, never "produces nothing". */
  outputKind: string | null;
}

export function toWorkflowListRecord(
  row: WorkflowBrowseRow,
  outputKind: string | null,
): WorkflowListRecord {
  return {
    row,
    id: row.id,
    name: row.name || "Untitled",
    description: row.description ?? null,
    category: row.category ?? null,
    tags: row.tags ?? [],
    isFavorite: Boolean(row.is_favorite),
    isOwner: Boolean(row.is_owner),
    accessLevel: row.access_level ?? null,
    visibility: row.visibility ?? null,
    organizationName: row.organization_name ?? null,
    ownerEmail: row.owner_email ?? null,
    version: row.version ?? null,
    stepCount: Number(row.step_count ?? 0),
    runCount: Number(row.run_count ?? 0),
    lastRunAt: row.last_run_at ?? null,
    lastRunStatus: row.last_run_status ?? null,
    lastRunId: row.last_run_id ?? null,
    isArchived: Boolean(row.is_archived),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    outputKind,
  };
}

/**
 * THE DOOR. Resolved from the entity registry, never hand-built — the registry
 * is what a route move updates, and a picker that mints its own path is the
 * dead link that outlives the move.
 */
export function workflowHref(id: string): string {
  const door = getEntityInfo("workflow").hrefFor;
  // The registry registers `workflow` with a route; the guard satisfies the
  // descriptor's optional type, it is not a doubt about the registration.
  return door ? door(id) : "/workflows/" + id;
}
