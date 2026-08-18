"use client";

// features/workflow-runtime/browse/listConfig.tsx
//
// /workflows/all expressed as an entity-list config (lib/entity-list).
// Everything workflow-specific about the list page lives HERE: the service
// functions, the column registry, the row-actions hook + its modals, and the
// card / compact-row renderers. The shell owns the rest.
//
// This replaced a bespoke card grid that had its own search box, its own
// filtering in JS over a 200-row page, no scopes, no sort, no columns, and a
// search field flush against the shell's glass header.

import dynamic from "next/dynamic";
import type {
  EntityListConfig,
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { relativeTime } from "@/lib/entity-list/columns";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { WORKFLOW_BROWSE_COLUMNS } from "./columns";
import {
  fetchWorkflowBrowsePage,
  fetchWorkflowFacets,
  fetchWorkflowScopeCounts,
  saveWorkflowRowEdits,
} from "./service";
import { useWorkflowRowActions } from "./useWorkflowRowActions";
import { runStatusLabel } from "../run-status";
import { WorkflowBrowseCards } from "./components/WorkflowBrowseCards";
import { WorkflowBrowseRows } from "./components/WorkflowBrowseRows";
import {
  WORKFLOW_LIST_SCOPES,
  type WorkflowBrowseRow,
  type WorkflowRowEdit,
} from "./types";

// Heavy, conditional, and only ever needed after a user action — the two rules
// that make a dynamic import worth its cost.
const ShareModal = dynamic(
  () =>
    import("@/features/sharing/components/ShareModal").then((m) => ({
      default: m.ShareModal,
    })),
  { ssr: false },
);

/** Raw run statuses become words in the filter panel AND the column header
 *  menu — the SAME function to both, so one value never has two names. */
const formatStatusFacet = (value: string) =>
  value === "__none__" ? "Never run" : runStatusLabel(value);

/**
 * Bridges useWorkflowRowActions (behaviour + modal state) to the shell's
 * actions contract, and renders the modals those actions open — singletons
 * keyed by the row being acted on, never one modal per row.
 */
function useWorkflowListRowActions(
  list: EntityListController<WorkflowBrowseRow>,
): EntityRowActionsResult<WorkflowBrowseRow> {
  const host = useWorkflowRowActions({
    patchRow: list.patchRow,
    removeRow: list.removeRow,
    refresh: list.refresh,
  });

  // No manual memoization — the React Compiler owns it (CLAUDE.md).
  const actions = {
    menuFor: host.menuFor,
    onOpenRow: host.openRow,
    onToggleFavorite: host.toggleFavorite,
  };

  const modals = (
    <>
      {host.shareWorkflow && (
        <ShareModal
          isOpen
          onClose={host.closeShare}
          resourceType="workflow"
          resourceId={host.shareWorkflow.id}
          resourceName={host.shareWorkflow.name}
        />
      )}
      {host.renameWorkflow && (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) host.closeRename();
          }}
          title="Rename workflow"
          defaultValue={host.renameWorkflow.name}
          confirmLabel="Rename"
          onConfirm={(next) => host.commitRename(next)}
        />
      )}
    </>
  );

  return { actions, modals };
}

