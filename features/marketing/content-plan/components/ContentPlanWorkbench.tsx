"use client";

/**
 * features/marketing/content-plan/components/ContentPlanWorkbench.tsx
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
import { useQueryClient } from "@tanstack/react-query";
import { Panel, type Layout } from "react-resizable-panels";

import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import type { AssociationEdge } from "@/features/scopes/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { buildContentPlanScope } from "../lib/content-plan-scope";
import {
  planKeys,
  usePlanEntities,
  usePlanNodes,
  usePlanProfiles,
  useReparentPlanNode,
} from "../data/hooks";
import { updatePlanNode } from "../data/service";
import {
  usePlanBulkDeepen,
  usePlanDeepen,
  usePlanGenerate,
} from "../hooks/useContentPlanAi";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  readSiteResearchTopicId,
  recordSiteResearchTopic,
} from "../setup/draft";
import { liveMatchesById, usePlanReality } from "../hooks/usePlanReality";
import { useCmsPageMap } from "../hooks/useCmsPageMap";
import { usePlanWorkspaceParams } from "../hooks/usePlanWorkspaceParams";
import { PlanGenerateBar } from "./PlanGenerateBar";
import { PlanRealityBar } from "./PlanRealityBar";
import type { PlanNodeRow } from "../types";
import { useContentPlanSites } from "./ContentPlanHeader";
import { EntityManager } from "./EntityManager";
import { NewNodeDialog } from "./NewNodeDialog";
import { NodePanel } from "./NodePanel";
import { PlanNodesTable } from "./PlanNodesTable";
import { PlanTree } from "./PlanTree";
import { SetupView } from "../setup/components/SetupView";

// React Flow is heavy and browser-only; the map chunk loads only when the
// user switches to it (the conditional render below is the deferral,
// ssr:false keeps it off the server). One boundary — nothing below it is
// split again.
const PillarMap = dynamic(
  () => import("./PillarMap").then((module) => module.PillarMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full flex-col gap-3 p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="min-h-0 flex-1" />
      </div>
    ),
  },
);

export function ContentPlanWorkbench({
  defaultLayout,
  layoutCookieName,
}: {
  /** Cookie-read initial sizes for the tree|panel split (SSR-correct). */
  defaultLayout?: Layout;
  layoutCookieName: string;
}) {
  const { siteId, view } = usePlanWorkspaceParams();
  const { sites, orgSites } = useContentPlanSites();
  const isMobile = useIsMobile();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [newNodeParentId, setNewNodeParentId] = useState<string | null>(null);
  const [newNodeOpen, setNewNodeOpen] = useState(false);

  // Resolve the selected site against EVERYTHING visible, not just the
  // org-scoped picker list — a shared ?site= link (or an org switch with a
  // stale param) must still render the brand banner and the add flows.
  const site =
    (sites.data ?? []).find((row) => row.id === siteId) ??
    orgSites.find((row) => row.id === siteId) ??
    null;
  const nodes = usePlanNodes(siteId);
  const entities = usePlanEntities(siteId);
  const profiles = usePlanProfiles(site?.organization_id ?? null);
  const reparent = useReparentPlanNode(siteId ?? "none");
  const generate = usePlanGenerate(siteId);
  // Owned here (not in NodePanel) so an in-flight deepen survives the
  // panel's per-node remount when the user selects another node.
  const deepen = usePlanDeepen(siteId);
  // Bulk deepen: the SAME deepen fanned over every empty-brief page.
  const bulkDeepen = usePlanBulkDeepen(siteId);
  const [bulkDeepenConfirm, setBulkDeepenConfirm] = useState(false);
  // Reality report (run from the header button — shared query cache).
  const reality = usePlanReality(siteId);
  const liveById = useMemo(
    () => liveMatchesById(reality.report),
    [reality.report],
  );
  // WF-11: what each node became on the paired CMS site (null = unpaired).
  const cmsPages = useCmsPageMap(siteId);

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
  // Bulk-deepen candidates: pages whose brief is empty (route order, so the
  // run walks the site top-down like a reader would).
  const emptyBriefNodes = useMemo(
    () =>
      nodeRows
        .filter((node) => !node.brief || node.brief.length === 0)
        .map((node) => ({
          id: node.id,
          route: node.route ?? node.label,
        }))
        .sort((a, b) => a.route.localeCompare(b.route)),
    [nodeRows],
  );
  const nodeById = useMemo(() => {
    const map = new Map<string, PlanNodeRow>();
    for (const node of nodeRows) map.set(node.id, node);
    return map;
  }, [nodeRows]);
  const selectedNode = selectedNodeId
    ? (nodeById.get(selectedNodeId) ?? null)
    : null;

  // Surface scope for the `matrx-user/content-plan` surface — built at
  // trigger time from ALREADY-LOADED query data (getScope never fetches).
  // The selected node's association edges live in the NodeAssociations
  // query cache; read them from the cache, never refetch.
  const queryClient = useQueryClient();

  // Research grounding for the generator: the site's recorded link is the
  // default; a session pick overrides it AND re-records the link (the same
  // key Setup and aidream's generate/deepen read). Declared after
  // `queryClient` — the handler invalidates the site-options cache so the
  // link never goes stale for other consumers.
  const [genTopicOverride, setGenTopicOverride] = useState<
    string | null | undefined
  >(undefined);
  const generateTopicId =
    genTopicOverride !== undefined
      ? genTopicOverride
      : readSiteResearchTopicId(site?.settings);
  const handleGenerateTopicChange = (topicId: string | null) => {
    setGenTopicOverride(topicId);
    if (siteId) {
      void recordSiteResearchTopic(siteId, topicId)
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: marketingKeys.siteOptions(),
          }),
        )
        .catch((error) => {
          toast.error(
            `Research link not recorded on the site: ${extractErrorMessage(error)}`,
          );
        });
    }
  };

  const getScope = useCallback(
    () =>
      buildContentPlanScope({
        view,
        siteId,
        site,
        siteOptions: orgSites,
        nodes: nodes.data,
        entities: entities.data,
        profiles: profiles.data,
        statusCategories: statusCategories.categories,
        selectedNode,
        selectedNodeEdges: selectedNode
          ? queryClient.getQueryData<AssociationEdge[]>(
              planKeys.nodeEdges(selectedNode.id),
            )
          : undefined,
      }),
    [
      view,
      siteId,
      site,
      orgSites,
      nodes.data,
      entities.data,
      profiles.data,
      statusCategories.categories,
      selectedNode,
      queryClient,
    ],
  );

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
      // One pass through the service, ONE list invalidation at the end —
      // not N mutations each refetching the whole site.
      void (async () => {
        const failures: string[] = [];
        for (const id of ids) {
          try {
            await updatePlanNode(id, { status_id: statusId });
          } catch (error) {
            failures.push(extractErrorMessage(error));
          }
        }
        await queryClient.invalidateQueries({
          queryKey: planKeys.nodes(siteId ?? "none"),
        });
        if (failures.length > 0) {
          toast.error(
            `Status change failed for ${failures.length} of ${ids.length} nodes: ${failures[0]}`,
          );
        } else {
          toast.success(`Status updated on ${ids.length} nodes.`);
        }
      })();
    },
    [queryClient, siteId],
  );

  const openNewNode = (parentId: string | null) => {
    setNewNodeParentId(parentId);
    setNewNodeOpen(true);
  };

  // Workspace-level write handler (manifest writeTargets): select_node opens
  // a plan node in the panel — the same UI move as a row/node click. The
  // per-view surfaces (setup/entities/node panel) mount their own nested
  // providers deeper in this tree and win resolution while active.
  // (Declared BEFORE the error early-return — hooks must run every render.)
  const getWriteHandlers = useCallback(
    () => ({
      select_node: (value: unknown) => {
        if (typeof value !== "string" || !value.trim()) {
          throw new Error("select_node expects a plan node UUID string");
        }
        if (!nodeById.has(value)) {
          throw new Error(
            `select_node: "${value}" is not a node in this plan (see plan_tree)`,
          );
        }
        setSelectedNodeId(value);
      },
    }),
    [nodeById],
  );

  if (sites.isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        Could not load sites: {extractErrorMessage(sites.error)}
      </div>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/content-plan"
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      <div className="flex h-full flex-col pt-[var(--shell-header-h)]">
        {site && !site.brand_id ? (
          <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            This site has no brand — the database rejects plan rows for it
            (loudly, by design). Assign a brand in Marketing → Sites, then plan.
          </div>
        ) : null}

        {reality.report &&
        (view === "tree" || view === "table" || view === "map") ? (
          <PlanRealityBar
            report={reality.report}
            showTreeHint={view === "tree" || view === "map"}
            onDismiss={reality.dismiss}
          />
        ) : null}

        {/* AI generation strip — plan-bearing views only; Setup and
          Entities have their own jobs. */}
        {siteId &&
        site?.brand_id &&
        !nodes.isLoading &&
        !nodes.isError &&
        (view === "tree" || view === "table" || view === "map") ? (
          <PlanGenerateBar
            nodeCount={nodeRows.length}
            run={generate.run}
            onStart={(options) =>
              // Send an explicit topic ONLY when the user picked one this
              // session — otherwise the server reads its own recorded link
              // from the live row, which can never be cache-stale.
              void generate.start({ ...options, researchTopicId: genTopicOverride })
            }
            onDismiss={generate.reset}
            researchTopicId={generateTopicId}
            onResearchTopicChange={handleGenerateTopicChange}
            bulkDeepen={bulkDeepen.run}
            emptyBriefCount={emptyBriefNodes.length}
            onBulkDeepen={() => setBulkDeepenConfirm(true)}
            onBulkDeepenCancel={bulkDeepen.cancel}
            onBulkDeepenDismiss={bulkDeepen.reset}
          />
        ) : null}

        <div className="min-h-0 flex-1">
          {!siteId ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-sm text-center">
                <p className="text-sm font-medium text-foreground">
                  Pick a site to start planning
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use the site picker in the header — the plan, entities, and
                  map all follow it.
                </p>
              </div>
            </div>
          ) : nodes.isError ? (
            <p className="p-6 text-sm text-destructive">
              Could not load the plan: {extractErrorMessage(nodes.error)}
            </p>
          ) : view === "setup" ? (
            // Keyed by site: a site switch must never carry one site's staged
            // counts/names into another site's draft.
            <SetupView key={siteId ?? "none"} />
          ) : view === "entities" && site ? (
            <EntityManager
              siteId={siteId}
              organizationId={site.organization_id}
            />
          ) : view === "table" ? (
            <PlanNodesTable
              nodes={nodeRows}
              isLoading={nodes.isLoading}
              isFetching={nodes.isFetching}
              selectedId={selectedNodeId}
              cmsPageById={cmsPages.pagesByNodeId}
              onSelect={setSelectedNodeId}
            />
          ) : view === "map" ? (
            <PillarMap
              nodes={nodeRows}
              statusSlugById={statusSlugById}
              liveById={liveById}
              onSelect={setSelectedNodeId}
              onReparent={(id, parentId) => handleReparent(id, parentId)}
              onBulkStatus={handleBulkStatus}
            />
          ) : nodes.isLoading ? (
            <TreeViewSkeleton />
          ) : isMobile ? (
            <PlanTree
              nodes={nodeRows}
              selectedId={selectedNodeId}
              statusSlugById={statusSlugById}
              liveById={liveById}
              cmsPageById={cmsPages.pagesByNodeId}
              onSelect={setSelectedNodeId}
              onReparent={handleReparent}
              onAddChild={openNewNode}
            />
          ) : (
            <ClientGroup
              id="content-plan"
              cookieName={layoutCookieName}
              orientation="horizontal"
              defaultLayout={defaultLayout}
              className="h-full w-full"
            >
              <Panel id="tree" defaultSize="32%" minSize="8%">
                <div className="h-full overflow-hidden">
                  <PlanTree
                    nodes={nodeRows}
                    selectedId={selectedNodeId}
                    statusSlugById={statusSlugById}
                    liveById={liveById}
                    cmsPageById={cmsPages.pagesByNodeId}
                    onSelect={setSelectedNodeId}
                    onReparent={handleReparent}
                    onAddChild={openNewNode}
                  />
                </div>
              </Panel>
              <Handle />
              <Panel id="detail" minSize="25%">
                <div className="h-full overflow-hidden">
                  {selectedNode ? (
                    <NodePanel
                      key={selectedNode.id}
                      allNodes={nodeRows}
                      node={selectedNode}
                      siteId={siteId}
                      entities={entities.data ?? []}
                      profiles={profiles.data ?? []}
                      onDeleted={() => setSelectedNodeId(null)}
                      deepen={deepen}
                      cmsPage={cmsPages.pagesByNodeId.get(selectedNode.id) ?? null}
                      cmsSiteId={cmsPages.map?.cmsSiteId ?? null}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6">
                      <div className="max-w-sm text-center">
                        <p className="text-sm font-medium text-foreground">
                          {nodeRows.length === 0
                            ? "No plan yet"
                            : "Nothing selected"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {nodeRows.length === 0
                            ? "Add a root node on the left — agents can fill in the bulk, you correct and approve."
                            : "Select a node to edit its brief, keyword, topics, and people."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            </ClientGroup>
          )}
        </div>

        {/* Map/table views and the mobile tree open the node in a right
          sheet — same panel, second presentation. Desktop tree renders it
          inline. */}
        {siteId && (view === "map" || view === "table" || isMobile) ? (
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
                  key={selectedNode.id}
                  allNodes={nodeRows}
                  node={selectedNode}
                  siteId={siteId}
                  entities={entities.data ?? []}
                  profiles={profiles.data ?? []}
                  onDeleted={() => setSelectedNodeId(null)}
                  deepen={deepen}
                  cmsPage={cmsPages.pagesByNodeId.get(selectedNode.id) ?? null}
                  cmsSiteId={cmsPages.map?.cmsSiteId ?? null}
                />
              ) : null}
            </SheetContent>
          </Sheet>
        ) : null}

        {siteId && site ? (
          <NewNodeDialog
            siteId={siteId}
            organizationId={site.organization_id}
            nodes={nodeRows}
            parent={
              newNodeParentId ? (nodeById.get(newNodeParentId) ?? null) : null
            }
            open={newNodeOpen}
            onOpenChange={setNewNodeOpen}
            onCreated={(node) => setSelectedNodeId(node.id)}
          />
        ) : null}

        <ConfirmDialog
          open={bulkDeepenConfirm}
          onOpenChange={setBulkDeepenConfirm}
          title={`Deepen ${emptyBriefNodes.length} page(s)?`}
          description="Runs the research-grounded deepen over every page with an empty brief — each gets brief bullets and cited sources written onto the node. Runs one page at a time; you can stop between pages. Pages that already have a brief are untouched."
          confirmLabel="Run bulk deepen"
          onConfirm={() => {
            setBulkDeepenConfirm(false);
            void bulkDeepen.start(emptyBriefNodes);
          }}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}

/** First-load skeleton for the tree view — mirrors the two-pane footprint. */
function TreeViewSkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-1/3 space-y-2.5 border-r border-border p-3">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
      <div className="flex-1 space-y-3 p-6">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="mt-4 h-40 w-full max-w-2xl" />
      </div>
    </div>
  );
}
