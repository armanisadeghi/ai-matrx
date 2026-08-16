"use client";

/**
 * PlanContextPanel — THE canonical read-only view of a plan node's context:
 * what a page was SUPPOSED to be, rendered wherever that page is worked on.
 *
 * This is the BEFORE half of the before/during/after doctrine
 * (docs/handoffs/cms-page-hub.md item 6). It started life inside
 * `features/cms/components/PagePlanTab.tsx` (the CMS editor's Plan tab) and was
 * lifted here the moment a SECOND surface needed it — the measured page's
 * workspace (`features/marketing/components/pages/PageWorkspace.tsx`), where a
 * page is judged against the brief, target keyword, and keyword strategy it was
 * built from. One component, both surfaces: a second copy would drift the day
 * either one improved.
 *
 * READ-ONLY BY DESIGN. Editing a brief / keyword / status stays in the plan
 * workspace's NodePanel — the ONE editor for a plan node (THE CANONICAL
 * COMPONENT LAW). Every section that has nothing to show says so honestly and
 * hands the user the door to the place where it gets filled in.
 */
import Link from "next/link";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import {
  useKeywordLabels,
  useNodeSteps,
  usePlanNode,
  usePlanNodes,
} from "@/features/marketing/content-plan/data/hooks";
import {
  readNodeKeywordStrategy,
  type NodeKeywordStrategy,
} from "@/features/marketing/content-plan/setup/keyword-strategy";
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";
import { buildNodePipelineProgress } from "@/features/marketing/content-plan/lib/pipeline-progress";
import { NodeStepRail } from "@/features/marketing/content-plan/components/NodeStepRail";
import { planStatusColor } from "@/features/marketing/content-plan/constants";

/** The plan workspace href for a node — the door every section falls back to. */
export function planNodeHref(siteId: string, nodeId?: string): string {
  return nodeId
    ? `/marketing/content-plan/${siteId}?node=${nodeId}`
    : `/marketing/content-plan/${siteId}`;
}

/**
 * The page's SEO plan (docs/handoffs/cms-page-hub.md item 4) — the applied
 * keyword strategy from `attributes.keyword_strategy`: the page's role in the
 * site-wide plan, which money routes it feeds, and the internal links the
 * strategist planned so the writer can actually place them.
 */
