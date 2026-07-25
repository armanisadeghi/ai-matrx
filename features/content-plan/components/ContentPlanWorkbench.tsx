"use client";

/**
 * features/content-plan/components/ContentPlanWorkbench.tsx
 *
 * The Content Planning workspace body: tree editor + node panel (the
 * workhorse), pillar map (the flagship projection), entity manager. Route
 * chrome (site picker, view switch, refresh) lives in the shell PageHeader
 * (ContentPlanHeader); this body reads the same URL params. All data goes
 * direct-to-Supabase under RLS; the DB triggers own every derived value and
 * every rejection message — errors surface verbatim, wrapped in a friendly
 * toast. Agent-written nodes appear on refetch (header Refresh).
 */
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  usePlanEntities,
  usePlanNodes,
  usePlanProfiles,
  useReparentPlanNode,
  useUpdatePlanNode,
} from "../data/hooks";
import { usePlanWorkspaceParams } from "../hooks/usePlanWorkspaceParams";
import type { PlanNodeRow } from "../types";
import { useContentPlanSites } from "./ContentPlanHeader";
import { EntityManager } from "./EntityManager";
import { NewNodeDialog } from "./NewNodeDialog";
import { NodePanel } from "./NodePanel";
import { PlanTree } from "./PlanTree";

// React Flow is heavy and browser-only; the map chunk loads only when the
// user switches to it (the conditional render below is the deferral,
// ssr:false keeps it off the server). One boundary — nothing below it is
// split again.
const PillarMap = dynamic(
  () => import("./PillarMap").then((module) => module.PillarMap),
  {
    ssr: false,
    loading: () => (
      <p className="p-6 text-sm text-muted-foreground">Loading pillar map…</p>
    ),
  },
);

export function ContentPlanWorkbench() {
  const { siteId, view } = usePlanWorkspaceParams();
  const { sites, orgSites } = useContentPlanSites();
  const isMobile = useIsMobile();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [newNodeParentId, setNewNodeParentId] = useState<string | null>(null);
  const [newNodeOpen, setNewNodeOpen] = useState(false);

  const site = orgSites.find((row) => row.id === siteId) ?? null;
  const nodes = usePlanNodes(siteId);
  const entities = usePlanEntities(siteId);
  const profiles = usePlanProfiles(site?.organization_id ?? null);
  const reparent = useReparentPlanNode(siteId ?? "none");
  const update = useUpdatePlanNode(siteId ?? "none");

  const statusCategories = useCategories({
    dimension: CATEGORY_DIMENSIONS.planStatus,
  });
  const statusSlugById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of statusCategories.categories) {
      if (category.slug) map.set(category.id, category.slug);
    }
    return map;
  }, [statusCategories.categories]);

  const nodeRows = useMemo(() => nodes.data ?? [], [nodes.data]);
  const nodeById = useMemo(() => {
    const map = new Map<string, PlanNodeRow>();
    for (const node of nodeRows) map.set(node.id, node);
    return map;
  }, [nodeRows]);
  const selectedNode = selectedNodeId
    ? (nodeById.get(selectedNodeId) ?? null)
    : null;

  const handleReparent = useCallback(
    (id: string, parentId: string | null) => {
      reparent.mutate(
        { id, parentId },
        {
          onError: (error) =>
            toast.error(`Move rejected: ${extractErrorMessage(error)}`),
        },
      );
    },
    [reparent],
  );

  const handleBulkStatus = useCallback(
    (ids: string[], statusId: string) => {
      for (const id of ids) {
        update.mutate(
          { id, patch: { status_id: statusId } },
          {
            onError: (error) =>
              toast.error(
                `Status change failed for a node: ${extractErrorMessage(error)}`,
              ),
          },
        );
      }
    },
    [update],
  );

  const openNewNode = (parentId: string | null) => {
    setNewNodeParentId(parentId);
    setNewNodeOpen(true);
  };

  if (sites.isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        Could not load sites: {extractErrorMessage(sites.error)}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col pt-[var(--shell-header-h)]">
      {site && !site.brand_id ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          This site has no brand — the database rejects plan rows for it
          (loudly, by design). Assign a brand in Marketing → Sites, then plan.
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {!siteId ? (
          <p className="p-6 text-sm text-muted-foreground">
            Pick a site in the header to start planning its content.
          </p>
        ) : nodes.isError ? (
          <p className="p-6 text-sm text-destructive">
            Could not load the plan: {extractErrorMessage(nodes.error)}
          </p>
        ) : view === "entities" && site ? (
          <EntityManager siteId={siteId} organizationId={site.organization_id} />
        ) : view === "map" ? (
          <PillarMap
            nodes={nodeRows}
            statusSlugById={statusSlugById}
            onSelect={setSelectedNodeId}
            onReparent={(id, parentId) => handleReparent(id, parentId)}
            onBulkStatus={handleBulkStatus}
          />
        ) : (
          <div className="flex h-full">
            <div
              className={
                isMobile
                  ? "w-full"
                  : "w-[380px] shrink-0 border-r border-border"
              }
            >
              <PlanTree
                nodes={nodeRows}
                selectedId={selectedNodeId}
                statusSlugById={statusSlugById}
                onSelect={setSelectedNodeId}
                onReparent={handleReparent}
                onAddChild={openNewNode}
              />
            </div>
            {!isMobile ? (
              <div className="min-w-0 flex-1">
                {selectedNode ? (
                  <NodePanel
                    node={selectedNode}
                    siteId={siteId}
                    entities={entities.data ?? []}
                    profiles={profiles.data ?? []}
                    onDeleted={() => setSelectedNodeId(null)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="max-w-sm text-center text-sm text-muted-foreground">
                      {nodeRows.length === 0
                        ? "No plan yet. Add a root node on the left — agents can fill in the bulk, you correct and approve."
                        : "Select a node to edit its brief, keyword, topics, and people."}
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Map view and mobile tree open the node in a right sheet — same
          panel, second presentation. Desktop tree renders it inline. */}
      {siteId && (view === "map" || isMobile) ? (
        <Sheet
          open={selectedNode !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedNodeId(null);
          }}
        >
          <SheetContent
            side="right"
            className="w-full p-0 sm:w-[420px] sm:max-w-[420px]"
          >
            {selectedNode ? (
              <NodePanel
                node={selectedNode}
                siteId={siteId}
                entities={entities.data ?? []}
                profiles={profiles.data ?? []}
                onDeleted={() => setSelectedNodeId(null)}
              />
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}

      {siteId && site ? (
        <NewNodeDialog
          siteId={siteId}
          organizationId={site.organization_id}
          parent={
            newNodeParentId ? (nodeById.get(newNodeParentId) ?? null) : null
          }
          open={newNodeOpen}
          onOpenChange={setNewNodeOpen}
          onCreated={(node) => setSelectedNodeId(node.id)}
        />
      ) : null}
    </div>
  );
}
