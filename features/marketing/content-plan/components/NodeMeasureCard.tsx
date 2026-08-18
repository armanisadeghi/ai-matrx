"use client";

/**
 * features/marketing/content-plan/components/NodeMeasureCard.tsx
 *
 * "What the real page is DOING" — the plan node's AFTER, in the panel where
 * the page is planned (`docs/handoffs/cms-page-hub.md` item 6). Before, during
 * and after are all captured: a planner looking at a live page must not have to
 * remember that measurement exists somewhere else.
 *
 * 🚨 INVENTORY LAW. Nothing here is a second Page Analyzer. The numbers come
 * from `usePageWorkspace` — the SAME read the canonical `PageWorkspace` renders
 * from, on the same query key — and the full AFTER surface is the canonical
 * `CmsPageMeasure` (which mounts `PageWorkspace` wholesale with the site
 * context it needs), opened in a window beside the panel or in a new tab. This
 * file owns exactly one thing: the six-number strip and the honest state
 * sentence for every way the join can be absent.
 */
import { lazy, Suspense, useState } from "react";
import { BarChart3, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cmsPageEditorHref } from "@/features/cms/utils/cmsRoutes";
import {
  displayScore,
  formatCompactDate,
  InlineQueryError,
  MetricCell,
} from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

import type { CmsPageMapEntry } from "../setup/bridge";
import type { NodeMeasurement } from "../hooks/useNodeMeasurement";

/** In-gate lazy: the measured workspace is heavy and opens on user action. */
const CmsPageMeasure = lazy(
  () => import("@/features/cms/components/measure/CmsPageMeasure"),
);

export function NodeMeasureCard({
  measurement,
  cmsPage,
  cmsSiteId,
  nodeLabel,
}: {
  measurement: NodeMeasurement;
  cmsPage: CmsPageMapEntry | null;
  cmsSiteId: string | null;
  nodeLabel: string;
}) {
  const [windowOpen, setWindowOpen] = useState(false);
  const { state, webPageId, siteId, brandId, data } = measurement;

  const workspaceHref =
    webPageId && siteId
      ? marketingRoutes.sitePage(brandId, siteId, webPageId)
      : null;
  const cmsMeasureHref =
    cmsPage && cmsSiteId
      ? `${cmsPageEditorHref(cmsSiteId, cmsPage.pageId)}?tab=measure`
      : null;

  if (state === "no-page") {
    return (
      <Note>Not built yet — measurement starts after publish.</Note>
    );
  }

  if (state === "unpublished") {
    return (
      <Note>
        Not live yet — measurement starts after publish.
        {cmsMeasureHref ? <DoorRow measureHref={cmsMeasureHref} /> : null}
      </Note>
    );
  }

  if (state === "resolving") {
    return (
      <Note>
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking what measures this live page…
        </span>
      </Note>
    );
  }

  if (state === "unjoined") {
    return (
      <Note>
        Not measured yet — waiting for the next site crawl.
        {cmsMeasureHref ? <DoorRow measureHref={cmsMeasureHref} /> : null}
      </Note>
    );
  }

  const performance = data?.searchPerformance ?? null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      {state === "error" ? (
        <InlineQueryError
          what="this page's measurement"
          error={measurement.error}
          onRetry={measurement.refetch}
        />
      ) : state === "loading" ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading what this page is doing…
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-x-3 gap-y-2">
            <MetricCell
              label="Clicks 28d"
              value={performance?.gsc_clicks_28d ?? 0}
            />
            <MetricCell
              label="Impressions 28d"
              value={performance?.gsc_impressions_28d ?? 0}
            />
            <MetricCell
              label="Avg position"
              value={
                performance?.gsc_position_28d == null
                  ? "—"
                  : performance.gsc_position_28d.toFixed(1)
              }
            />
            <MetricCell
              label="Page score"
              value={displayScore(data?.score ?? null)}
              detail={
                data?.failCount ? `${data.failCount} failing checks` : undefined
              }
            />
            <MetricCell
              label="Open findings"
              value={data?.openFindings ?? 0}
              tone={data?.openFindings ? "warning" : "default"}
              // A count is a door: the findings live in the page workspace.
              href={workspaceHref ?? undefined}
            />
            <MetricCell
              label="Last captured"
              value={formatCompactDate(
                data?.latestSnapshot?.captured_at ?? null,
              )}
            />
          </div>
          {performance && !performance.in_gsc ? (
            <p className="text-xs text-muted-foreground">
              No Search Console data yet.
            </p>
          ) : null}
        </>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setWindowOpen(true)}
          title="The full measured page — analyzer, findings, snapshots, Search Console — beside the plan"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Open measurement
        </Button>
        {workspaceHref ? (
          <a
            href={workspaceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Page workspace
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        {cmsMeasureHref ? (
          <a
            href={cmsMeasureHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Measure in CMS
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      {windowOpen && webPageId ? (
        <WindowPanel
          id={`plan-node-measure-${webPageId}`}
          title={`Measurement — ${nodeLabel}`}
          onClose={() => setWindowOpen(false)}
          width="70vw"
          height="82dvh"
          minWidth={420}
          minHeight={320}
          bodyClassName="flex min-h-0 flex-col overflow-auto p-0"
        >
          <Suspense
            fallback={
              <p className="inline-flex items-center gap-1.5 p-4 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading the measured page…
              </p>
            }
          >
            <CmsPageMeasure webPageId={webPageId} />
          </Suspense>
        </WindowPanel>
      ) : null}
    </div>
  );
}

/** The honest states — same chrome as the card, no fake CTA. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2.5">
      <p className="text-xs leading-snug text-muted-foreground">{children}</p>
    </div>
  );
}

function DoorRow({ measureHref }: { measureHref: string }) {
  return (
    <span className="mt-1.5 block">
      <a
        href={measureHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Measure tab in the CMS
        <ExternalLink className="h-3 w-3" />
      </a>
    </span>
  );
}