export function SeoPlanSection({
  planNode,
  siteNodes,
  workspaceHref,
}: {
  planNode: PlanNodeRow;
  siteNodes: readonly PlanNodeRow[];
  workspaceHref: string;
}) {
  // `keyword_strategy` is agent-written jsonb and the reader only proves it is
  // an object — normalize the array/string fields so one malformed record
  // can't take down the whole panel.
  const raw: NodeKeywordStrategy | null = readNodeKeywordStrategy(planNode);
  const strategy = raw
    ? {
        page_role: typeof raw.page_role === "string" ? raw.page_role : "page",
        reason: typeof raw.reason === "string" ? raw.reason : "",
        supports_routes: Array.isArray(raw.supports_routes)
          ? raw.supports_routes.filter((r) => typeof r === "string")
          : [],
        internal_links: Array.isArray(raw.internal_links)
          ? raw.internal_links.filter(
              (l) =>
                l &&
                typeof l === "object" &&
                typeof l.to_route === "string" &&
                typeof l.anchor_text === "string",
            )
          : [],
        secondary_keywords: Array.isArray(raw.secondary_keywords)
          ? raw.secondary_keywords.filter((k) => typeof k === "string")
          : [],
      }
    : null;

  // THE DOOR LAW: a strategy route that IS a plan node opens that node in the
  // plan workspace; a route the plan doesn't know renders as plain text.
  const nodeByRoute = new Map<string, PlanNodeRow>();
  for (const node of siteNodes) {
    if (node.route) nodeByRoute.set(node.route, node);
  }
  const routeDoor = (route: string) => {
    const target = nodeByRoute.get(route);
    return target ? (
      <Link
        href={planNodeHref(target.site_id, target.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-primary underline underline-offset-2"
      >
        {route}
      </Link>
    ) : (
      <span className="font-mono" title="This route is not in the plan">
        {route}
      </span>
    );
  };

  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold text-foreground">SEO plan</h3>
      {strategy ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {strategy.page_role.replace(/[_-]/g, " ")} page
            </Badge>
            {strategy.secondary_keywords.map((phrase) => (
              <Badge key={phrase} variant="outline" className="text-[10px]">
                {phrase}
              </Badge>
            ))}
          </div>
          {strategy.reason ? (
            <p className="text-xs text-muted-foreground">{strategy.reason}</p>
          ) : null}
          {strategy.supports_routes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-foreground">
                Feeds authority to
              </p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {strategy.supports_routes.map((route) => (
                  <li key={route}>{routeDoor(route)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {strategy.internal_links.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-foreground">
                Planned internal links — place these while writing
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {strategy.internal_links.map((link) => (
                  <li
                    key={`${link.to_route}-${link.anchor_text}`}
                    className="flex flex-wrap items-baseline gap-1.5"
                  >
                    <span className="text-foreground">
                      &ldquo;{link.anchor_text}&rdquo;
                    </span>
                    <span aria-hidden="true">&rarr;</span>
                    {routeDoor(link.to_route)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No site-wide keyword strategy has been applied to this page. The
          strategist assigns each page a role, keywords, and planned internal
          links — run it from the{" "}
          <Link
            href={workspaceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            plan workspace
          </Link>
          .
        </p>
      )}
    </section>
  );
}

export function PlanContextPanel({
  planNodeId,
  fallbackSiteId = null,
  intro,
  showPipeline = true,
}: {
  /** `plan.node.id` behind the page being worked on. */
  planNodeId: string;
  /** Plan site to fall back to when the node itself cannot be read. */
  fallbackSiteId?: string | null;
  /** One line naming what this panel is to the surface hosting it. */
  intro?: React.ReactNode;
  /** The pipeline rail (p1…p7). Off where the host already shows progress. */
  showPipeline?: boolean;
}) {
  const node = usePlanNode(planNodeId);
  const planSiteId = node.data?.site_id ?? fallbackSiteId;
  const nodeSteps = useNodeSteps(node.data?.site_id ?? null);
  // Whole-site node list: resolves the SEO plan's routes to real plan nodes so
  // each one is a door, not a string.
  const siteNodes = usePlanNodes(node.data?.site_id ?? null);
  const keywordLabels = useKeywordLabels(
    node.data?.primary_keyword_id ? [node.data.primary_keyword_id] : [],
  );
  const statusCategories = useCategories({
    dimension: CATEGORY_DIMENSIONS.planStatus,
  });

  if (node.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading the plan for this page…</span>
      </div>
    );
  }

  if (node.error || !node.data) {
    return (
      <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          This page points at a plan entry that could not be read.
        </p>
        <p className="text-xs text-muted-foreground">
          {node.error instanceof Error
            ? node.error.message
            : "The plan node may have been deleted, or it belongs to a plan you cannot see."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void node.refetch()}>
            Retry
          </Button>
          {planSiteId ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={planNodeHref(planSiteId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the plan workspace
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const planNode = node.data;
  const status = statusCategories.categories.find(
    (category) => category.id === planNode.status_id,
  );
  const primaryKeyword =
    keywordLabels.data?.find((row) => row.id === planNode.primary_keyword_id)
      ?.phrase ?? null;
  const progress =
    buildNodePipelineProgress(nodeSteps.data ?? []).get(planNode.id) ?? null;
  const workspaceHref = planNodeHref(planNode.site_id, planNode.id);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {planNode.label}
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            {planNode.route ?? "(no planned route)"}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Badge variant="outline" className="gap-1.5 text-[10px]">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  planStatusColor(status?.slug),
                )}
              />
              {status?.name ?? "No status"}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">
              {planNode.node_type}
            </Badge>
            {planNode.priority != null ? (
              <Badge variant="outline" className="text-[10px]">
                Priority {planNode.priority}
              </Badge>
            ) : null}
          </div>
        </div>
        <Button size="sm" className="shrink-0 gap-1.5 text-xs" asChild>
          <Link href={workspaceHref} target="_blank" rel="noopener noreferrer">
            Open in plan workspace
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {intro ? <p className="text-xs text-muted-foreground">{intro}</p> : null}

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold text-foreground">Target keyword</h3>
        {primaryKeyword ? (
          <Badge variant="secondary" className="text-xs">
            {primaryKeyword}
          </Badge>
        ) : keywordLabels.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No target keyword is set for this page.{" "}
            <Link
              href={workspaceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Set one in the plan
            </Link>
            .
          </p>
        )}
      </section>

      <SeoPlanSection
        planNode={planNode}
        siteNodes={siteNodes.data ?? []}
        workspaceHref={workspaceHref}
      />

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold text-foreground">Brief</h3>
        {planNode.brief.length > 0 ? (
          <ul className="list-disc space-y-1 rounded-lg border border-border bg-muted/20 p-4 pl-8 text-sm text-foreground">
            {planNode.brief.map((line, index) => (
              <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            This page has no brief yet.{" "}
            <Link
              href={workspaceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Draft one in the plan
            </Link>
            .
          </p>
        )}
      </section>

      {planNode.meta_title || planNode.meta_description ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-foreground">
            Planned search appearance
          </h3>
          <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-4 text-sm">
            {planNode.meta_title ? (
              <p className="text-foreground">{planNode.meta_title}</p>
            ) : null}
            {planNode.meta_description ? (
              <p className="text-muted-foreground">
                {planNode.meta_description}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showPipeline ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-foreground">Pipeline</h3>
          <NodeStepRail nodeId={planNode.id} progress={progress} />
        </section>
      ) : null}
    </div>
  );
}
