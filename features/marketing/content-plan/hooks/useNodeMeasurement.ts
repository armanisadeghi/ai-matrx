"use client";

/**
 * features/marketing/content-plan/hooks/useNodeMeasurement.ts
 *
 * THE AFTER of one plan node — what the page it became is actually doing on
 * the web (`docs/handoffs/cms-page-hub.md` item 6: before / during / after are
 * all captured, and the *during* surface may never forget the other two).
 *
 * The join is the DURABLE id join, the same one the CMS Measure tab uses:
 *   plan.node → client_pages (plan_node_id) → client_pages.web_page_id → web.page
 * The CMS row is already fetched by `useNodeReality` (it needs the body to tell
 * an empty shell from a draft), so `web_page_id` is free here — this hook adds
 * no CMS read of its own. From the measured page id, `usePageLocation` resolves
 * the site + brand exactly as `CmsPageMeasure` does, and `usePageWorkspace` is
 * the SAME canonical read the page workspace itself renders from (shared query
 * cache — opening the workspace afterwards re-uses this fetch).
 *
 * Every state is honest and distinguishable: no page, unpublished, published
 * but not yet joined to a measured page, joined-and-loading, joined-and-failed,
 * joined-and-measured-but-not-in-Search-Console-yet.
 */
import {
  usePageLocation,
  usePageWorkspace,
} from "@/features/marketing/data/hooks";

import type { CmsPageMapEntry } from "../setup/bridge";
import type { NodeReality } from "./useNodeReality";

/** Which sentence the panel owes the user about this node's AFTER. */
export type NodeMeasurementState =
  | "no-page" // the plan node was never built on the website
  | "unpublished" // built, but nothing public exists to measure
  | "resolving" // published; still reading the CMS row that carries the join
  | "unjoined" // published, but no `web_page_id` — nothing measures it yet
  | "loading" // joined; the measured page is loading
  | "error" // joined; the measured read failed (never rendered as "no data")
  | "measured"; // joined and loaded

export type NodeMeasurement = ReturnType<typeof useNodeMeasurement>;

export function useNodeMeasurement(args: {
  /** The overlay's CMS summary row for this node, or null when unbuilt. */
  cmsPage: CmsPageMapEntry | null;
  /** Owned by NodePanel — carries the full CMS row (and its `web_page_id`). */
  reality: NodeReality;
}) {
  const { cmsPage, reality } = args;
  const isPublished = reality.page?.is_published ?? cmsPage?.isPublished ?? false;
  // Only the FULL CMS row carries the link column; the plan-wide summary does
  // not. Until it lands we say "resolving", never "not joined".
  const webPageId = reality.page?.web_page_id ?? null;

  const location = usePageLocation(webPageId);
  const siteId = location.data?.siteId ?? "";
  // The workspace's own read — same query key, so the numbers here and the
  // numbers inside the mounted workspace can never disagree.
  const workspace = usePageWorkspace(siteId, webPageId ?? "");

  const state: NodeMeasurementState = !cmsPage
    ? "no-page"
    : !isPublished
      ? "unpublished"
      : !webPageId
        ? reality.isLoadingPage
          ? "resolving"
          : "unjoined"
        : location.isError
          ? "error"
          : workspace.isError
            ? "error"
            : workspace.data
              ? "measured"
              : "loading";

  const error = location.error ?? workspace.error ?? null;

  return {
    state,
    webPageId,
    /** The measured page's site — the host context every marketing door needs. */
    siteId: siteId || null,
    brandId: location.data?.brandId ?? null,
    data: workspace.data ?? null,
    error: error as Error | null,
    refetch: () => {
      if (location.isError) void location.refetch();
      else void workspace.refetch();
    },
  };
}

/** One sentence for the human copy payload — the same claim the card makes. */
export function nodeMeasurementSummary(measurement: NodeMeasurement): string {
  switch (measurement.state) {
    case "no-page":
      return "Measured: nothing yet — this page does not exist on the website.";
    case "unpublished":
      return "Measured: nothing yet — this page is not published.";
    case "resolving":
      return "Measured: checking what measures this live page…";
    case "unjoined":
      return "Measured: nothing — this live page is not joined to a crawled page yet.";
    case "loading":
      return "Measured: loading this page's results…";
    case "error":
      return `Measured: could not be read (${measurement.error?.message ?? "unknown error"}).`;
    default: {
      const performance = measurement.data?.searchPerformance;
      const findings = measurement.data?.openFindings ?? 0;
      return performance?.in_gsc
        ? `Measured: ${performance.gsc_clicks_28d ?? 0} clicks / ${performance.gsc_impressions_28d ?? 0} impressions in 28d, average position ${performance.gsc_position_28d?.toFixed(1) ?? "—"}, ${findings} open findings.`
        : `Measured: no Search Console rows for this URL yet, ${findings} open findings.`;
    }
  }
}

/**
 * The measurement half of the panel's what-I-see payload — the same numbers
 * rendered on screen, so an agent handed this node reads its AFTER too.
 */
export function nodeMeasurementPayload(measurement: NodeMeasurement) {
  const performance = measurement.data?.searchPerformance;
  return {
    state: measurement.state,
    web_page_id: measurement.webPageId,
    web_site_id: measurement.siteId,
    error: measurement.error?.message ?? null,
    page_score: measurement.data?.score ?? null,
    failing_checks: measurement.data?.failCount ?? null,
    open_findings: measurement.data?.openFindings ?? null,
    last_captured_at: measurement.data?.latestSnapshot?.captured_at ?? null,
    search_console: performance
      ? {
          in_gsc: performance.in_gsc,
          clicks_28d: performance.gsc_clicks_28d,
          impressions_28d: performance.gsc_impressions_28d,
          position_28d: performance.gsc_position_28d,
        }
      : null,
  };
}
