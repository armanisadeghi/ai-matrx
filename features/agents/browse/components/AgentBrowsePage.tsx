"use client";

// features/agents/browse/components/AgentBrowsePage.tsx
//
// The canonical feature-entry list page, proven on agents.
// Read features/agents/browse/FEATURE.md before changing the shape — this is
// the template every other feature's list page is meant to become.
//
// Two halves, deliberately separate:
//   STYLE (view, density, sort, page size, columns) → useListViewPrefs,
//     persisted per user and synced across devices.
//   QUERY (scope, search, filters, page) → useAgentBrowse, always starts clean.

import Link from "next/link";
import dynamic from "next/dynamic";
import { toast } from "@/lib/toast";
import { Plus, Network, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { useAgentBrowse } from "../useAgentBrowse";
import { useAgentRowActions } from "../useAgentRowActions";
import { BrowseScopeTabs } from "./BrowseScopeTabs";
import { BrowseToolbar } from "./BrowseToolbar";
import { AgentBrowseTable } from "./AgentBrowseTable";
import { AgentBrowseCards } from "./AgentBrowseCards";
import { AgentBrowseRows } from "./AgentBrowseRows";
import { AddToSetDialog } from "./AddToSetDialog";
import { ClassicViewNotice } from "./ClassicViewNotice";
import { DEFAULT_HIDDEN_COLUMNS } from "../columns";
import { saveAgentRowEdits } from "../service";
import {
  AGENT_LIST_SCOPES,
  type AgentBrowseRow,
  type AgentRowEdit,
} from "../types";

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

const SURFACE_KEY = "agents-browse";

// What THIS surface wants absent a stored user preference. Columns that are
// declared-but-off ship as the starting `hiddenColumns` — present in the
// picker from day one, never a code change away.
// Bump `version` whenever BROWSE_COLUMNS gains or loses a column, so existing
// users get the new default column set instead of silently keeping every new
// column switched on.
const SURFACE_DEFAULTS = { version: 4, hiddenColumns: DEFAULT_HIDDEN_COLUMNS };

export function AgentBrowsePage() {
  const { prefs, setPrefs, reset } = useListViewPrefs(
    SURFACE_KEY,
    SURFACE_DEFAULTS,
  );

  const browse = useAgentBrowse({
    sort: prefs.sort,
    direction: prefs.direction,
    favoritesFirst: prefs.favoritesFirst,
    pageSize: prefs.pageSize,
  });

  const actions = useAgentRowActions({
    patchRow: browse.patchRow,
    removeRow: browse.removeRow,
    refresh: browse.refresh,
  });

  // Owner / org / access columns only carry information outside "Mine", where
  // every row has the same owner. Offering them there is pure noise.
  const showSharedColumns = browse.query.scope.kind !== "mine";

  /**
   * Commit the table's pending inline edits. Each row is one UPDATE; the local
   * row is patched so the list reflects the change without a refetch flash,
   * and a failure re-throws so the table keeps the draft and toasts.
   */
  const saveEdits = async (edits: Record<string, AgentRowEdit>) => {
    const entries = Object.entries(edits);
    await Promise.all(
      entries.map(async ([agentId, edit]) => {
        await saveAgentRowEdits(agentId, edit);
        browse.patchRow(agentId, edit as Partial<AgentBrowseRow>);
      }),
    );
    toast.success(
      entries.length === 1
        ? "Agent updated"
        : `${entries.length} agents updated`,
    );
  };

  const newAgentButton = (
    <Button asChild size="sm" className="h-11 lg:h-7">
      <Link href="/agents/new" aria-label="New agent">
        <Plus className="h-4 w-4" />
        <span className="max-sm:sr-only">New agent</span>
      </Link>
    </Button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/*
        The scope tabs and toolbar are STATIC interactive content at the top, so
        they must clear the glass header rather than scroll behind it — hence
        pt-[var(--shell-header-h)] (never a hardcoded pt-12). Only the list body
        below scrolls behind the glass.
      */}
      <div className="shrink-0 space-y-1.5 px-3 pt-[calc(var(--shell-header-h)+0.5rem)] pb-2 sm:space-y-2">
        <ClassicViewNotice />
        <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
          <div className="min-w-0 flex-1 sm:flex-none">
            <BrowseScopeTabs
              scope={browse.query.scope}
              scopes={AGENT_LIST_SCOPES}
              counts={browse.counts}
              onChange={browse.setScope}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-11 lg:h-7"
            >
              <Link href="/agents/sets" aria-label="Agent sets">
                <Network className="h-4 w-4" />
                <span className="max-sm:sr-only">Sets</span>
              </Link>
            </Button>
            {newAgentButton}
          </div>
        </div>

        <BrowseToolbar
          query={browse.query}
          facets={browse.facets}
          isFetching={browse.isFetching}
          prefs={prefs}
          showSharedColumns={showSharedColumns}
          onSearch={browse.setSearch}
          onPatchQuery={browse.patchQuery}
          onPatchPrefs={setPrefs}
          onResetFilters={browse.resetFilters}
          onResetView={reset}
        />

        {browse.error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{browse.error}</span>
            <Button size="sm" variant="ghost" onClick={browse.refresh}>
              Retry
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {prefs.view === "table" ? (
          <AgentBrowseTable
            rows={browse.rows}
            total={browse.total}
            page={browse.query.page}
            pageSize={prefs.pageSize}
            sort={prefs.sort}
            direction={prefs.direction}
            filters={browse.query.filters}
            facets={browse.facets}
            isLoading={browse.isLoading}
            isFetching={browse.isFetching}
            density={prefs.density}
            showSharedColumns={showSharedColumns}
            hiddenColumns={prefs.hiddenColumns}
            menuFor={actions.menuFor}
            onOpenActionModal={actions.openActionModal}
            onToggleFavorite={actions.toggleFavorite}
            onSaveEdits={saveEdits}
            emptyAction={newAgentButton}
            onQueryChange={(next) => {
              if (
                next.sort !== prefs.sort ||
                next.direction !== prefs.direction ||
                next.pageSize !== prefs.pageSize
              ) {
                setPrefs({
                  sort: next.sort,
                  direction: next.direction,
                  pageSize: next.pageSize,
                });
              }
              if (
                JSON.stringify(next.filters) !==
                JSON.stringify(browse.query.filters)
              ) {
                browse.setFilters(next.filters);
              }
              browse.setPage(next.page);
            }}
          />
        ) : prefs.view === "cards" ? (
          <AgentBrowseCards
            rows={browse.rows}
            density={prefs.density}
            showOwner={showSharedColumns}
            menuFor={actions.menuFor}
            onOpenActionModal={actions.openActionModal}
            onToggleFavorite={actions.toggleFavorite}
          />
        ) : (
          <AgentBrowseRows
            rows={browse.rows}
            density={prefs.density}
            showOwner={showSharedColumns}
            menuFor={actions.menuFor}
            onOpenActionModal={actions.openActionModal}
            onToggleFavorite={actions.toggleFavorite}
          />
        )}

        {prefs.view !== "table" && (
          <LoadMoreFooter
            loaded={browse.rows.length}
            total={browse.total}
            page={browse.query.page}
            pageSize={prefs.pageSize}
            onPage={browse.setPage}
          />
        )}
      </div>

      {actions.actionAgent && (
        <AgentActionModal
          isOpen
          onClose={actions.closeActionModal}
          agentName={actions.actionAgent.name}
          agentDescription={actions.actionAgent.description ?? undefined}
          onRun={actions.actionModal.onRun}
          onEdit={actions.actionModal.onEdit}
          onView={actions.actionModal.onView}
          onDuplicate={actions.actionModal.onDuplicate}
          onShare={actions.actionModal.onShare}
          onDelete={actions.actionModal.onDelete}
          onCreateApp={actions.actionModal.onCreateApp}
          showDelete={actions.actionAgent.is_owner}
          isDeleting={actions.actionModal.isDeleting}
          isDuplicating={actions.actionModal.isDuplicating}
        />
      )}
      {actions.peekAgentId && (
        <AgentSneakPeekModal
          agentId={actions.peekAgentId}
          isOpen
          onClose={actions.closePeek}
          navigationIds={browse.rows.map((r) => r.id)}
        />
      )}
      {actions.shareAgent && (
        <ShareModal
          isOpen
          onClose={actions.closeShare}
          resourceType="agent"
          resourceId={actions.shareAgent.id}
          resourceName={actions.shareAgent.name}
        />
      )}
      {actions.addToSetAgent && (
        <AddToSetDialog
          open
          agentId={actions.addToSetAgent.id}
          agentName={actions.addToSetAgent.name}
          onClose={actions.closeAddToSet}
        />
      )}
    </div>
  );
}

function LoadMoreFooter({
  loaded,
  total,
  page,
  pageSize,
  onPage,
}: {
  loaded: number;
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const shownThrough = (page - 1) * pageSize + loaded;
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-4 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {shownThrough} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={shownThrough >= total}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
