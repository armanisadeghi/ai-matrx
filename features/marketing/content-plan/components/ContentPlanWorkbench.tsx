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

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  buildGroomerPresetPayload,
  groomerPresetVariants,
  type AgentCopyGroomerConfig,
} from "@/components/agent-copy/groomer-types";
import { webLocation } from "@/features/marketing/lib/copy-payloads";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { Skeleton } from "@/components/ui/skeleton";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { useIsMobile } from "@/hooks/use-mobile";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import type { AssociationEdge } from "@/features/scopes/types";
import {
  SurfaceRuntimeProvider,
  useSurfaceClientTools,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { buildContentPlanScope } from "../lib/content-plan-scope";
import {
  contentPlanKpiLine,
  contentPlanKpis,
  driftItemSummary,
  planEntitySummary,
  planNodeKeyFields,
  planNodeSummary,
} from "../format";
import {
  planKeys,
  usePlanEntities,
  useSiteParties,
  usePlanNodes,
  useNodeSteps,
  usePlanProfiles,
  useReparentPlanNode,
} from "../data/hooks";
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
import { useSitePipeline } from "../hooks/useSitePipeline";
import { SitePipelineStrip } from "./SitePipelineStrip";
import { usePlanMeasureOverlay } from "../hooks/usePlanMeasureOverlay";
import {
  PLAN_VIEWS,
  usePlanWorkspaceParams,
  type PlanView,
} from "../hooks/usePlanWorkspaceParams";
import { PlanAssistStrip } from "./PlanAssistStrip";
import { PlanDriftBar } from "./PlanDriftBar";
import { RunSetWindowController } from "@/features/agents/components/live-run/RunSetDisplay";
import { PlanDriftSheet, type DriftFilter } from "./PlanDriftSheet";
import { PlanToolbar } from "./PlanToolbar";
import { usePlanDrift } from "../hooks/usePlanDrift";
import type { PlanNodeRow } from "../types";
import { buildNodePipelineProgress } from "../lib/pipeline-progress";
import { useContentPlanSites } from "./ContentPlanHeader";
import { EntityManager } from "./EntityManager";
import { NewNodeDialog } from "./NewNodeDialog";
import { NodePanel } from "./NodePanel";
import { PlanAiRunsView } from "./PlanAiRunsView";
import { PlanNodesTable } from "./PlanNodesTable";
import { PlanTree } from "./PlanTree";
import { SetupView } from "../setup/components/SetupView";
import { useCmsLink } from "../setup/hooks";

// The map chunk loads only when the user switches to it (the conditional
// render below is the deferral; ssr:false keeps the split shape unchanged).
// One boundary — nothing below it is split again.
const SiteMap = dynamic(
  () => import("./SiteMap").then((module) => module.SiteMap),
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

/** The surface this workspace body mounts (manifest `content-plan`). */
const SURFACE_NAME = "matrx-user/content-plan";

/**
 * Views that actually SHOW the selected node. `table` is excluded on purpose:
 * its detail panel is driven by MatrxDataTable's own row selection, not by
 * `selectedNodeId`, so selecting a node while the table is open moves nothing
 * on screen. `setup` / `entities` / `ai-runs` render no node panel at all.
 */
const NODE_PANEL_VIEWS: readonly PlanView[] = ["tree", "map"];

/** Human names for the `?view=` values, used by the page heading. */
const VIEW_HEADINGS: Record<PlanView, string> = {
  setup: "Site setup",
  tree: "Plan tree",
  table: "Plan table",
  map: "Pillar map",
  entities: "People, companies and sources",
  "ai-runs": "AI runs",
};

export function ContentPlanWorkbench({
  defaultLayout,
  layoutCookieName,
}: {
  /** Cookie-read initial sizes for the tree|panel split (SSR-correct). */
  defaultLayout?: Layout;
  layoutCookieName: string;
}) {
  const { siteId, view, nodeId, setView } = usePlanWorkspaceParams();
  const { sites, orgSites } = useContentPlanSites();
  const isMobile = useIsMobile();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodeId);
  const [lastNodeParam, setLastNodeParam] = useState<string | null>(nodeId);
  const [newNodeParentId, setNewNodeParentId] = useState<string | null>(null);
  const [newNodeOpen, setNewNodeOpen] = useState(false);
  const [driftOpen, setDriftOpen] = useState(false);
  const [driftFilter, setDriftFilter] = useState<DriftFilter>("all");

  // Flat entity doors land with `?node=`. React's render-time prop adjustment
  // keeps browser navigation synchronized without a cascading effect render.
  if (nodeId !== lastNodeParam) {
    setLastNodeParam(nodeId);
    if (nodeId) setSelectedNodeId(nodeId);
  }

  // Resolve the selected site against EVERYTHING visible, not just the
  // org-scoped picker list — a shared ?site= link (or an org switch with a
  // stale param) must still render the brand banner and the add flows.
  const site =
    (sites.data ?? []).find((row) => row.id === siteId) ??
    orgSites.find((row) => row.id === siteId) ??
    null;
  const siteResearchLinks = useContainerLinks({
    containerType: "web_site",
    containerId: siteId,
    orgId: site?.organization_id,
  });
  const siteResearchEdges = [
    ...siteResearchLinks.linksFor("research_topic"),
    ...siteResearchLinks.linksFor("research_tag"),
  ];
  const siteResearchTitles = useEntityTitles(
    siteResearchEdges.map((edge) => ({
      token: edge.token,
      id: edge.resourceId,
      label: edge.label,
    })),
  );
  const nodes = usePlanNodes(siteId);
  const nodeSteps = useNodeSteps(siteId);
  const entities = usePlanEntities(siteId);
  // access-errors: ok — party options for the node panels; a failed read only trims options, the plan nodes are the workbench's primary
  const siteParties = useSiteParties(siteId);
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
  // WF-11: resolve the CMS prerequisite BEFORE asking for CMS-only data.
  // Planning itself does not require a CMS site, so an unlinked plan stays a
  // normal no-overlay state instead of manufacturing a red HTTP error.
  const usesCmsOverlay = view === "tree" || view === "table" || view === "map";
  const cmsLink = useCmsLink(site, usesCmsOverlay);
  const cmsPages = useCmsPageMap(
    siteId,
    cmsLink.data?.linked ? cmsLink.data.cmsSiteId : null,
  );
  // The RESOLVED link, not the page map's echo of it: a linked site with zero
  // pages yet still has a website, and the node panel must say "not built"
  // rather than "no website" while the map is empty or still loading.
  const resolvedCmsSiteId =
    (cmsLink.data?.linked ? cmsLink.data.cmsSiteId : null) ??
    cmsPages.map?.cmsSiteId ??
    null;
  // THE AFTER for the whole plan in ONE read — what every realized page is
  // doing in Search Console, keyed by the `web.page` the CMS row is joined to.
  // Nothing joined yet (today's production state) = no read at all.
  const measure = usePlanMeasureOverlay(cmsPages.pagesByNodeId);
  // The SITE-level pipeline (Arman, 2026-08-21: the page rail's steps, at the
  // top level) — server-derived from live rows, rendered in the toolbar's KPI
  // zone. Each stage chip jumps to the view where that stage's work happens.
  const sitePipeline = useSitePipeline(siteId);
  const handlePipelineStage = useCallback(
    (key: string) => {
      const target: PlanView =
        key === "plan"
          ? "tree"
          : key === "content" || key === "draft"
            ? "table"
            : "setup";
      setView(target);
    },
    [setView],
  );

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
  const pipelineByNodeId = buildNodePipelineProgress(nodeSteps.data ?? []);
  const drift = usePlanDrift(siteId, resolvedCmsSiteId, nodeRows);

  // 🚨 THE WHAT-I-SEE LAW. The numbers the workspace LEADS with — the website
  // bar's built/live counts and the drift bar's difference counts — computed
  // ONCE here and handed to every payload on this page (panel included), so a
  // copied payload and the strips above it can never disagree.
  const builtCount = Math.min(cmsPages.pagesByNodeId.size, nodeRows.length);
  const liveCount = [...cmsPages.pagesByNodeId.values()].filter(
    (page) => page.isPublished,
  ).length;
  const unplannedCount = (cmsPages.map?.pages ?? []).filter(
    (page) => !page.planNodeId,
  ).length;
  const pageKpis = useMemo(
    () =>
      contentPlanKpis({
        plannedCount: nodeRows.length,
        builtCount: resolvedCmsSiteId ? builtCount : null,
        liveCount: resolvedCmsSiteId ? liveCount : null,
        unplannedCount: resolvedCmsSiteId ? unplannedCount : null,
        drift: drift.model,
      }),
    [
      nodeRows.length,
      resolvedCmsSiteId,
      builtCount,
      liveCount,
      unplannedCount,
      drift.model,
    ],
  );
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
        siteResearchLineage: {
          status: siteId ? siteResearchLinks.status : "ready",
          error: siteResearchLinks.error,
          items: siteResearchEdges.map((edge) => ({
            token: edge.token,
            id: edge.resourceId,
            title: siteResearchTitles.titleFor({
              token: edge.token,
              id: edge.resourceId,
              label: edge.label,
            }),
          })),
        },
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
      siteResearchLinks.status,
      siteResearchLinks.error,
      siteResearchEdges,
      siteResearchTitles,
    ],
  );

  /**
   * The whole-page payload, declared ONCE as groomer sections. The Groomer
   * window, the quick pair's Everything payload and its Balanced/Minimal
   * variants all read this one list — a page never maintains two.
   *
   * Resolved when the user opens/clicks, so the sections capture what is on
   * screen at that moment. Every section carries the page's leading KPIs in
   * the shared envelope, so a section payload is never adrift from what the
   * page led with.
   */
  const getGroomerConfig = useCallback((): AgentCopyGroomerConfig => {
    const siteLabel = site ? (site.domain ?? site.name) : "no site";
    const entityRows = entities.data ?? [];
    const partyRows = siteParties.data ?? [];
    const cmsPageList = cmsPages.map?.pages ?? [];
    return {
      label: `Content plan — ${siteLabel}`,
      kind: "content-plan-workspace",
      location: webLocation("Content Plan — workspace"),
      description:
        "The Content Plan workspace for one site: its pages, how they differ from the live website, the website pairing, and the E-E-A-T roster behind them.",
      summary: [
        `Content plan — ${siteLabel}`,
        contentPlanKpiLine(pageKpis),
      ].join("\n"),
      attributes: { site_id: siteId, view, ...pageKpis },
      context: {
        site_domain: site?.domain ?? undefined,
        site_id: siteId ?? undefined,
        view,
        plan_kpis: contentPlanKpiLine(pageKpis),
      },
      sections: [
        {
          id: "overview",
          title: "Overview & counts",
          description: "The numbers this workspace leads with.",
          // Never cuttable: nothing below is interpretable without it.
          build: () => ({
            site: {
              id: siteId,
              domain: site?.domain ?? null,
              name: site?.name ?? null,
              has_brand: site ? site.brand_id !== null : null,
            },
            view,
            kpis: pageKpis,
            kpi_line: contentPlanKpiLine(pageKpis),
          }),
        },
        {
          id: "pages",
          title: "Planned pages",
          description: "Every URL this site should have.",
          levelLabels: {
            full: `All ${nodeRows.length}`,
            compact: "Route, type, status, gaps",
            brief: "Counts only",
          },
          build: (level) => {
            if (level === "brief") {
              return {
                pages_planned: nodeRows.length,
                without_keyword: nodeRows.filter(
                  (node) => !node.primary_keyword_id,
                ).length,
                without_brief: emptyBriefNodes.length,
              };
            }
            if (level === "compact") {
              return nodeRows.map((node) => ({
                route: node.route,
                label: node.label,
                node_type: node.node_type,
                status_id: node.status_id,
                has_keyword: Boolean(node.primary_keyword_id),
                has_brief: Boolean(node.brief && node.brief.length > 0),
              }));
            }
            return nodeRows.map(planNodeKeyFields);
          },
        },
        {
          id: "plan_vs_site",
          title: "Plan vs. the live site",
          description: "What the plan and the real website disagree about.",
          levelLabels: {
            full: `All ${drift.model.items.length}`,
            compact: "One line each",
            brief: "Counts only",
          },
          build: (level) => {
            if (level === "brief") return drift.model.counts;
            if (level === "compact") {
              return {
                counts: drift.model.counts,
                items: drift.model.items.map(driftItemSummary),
              };
            }
            return {
              counts: drift.model.counts,
              is_paired: drift.model.isPaired,
              has_crawl_data: drift.model.hasCrawlData,
              items: drift.model.items,
              unreadable: drift.model.unreadable,
            };
          },
        },
        {
          id: "website",
          title: "The website behind the plan",
          description: "The CMS pairing and what is actually built on it.",
          build: (level) => {
            const base = {
              linked: cmsLink.data?.linked ?? false,
              reason: cmsLink.data?.reason ?? null,
              cms_site_id: resolvedCmsSiteId,
              pages_built: pageKpis.pages_built,
              pages_live: pageKpis.pages_live,
              pages_on_site_not_planned: pageKpis.pages_on_site_not_planned,
            };
            if (level === "full") {
              return { ...base, cms_pages: cmsPageList };
            }
            return base;
          },
        },
        {
          id: "entities",
          title: "People, companies & sources",
          description: "The E-E-A-T roster behind this plan.",
          cuttable: true,
          build: (level) => {
            if (level === "brief") {
              return {
                people_and_companies: partyRows.length,
                sources_and_media: entityRows.length,
              };
            }
            if (level === "compact") {
              return {
                people_and_companies: partyRows.map(
                  (party) => party.display_name,
                ),
                sources_and_media: entityRows.map(planEntitySummary),
              };
            }
            return {
              people_and_companies: partyRows,
              sources_and_media: entityRows,
              // The site NAMES its vertical (`web.site.plan_profile_id`) —
              // say WHICH profile is bound rather than handing over an
              // undifferentiated menu the agent has to guess from.
              profiles: (profiles.data ?? []).map((row) => ({
                ...row,
                is_bound_to_this_site:
                  row.id === (site?.plan_profile_id ?? null),
              })),
            };
          },
        },
        {
          id: "selected_page",
          title: "The page open in the panel",
          description: selectedNode
            ? (selectedNode.route ?? selectedNode.label)
            : "Nothing selected.",
          cuttable: true,
          build: (level) => {
            if (!selectedNode) return null;
            if (level === "brief") return planNodeSummary(selectedNode);
            if (level === "compact") return planNodeKeyFields(selectedNode);
            return selectedNode;
          },
        },
      ],
    };
  }, [
    site,
    siteId,
    view,
    pageKpis,
    nodeRows,
    emptyBriefNodes.length,
    drift.model,
    cmsLink.data,
    resolvedCmsSiteId,
    cmsPages.map,
    entities.data,
    siteParties.data,
    profiles.data,
    selectedNode,
  ]);

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


  const openNewNode = (parentId: string | null) => {
    setNewNodeParentId(parentId);
    setNewNodeOpen(true);
  };

  // ONE resolution path for "which node did you mean" — shared by the
  // select_node WRITE target and the content_plan_focus_node CLIENT TOOL, so
  // there is never a second way to open a node. Throws on bad input; both
  // seams turn a throw into a safe, loud envelope for the agent.
  const requirePlanNode = useCallback(
    (toolName: string, value: unknown): PlanNodeRow => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${toolName} expects a plan node UUID string`);
      }
      const node = nodeById.get(value);
      if (!node) {
        throw new Error(
          `${toolName}: "${value}" is not a node in this plan (see plan_tree)`,
        );
      }
      return node;
    },
    [nodeById],
  );

  // Route → node id, for agents that name a page the way the plan does
  // (routes are trigger-owned derived cache — matched, never recomputed).
  const nodeIdByRoute = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodeRows) {
      if (node.route) map.set(node.route.toLowerCase(), node.id);
    }
    return map;
  }, [nodeRows]);

  // Workspace-level write handler (manifest writeTargets): select_node opens
  // a plan node in the panel — the same UI move as a row/node click. The
  // per-view surfaces (setup/entities/node panel) mount their own nested
  // providers deeper in this tree and win resolution while active.
  // (Declared BEFORE the error early-return — hooks must run every render.)
  const getWriteHandlers = useCallback(
    () => ({
      select_node: (value: unknown) => {
        setSelectedNodeId(requirePlanNode("select_node", value).id);
      },
    }),
    [requirePlanNode],
  );

  // Surface CLIENT TOOLS (manifest clientTools) — the ACTION half of the 360
  // loop. These move the user's VIEW so they can see what the agent is
  // talking about; none of them writes plan data. The dispatcher runs them
  // immediately with no ask dialog, which is why every one of them is a
  // reversible, visible `ui` move and nothing more.
  useSurfaceClientTools(SURFACE_NAME, {
    content_plan_focus_node: (input: unknown) => {
      const args = (input ?? {}) as { node_id?: unknown; route?: unknown };
      const rawId = typeof args.node_id === "string" ? args.node_id.trim() : "";
      const rawRoute = typeof args.route === "string" ? args.route.trim() : "";
      if (Boolean(rawId) === Boolean(rawRoute)) {
        throw new Error(
          'content_plan_focus_node needs exactly one of node_id (a UUID from plan_tree) or route (e.g. "/services/roof-repair").',
        );
      }

      let node: PlanNodeRow;
      if (rawId) {
        node = requirePlanNode("content_plan_focus_node", rawId);
      } else {
        const route = rawRoute.startsWith("/")
          ? rawRoute.toLowerCase()
          : `/${rawRoute.toLowerCase()}`;
        const foundId = nodeIdByRoute.get(route);
        if (!foundId) {
          throw new Error(
            `content_plan_focus_node: no node in this plan has route "${route}" — read the routes from plan_tree, they are database-derived.`,
          );
        }
        node = requirePlanNode("content_plan_focus_node", foundId);
      }

      // Selecting is not seeing: on a view with no node panel the selection
      // would be invisible. Move to the tree first so the focus LANDS.
      const nextView: PlanView = NODE_PANEL_VIEWS.includes(view)
        ? view
        : "tree";
      if (nextView !== view) setView(nextView);
      setSelectedNodeId(node.id);

      return {
        focused: {
          id: node.id,
          label: node.label,
          route: node.route ?? null,
        },
        view: nextView,
      };
    },

    content_plan_switch_view: (input: unknown) => {
      const next = (input ?? {}) as { view?: unknown };
      if (
        typeof next.view !== "string" ||
        !PLAN_VIEWS.includes(next.view as PlanView)
      ) {
        throw new Error(
          `content_plan_switch_view expects view to be one of ${PLAN_VIEWS.join(
            ", ",
          )}; got ${JSON.stringify(next.view)}.`,
        );
      }
      if (!siteId) {
        throw new Error(
          "content_plan_switch_view: no site is open, so the workspace has no views to switch between.",
        );
      }
      setView(next.view as PlanView);
      return { view: next.view };
    },
  });

  // The URL names a site the caller cannot read. `listSiteOptions` is an
  // unfiltered RLS read of every visible site, so once it settles, a routed
  // siteId with no matching row means one of four things — denied, deleted,
  // never existed, or a signed-out session — and this surface cannot tell
  // them apart. It used to render the empty workspace ("Pick a site" + a
  // blank canvas), which is the silent wrong state the Access Gate law
  // forbids. The gate asks the platform and says the true one, with a way
  // forward. (A failed list read lands here too when a site is routed —
  // the gate renders faults honestly with a retry that can work.)
  if (siteId && !site && !sites.isPending) {
    return (
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
        <AccessGate
          token="web_site"
          id={siteId}
          error={sites.error ?? undefined}
          onRetry={() => void sites.refetch()}
          fallbackHref="/marketing/content-plan"
          fallbackLabel="All content plans"
        />
      </div>
    );
  }

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
      <div className="matrx-touch-targets flex h-full flex-col pt-[var(--shell-header-h)]">
        {/* THE page heading. The visible identity is the header's site
          dropdown (a template that documents its label as "never an h1"), so
          the semantic heading lives here and names both the record and the
          view — the thing nine review rejections asked for. */}
        <h1 className="sr-only">
          Content plan for{" "}
          {site ? (site.domain ?? site.name) : "no site selected"} —{" "}
          {VIEW_HEADINGS[view]}
        </h1>
        <RunSetWindowController
          setKey={generate.runSetKey}
          instanceId={`content-plan-generate:${siteId ?? "none"}`}
          label="Generating plan"
          active={generate.run.status === "running"}
        />
        <RunSetWindowController
          setKey={deepen.runSetKey}
          instanceId={`content-plan-deepen:${siteId ?? "none"}`}
          label="Deepening page — brief + sources"
          active={deepen.run.status === "running"}
        />
        <RunSetWindowController
          setKey={bulkDeepen.runSetKey}
          instanceId={`content-plan-bulk-deepen:${siteId ?? "none"}`}
          label="Deepening plan briefs"
          active={bulkDeepen.run.status === "running"}
        />
        {site && !site.brand_id ? (
          <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            No brand assigned — set one in Marketing → Sites.
          </div>
        ) : null}

        {/* THE one chrome row (Arman ruling 2026-08-17): identity + honest
          KPIs, transient run narration in place of the KPIs (never a second
          row), inline assist chips, and one action cluster — generate,
          deepen, the status-truthful Edit/Live pair, and the page-level
          two-icon copy pair (the AI dropdown owns the Groomer). Four stacked
          bars died for this row; do not add a
          new full-width strip here, extend the toolbar. */}
        {siteId && (view === "tree" || view === "table" || view === "map") ? (
          <PlanToolbar
            nodeCount={nodeRows.length}
            run={generate.run}
            onStart={(options) =>
              // Send an explicit topic ONLY when the user picked one this
              // session — otherwise the server reads its own recorded link
              // from the live row, which can never be cache-stale.
              void generate.start({
                ...options,
                researchTopicId: genTopicOverride,
              })
            }
            onDismiss={generate.reset}
            researchTopicId={generateTopicId}
            onResearchTopicChange={handleGenerateTopicChange}
            bulkDeepen={bulkDeepen.run}
            emptyBriefCount={emptyBriefNodes.length}
            onBulkDeepen={() => setBulkDeepenConfirm(true)}
            onBulkDeepenCancel={bulkDeepen.cancel}
            onBulkDeepenDismiss={bulkDeepen.reset}
            cmsLink={usesCmsOverlay ? (cmsLink.data ?? null) : null}
            cmsSiteId={resolvedCmsSiteId}
            pagesLoaded={cmsPages.map !== null}
            pagesByNodeId={cmsPages.pagesByNodeId}
            allPages={cmsPages.map?.pages ?? []}
            siteDomain={site?.domain ?? null}
            onOpenSetup={() => setView("setup")}
            pipelineSlot={
              <SitePipelineStrip
                stages={sitePipeline.pipeline?.stages ?? null}
                isLoading={sitePipeline.isLoading}
                onSelectStage={handlePipelineStage}
              />
            }
            copySlot={
              <>
                <CopyButtons
                  size="icon"
                  label={`Content plan — ${site ? (site.domain ?? site.name) : "site"}`}
                  human={() =>
                    [
                      `Content plan — ${site ? (site.domain ?? site.name) : "site"}`,
                      contentPlanKpiLine(pageKpis),
                      "",
                      ...nodeRows.map(planNodeSummary),
                    ].join("\n")
                  }
                  json={() => nodeRows.map(planNodeKeyFields)}
                  agent={() =>
                    buildGroomerPresetPayload(getGroomerConfig(), "everything")
                  }
                  aiVariants={groomerPresetVariants(getGroomerConfig)}
                  groomer={getGroomerConfig}
                />
              </>
            }
            assistSlot={
              <PlanAssistStrip
                siteId={siteId}
                siteLabel={site ? (site.domain ?? site.name) : null}
                nodeRows={nodeRows}
                pagesByNodeId={cmsPages.pagesByNodeId}
                enabled={
                  !!siteId &&
                  !nodes.isLoading &&
                  !nodes.isError &&
                  nodeRows.length > 0 &&
                  cmsPages.map !== null
                }
                keywordSweepEnabled={
                  !!siteId &&
                  !nodes.isLoading &&
                  !nodes.isError &&
                  nodeRows.length > 0
                }
                className="flex min-w-0 items-center"
              />
            }
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
          ) : view === "ai-runs" ? (
            // Every recorded AI run for this site. A per-page run opens the
            // page it ran for, right here — never a dead end.
            <PlanAiRunsView
              siteId={siteId}
              onOpenNode={(nodeId) => {
                setSelectedNodeId(nodeId);
                setView("tree");
              }}
            />
          ) : view === "table" ? (
            <PlanNodesTable
              nodes={nodeRows}
              isLoading={nodes.isLoading}
              isFetching={nodes.isFetching}
              cmsPageById={cmsPages.pagesByNodeId}
              cmsSiteId={resolvedCmsSiteId}
              measureByWebPageId={measure.byWebPageId}
              pipelineByNodeId={pipelineByNodeId}
              drift={drift.model}
              renderNodePanel={(node, onDeleted) => (
                <NodePanel
                  key={node.id}
                  node={node}
                  siteId={siteId}
                  entities={entities.data ?? []}
                  parties={siteParties.data ?? []}
                  profiles={profiles.data ?? []}
                  boundProfileId={site?.plan_profile_id ?? null}
                  onDeleted={onDeleted}
                  deepen={deepen}
                  cmsPage={cmsPages.pagesByNodeId.get(node.id) ?? null}
                  cmsSiteId={resolvedCmsSiteId}
                  cmsPagesByNodeId={cmsPages.pagesByNodeId}
                  pipelineProgress={pipelineByNodeId.get(node.id) ?? null}
                  pageKpis={pageKpis}
                  hosted
                />
              )}
            />
          ) : view === "map" ? (
            <SiteMap
              nodes={nodeRows}
              statusSlugById={statusSlugById}
              liveById={liveById}
              onSelect={setSelectedNodeId}
              onReparent={handleReparent}
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
              cmsSiteId={resolvedCmsSiteId}
              measureByWebPageId={measure.byWebPageId}
              pipelineByNodeId={pipelineByNodeId}
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
                    cmsSiteId={resolvedCmsSiteId}
                    measureByWebPageId={measure.byWebPageId}
                    pipelineByNodeId={pipelineByNodeId}
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
                      node={selectedNode}
                      siteId={siteId}
                      entities={entities.data ?? []}
                      parties={siteParties.data ?? []}
                      profiles={profiles.data ?? []}
                      boundProfileId={site?.plan_profile_id ?? null}
                      onDeleted={() => setSelectedNodeId(null)}
                      deepen={deepen}
                      cmsPage={
                        cmsPages.pagesByNodeId.get(selectedNode.id) ?? null
                      }
                      cmsSiteId={resolvedCmsSiteId}
                      cmsPagesByNodeId={cmsPages.pagesByNodeId}
                      pipelineProgress={
                        pipelineByNodeId.get(selectedNode.id) ?? null
                      }
                      pageKpis={pageKpis}
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

        {view === "tree" || view === "table" || view === "map" ? (
          <PlanDriftBar
            model={drift.model}
            isLoading={drift.isLoading}
            isRefreshing={drift.isRefreshing}
            onOpen={(filter) => {
              setDriftFilter(filter);
              setDriftOpen(true);
            }}
            onSyncAlignment={() => void drift.syncAlignment()}
          />
        ) : null}

        <PlanDriftSheet
          open={driftOpen}
          onOpenChange={setDriftOpen}
          filter={driftFilter}
          onFilterChange={setDriftFilter}
          drift={drift}
          onOpenNode={(nodeId) => {
            setSelectedNodeId(nodeId);
            setView("tree");
            setDriftOpen(false);
          }}
        />

        {/* Table rows own their window-first detail through MatrxDataTable.
          Map nodes and the mobile tree keep a secondary docked presentation,
          now using the same non-blocking adjustable SidePanelSurface. */}
        {siteId &&
        view !== "table" &&
        (view === "map" || isMobile) &&
        selectedNode ? (
          <SidePanelSurface
            title={selectedNode.label}
            description={selectedNode.route ?? "No route yet"}
            defaultWidth={760}
            onClose={() => setSelectedNodeId(null)}
          >
            {/* The mobile presentation is a portaled Drawer, so it sits
              outside this body's touch-target root and needs its own. */}
            <div className="matrx-touch-targets h-full min-h-0">
              <NodePanel
                key={selectedNode.id}
                node={selectedNode}
                siteId={siteId}
                entities={entities.data ?? []}
                parties={siteParties.data ?? []}
                profiles={profiles.data ?? []}
                boundProfileId={site?.plan_profile_id ?? null}
                onDeleted={() => setSelectedNodeId(null)}
                deepen={deepen}
                cmsPage={cmsPages.pagesByNodeId.get(selectedNode.id) ?? null}
                cmsSiteId={resolvedCmsSiteId}
                cmsPagesByNodeId={cmsPages.pagesByNodeId}
                pipelineProgress={pipelineByNodeId.get(selectedNode.id) ?? null}
                pageKpis={pageKpis}
                hosted
              />
            </div>
          </SidePanelSurface>
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
          description="Runs the research-grounded deepen over every page with an empty brief at once — each gets brief bullets and cited sources written onto the node. Stop cancels every active page stream. Pages that already have a brief are untouched."
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