export const workflowListConfig: EntityListConfig<WorkflowBrowseRow> = {
  surfaceKey: "workflows-browse",
  entityLabel: { singular: "workflow", plural: "workflows" },
  // A registered FEATURE_META key (see
  // features/agents/redux/conversation-history/source-registry.ts). Type-checking
  // is not the gate here; REGISTRATION is — a conversation stamped with an
  // unregistered feature is unfilterable in Settings -> Conversation Filters.
  sourceFeature: "workflow_run",
  // Lights up Attach To; with `resourceType` the right-click menu also offers
  // Share. `workflow` is a registered shareable resource
  // (features/organizations/resource-catalogue.ts), and unlike agents this
  // feature has no competing Share implementation in its own registry.
  getRowEntity: (row) => ({
    type: "workflow",
    id: row.id,
    title: row.name,
  }),
  scopes: WORKFLOW_LIST_SCOPES,
  service: {
    fetchPage: fetchWorkflowBrowsePage,
    fetchCounts: fetchWorkflowScopeCounts,
    fetchFacets: fetchWorkflowFacets,
  },
  columns: WORKFLOW_BROWSE_COLUMNS,
  // Bump whenever WORKFLOW_BROWSE_COLUMNS gains or loses a column, so existing
  // users get the new default column set instead of keeping every new one ON.
  prefsVersion: 1,
  getRowId: (row) => row.id,
  getRowName: (row) => row.name,
  // THE DOOR LAW: the Name cell is a real anchor to /workflows/[id], resolved
  // from the entity registry — so cmd-click, middle-click and keyboard focus
  // all reach the record. Row click goes to the same place.
  door: { token: "workflow" },
  useRowActions: useWorkflowListRowActions,
  favorite: {
    isFavorite: (row) => row.is_favorite,
    canToggle: (row) => row.is_owner,
    disabledTitle: "Shared workflows can't be favorited",
  },
  edit: {
    save: (row, edit) => saveWorkflowRowEdits(row.id, edit as WorkflowRowEdit),
  },
  deepSearch: { label: "Also search inside the steps" },
  facetSections: [
    {
      facet: "status",
      filterId: "status",
      label: "Last run",
      noneLabel: "Never run",
      formatValue: formatStatusFacet,
      searchPlaceholder: "Find status…",
    },
    {
      facet: "category",
      filterId: "category",
      label: "Categories",
      noneLabel: "Uncategorized",
      searchPlaceholder: "Find category…",
    },
    {
      facet: "tag",
      filterId: "tags",
      label: "Tags",
      noneLabel: "Untagged",
      searchPlaceholder: "Find tag…",
    },
    {
      facet: "visibility",
      filterId: "visibility",
      label: "Visibility",
      noneLabel: "None",
      minOptions: 2,
      countInLabel: false,
      searchPlaceholder: "Find…",
    },
  ],
  noneLabels: {
    category: "Uncategorized",
    tags: "Untagged",
    status: "Never run",
    organization_name: "No organization",
    owner_email: "No owner",
  },
  copy: {
    label: "Workflow",
    listLabel: "Workflows",
    location: "/workflows/all",
    rowKind: "workflow",
    listKind: "workflow-list",
    humanRow: (row) =>
      `${row.name}${row.category ? ` (${row.category})` : ""} — ${row.step_count ?? 0} steps, ` +
      `${Number(row.run_count ?? 0)} runs, last run ${
        row.last_run_at
          ? `${runStatusLabel(row.last_run_status)} ${relativeTime(row.last_run_at)}`
          : "never"
      }`,
    // Row copy lives in the "…" menu; the toolbar strip would be a lone pair of
    // unlabeled icons floating above the header.
    showRow: false,
    showToolbar: false,
  },
  views: {
    cards: (p) => (
      <WorkflowBrowseCards
        rows={p.rows}
        density={p.density}
        showOwner={p.showShared}
        menuFor={p.actions.menuFor}
        onOpenRow={p.actions.onOpenRow}
        onToggleFavorite={(row) => p.actions.onToggleFavorite?.(row)}
        hrefFor={p.hrefFor}
      />
    ),
    rows: (p) => (
      <WorkflowBrowseRows
        rows={p.rows}
        density={p.density}
        showOwner={p.showShared}
        menuFor={p.actions.menuFor}
        onOpenRow={p.actions.onOpenRow}
        onToggleFavorite={(row) => p.actions.onToggleFavorite?.(row)}
        hrefFor={p.hrefFor}
      />
    ),
  },
  emptyState: {
    title: "No workflows here",
    description: "Nothing matches this scope and filter combination.",
  },
};
