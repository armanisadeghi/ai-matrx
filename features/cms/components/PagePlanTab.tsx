"use client";

/**
 * PagePlanTab — the BEFORE half of the CMS page hub (docs/handoffs/cms-page-hub.md W1).
 *
 * "Just because some step happens before we get here doesn't mean we forget it
 * once we're here." A CMS page realized from a content plan carries
 * `client_pages.plan_node_id`; this tab makes that node's context (label,
 * route, status, brief, target keyword, pipeline steps) visible where the page
 * is actually edited, and gives the node a real door into the plan workspace.
 *
 * READ-FOCUSED BY DESIGN. Editing a brief/keyword/status stays in the plan
 * workspace's NodePanel — the ONE editor for a plan node. Duplicating those
 * editors here would fork the canonical component (THE CANONICAL COMPONENT
 * LAW). The one write this tab owns is the thing the plan workspace cannot do
 * from here: adopting a plan-less page into the plan.
 *
 * Plan reads go DIRECT to Supabase (`content-plan/data/service.ts`); the adopt
 * is real server work behind aidream's `cms_align` (`setup/bridge.ts`).
 */
import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Map as MapIcon,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import {
  useKeywordLabels,
  useNodeSteps,
  usePlanNode,
} from "@/features/marketing/content-plan/data/hooks";
import { buildNodePipelineProgress } from "@/features/marketing/content-plan/lib/pipeline-progress";
import { NodeStepRail } from "@/features/marketing/content-plan/components/NodeStepRail";
import { planStatusColor } from "@/features/marketing/content-plan/constants";
import { bridgeAdopt } from "@/features/marketing/content-plan/setup/bridge";
import type { ClientPage, ClientSite } from "@/features/cms/types";

interface PagePlanTabProps {
  page: ClientPage;
  site: ClientSite;
  /** Reload the CMS page row — after an adopt it carries a `plan_node_id`. */
  onPageChanged: () => void | Promise<void>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-6">{children}</div>
    </div>
  );
}

/** The page IS in a plan — show its node and open the door to the workspace. */
function LinkedPlanNode({
  planNodeId,
  fallbackSiteId,
}: {
  planNodeId: string;
  fallbackSiteId: string | null;
}) {
  const node = usePlanNode(planNodeId);
  const planSiteId = node.data?.site_id ?? fallbackSiteId;
  const nodeSteps = useNodeSteps(node.data?.site_id ?? null);
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
                href={`/marketing/content-plan/${planSiteId}`}
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
  const workspaceHref = `/marketing/content-plan/${planNode.site_id}?node=${planNode.id}`;

  return (
    <>
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

      <p className="text-xs text-muted-foreground">
        This page was planned before it was built. The brief, target keyword,
        and status below are edited in the plan workspace — this tab shows what
        the page is supposed to be while you write it.
      </p>

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

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold text-foreground">Pipeline</h3>
        <NodeStepRail nodeId={planNode.id} progress={progress} />
      </section>
    </>
  );
}

/** No plan node yet, but the site IS paired — offer the real adopt. */
function AdoptIntoPlan({
  page,
  webSiteId,
  onPageChanged,
}: {
  page: ClientPage;
  webSiteId: string;
  onPageChanged: () => void | Promise<void>;
}) {
  const dispatch = useAppDispatch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The server's own per-item lines — shown verbatim, never summarized away. */
  const [resultLines, setResultLines] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  const runAdopt = async () => {
    setBusy(true);
    setResultLines(null);
    setFailed(false);
    try {
      const result = await bridgeAdopt(dispatch, webSiteId, [page.id], {
        dryRun: false,
      });
      const lines = [
        ...result.items.map((item) =>
          [
            item.action,
            item.ok ? (item.changed ? "applied" : "no change") : "failed",
            item.detail || null,
            item.error || null,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
        ...result.errors,
      ];
      setResultLines(
        lines.length > 0
          ? lines
          : ["The server returned no per-item detail for this run."],
      );
      setFailed(result.failed > 0);
      setConfirmOpen(false);
      await onPageChanged();
    } catch (error) {
      setResultLines([
        error instanceof Error
          ? error.message
          : "The adopt call failed with an unreadable error.",
      ]);
      setFailed(true);
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-3 rounded-lg border border-dashed border-border p-5">
        <h2 className="text-sm font-semibold text-foreground">
          This page isn&apos;t in the content plan
        </h2>
        <p className="text-xs text-muted-foreground">
          It was built directly in the CMS, so there is no brief, target
          keyword, or pipeline history behind it. Creating a plan entry adopts
          the live page at{" "}
          <span className="font-mono">{page.route ?? `/${page.slug}`}</span> into
          this site&apos;s plan — nothing about the page itself changes, and the
          plan becomes where its brief and keyword live from now on.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Create plan entry
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
            <Link
              href={`/marketing/content-plan/${webSiteId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the plan workspace
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {resultLines ? (
        <div
          className={cn(
            "space-y-1 rounded-lg border p-4",
            failed
              ? "border-destructive/30 bg-destructive/5"
              : "border-border bg-muted/20",
          )}
        >
          <p className="text-xs font-semibold text-foreground">
            {failed ? "The plan entry was not created" : "Server result"}
          </p>
          {resultLines.map((line, index) => (
            <p
              key={`${index}-${line.slice(0, 24)}`}
              className="font-mono text-[11px] leading-relaxed text-muted-foreground"
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !busy && setConfirmOpen(open)}
        title="Create a plan entry for this page?"
        description="A planned page is created at this page's route and linked to it. The page's content, route, and published state are untouched."
        confirmLabel="Create plan entry"
        busy={busy}
        onConfirm={runAdopt}
      />
    </>
  );
}

export default function PagePlanTab({
  page,
  site,
  onPageChanged,
}: PagePlanTabProps) {
  if (page.plan_node_id) {
    return (
      <Shell>
        <LinkedPlanNode
          planNodeId={page.plan_node_id}
          fallbackSiteId={site.web_site_id}
        />
      </Shell>
    );
  }

  if (site.web_site_id) {
    return (
      <Shell>
        <AdoptIntoPlan
          page={page}
          webSiteId={site.web_site_id}
          onPageChanged={onPageChanged}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-3 rounded-lg border border-dashed border-border p-5">
        <h2 className="text-sm font-semibold text-foreground">
          This site isn&apos;t paired with a content plan
        </h2>
        <p className="text-xs text-muted-foreground">
          A content plan is where a site&apos;s pages are decided before they
          are built — the brief, the target keyword, and the pipeline that turns
          them into pages. Pairing happens once, in the plan workspace: open (or
          create) the plan for <span className="font-medium">{site.name}</span>{" "}
          and link it to this CMS site. After that, every page here can carry
          its plan.
        </p>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
          <Link
            href="/marketing/content-plan"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapIcon className="h-3.5 w-3.5" />
            Open content plans
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Shell>
  );
}
