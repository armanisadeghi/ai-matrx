"use client";

// features/agents/browse/listConfig.tsx
//
// /agents/all expressed as an entity-list config — the first consumer of the
// generic shell (lib/entity-list). Everything agent-specific about the list
// page lives HERE: the service functions, the column registry, the row-actions
// hook + its modals, and the card / compact-row renderers.

import dynamic from "next/dynamic";
import type {
  EntityListConfig,
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { relativeTime } from "@/lib/entity-list/columns";
import { AddToSetDialog } from "./components/AddToSetDialog";
import { AgentBrowseCards } from "./components/AgentBrowseCards";
import { AgentBrowseRows } from "./components/AgentBrowseRows";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { BROWSE_COLUMNS } from "./columns";
import {
  fetchAgentBrowsePage,
  fetchBrowseFacets,
  fetchBrowseScopeCounts,
  saveAgentRowEdits,
} from "./service";
import { useAgentRowActions } from "./useAgentRowActions";
import {
  AGENT_LIST_SCOPES,
  type AgentBrowseRow,
  type AgentRowEdit,
} from "./types";

// Heavy, conditional, and only ever needed after a user action — the two rules
// that make a dynamic import worth its cost.
const AgentSneakPeekModal = dynamic(
  () =>
    import("@/features/agents/components/agent-listings/AgentSneakPeekModal").then(
      (m) => ({ default: m.AgentSneakPeekModal }),
    ),
  { ssr: false },
);
const ShareModal = dynamic(
  () =>
    import("@/features/sharing/components/ShareModal").then((m) => ({
      default: m.ShareModal,
    })),
  { ssr: false },
);
const AgentActionModal = dynamic(
  () =>
    import("@/features/agents/components/agent-listings/AgentActionModal").then(
      (m) => ({ default: m.AgentActionModal }),
    ),
  { ssr: false },
);

/**
 * Bridges useAgentRowActions (the feature's behaviour + modal state) to the
 * shell's actions contract, and renders the modals those actions open —
 * singletons keyed by the row being acted on, never one modal per row.
 */
function useAgentListRowActions(
  list: EntityListController<AgentBrowseRow>,
): EntityRowActionsResult<AgentBrowseRow> {
  const host = useAgentRowActions({
    patchRow: list.patchRow,
    removeRow: list.removeRow,
    refresh: list.refresh,
  });

  // No manual memoization — the React Compiler owns it (CLAUDE.md).
  const actions = {
    menuFor: host.menuFor,
    onOpenRow: host.openActionModal,
    onToggleFavorite: host.toggleFavorite,
  };

  const modals = (
    <>
      {host.actionAgent && (
        <AgentActionModal
          isOpen
          onClose={host.closeActionModal}
          agentName={host.actionAgent.name}
          agentDescription={host.actionAgent.description ?? undefined}
          onRun={host.actionModal.onRun}
          onEdit={host.actionModal.onEdit}
          onView={host.actionModal.onView}
          onDuplicate={host.actionModal.onDuplicate}
          onShare={host.actionModal.onShare}
          onDelete={host.actionModal.onDelete}
          onCreateApp={host.actionModal.onCreateApp}
          showDelete={host.actionAgent.is_owner}
          isDeleting={host.actionModal.isDeleting}
          isDuplicating={host.actionModal.isDuplicating}
        />
      )}
      {host.peekAgentId && (
        <AgentSneakPeekModal
          agentId={host.peekAgentId}
          isOpen
          onClose={host.closePeek}
          navigationIds={list.rows.map((r) => r.id)}
        />
      )}
      {host.shareAgent && (
        <ShareModal
          isOpen
          onClose={host.closeShare}
          resourceType="agent"
          resourceId={host.shareAgent.id}
          resourceName={host.shareAgent.name}
        />
      )}
      {host.addToSetAgent && (
        <AddToSetDialog
          open
          agentId={host.addToSetAgent.id}
          agentName={host.addToSetAgent.name}
          onClose={host.closeAddToSet}
        />
      )}
      {/* The menu's Rename entry. Was latent before the extraction: the state
          existed but no dialog rendered it, so Rename silently did nothing. */}
      {host.renameAgent && (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) host.closeRename();
          }}
          title="Rename agent"
          defaultValue={host.renameAgent.name}
          confirmLabel="Rename"
          onConfirm={(next) => host.commitRename(next)}
        />
      )}
    </>
  );

  return { actions, modals };
}

export const agentListConfig: EntityListConfig<AgentBrowseRow> = {
  surfaceKey: "agents-browse",
  entityLabel: { singular: "agent", plural: "agents" },
  sourceFeature: "agent",
  // Lights up Attach To. **NO `resourceType`**, deliberately: the agent action
  // registry already carries Share (`agentActionRegistry.tsx`), and the shell
  // feeds that same config to the right-click menu — so declaring a
  // resourceType would put v3's generic Share beside the registry's, two
  // implementations of one verb in one menu. The registry's Share wins because
  // it is the one every other agent surface uses.
  getRowEntity: (row) => ({
    type: "agent",
    id: row.id,
    title: row.name,
  }),
  scopes: AGENT_LIST_SCOPES,
  service: {
    fetchPage: fetchAgentBrowsePage,
    fetchCounts: fetchBrowseScopeCounts,
    fetchFacets: fetchBrowseFacets,
  },
  columns: BROWSE_COLUMNS,
  // Bump whenever BROWSE_COLUMNS gains or loses a column, so existing users
  // get the new default column set instead of keeping every new column ON.
  prefsVersion: 4,
  getRowId: (row) => row.id,
  getRowName: (row) => row.name,
  useRowActions: useAgentListRowActions,
  favorite: {
    isFavorite: (row) => row.is_favorite,
    canToggle: (row) => row.is_owner,
    disabledTitle: "Shared agents can't be favorited",
  },
  edit: {
    save: (row, edit) => saveAgentRowEdits(row.id, edit as AgentRowEdit),
  },
  deepSearch: { label: "Also search inside prompts" },
  facetSections: [
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
    organization_name: "No organization",
    owner_email: "No owner",
  },
  copy: {
    label: "Agent",
    listLabel: "Agents",
    location: "/agents",
    rowKind: "agent",
    listKind: "agent-list",
    humanRow: (row) =>
      `${row.name}${row.category ? ` (${row.category})` : ""} — updated ${relativeTime(row.updated_at)}`,
    // Row copy lives in the "…" menu; the toolbar strip would be a lone pair
    // of unlabeled icons floating above the header.
    showRow: false,
    showToolbar: false,
  },
  views: {
    cards: (p) => (
      <AgentBrowseCards
        rows={p.rows}
        density={p.density}
        showOwner={p.showShared}
        menuFor={p.actions.menuFor}
        onOpenActionModal={p.actions.onOpenRow}
        onToggleFavorite={(row) => p.actions.onToggleFavorite?.(row)}
      />
    ),
    rows: (p) => (
      <AgentBrowseRows
        rows={p.rows}
        density={p.density}
        showOwner={p.showShared}
        menuFor={p.actions.menuFor}
        onOpenActionModal={p.actions.onOpenRow}
        onToggleFavorite={(row) => p.actions.onToggleFavorite?.(row)}
      />
    ),
  },
  emptyState: {
    title: "No agents here",
    description: "Nothing matches this scope and filter combination.",
  },
};
