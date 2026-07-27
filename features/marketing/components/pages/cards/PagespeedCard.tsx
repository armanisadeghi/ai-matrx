"use client";

import { useState } from "react";
import { Gauge, Loader2, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "@/lib/toast";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  marketingKeys,
  usePagePerformance,
} from "@/features/marketing/data/hooks";
import { useQueryClient } from "@tanstack/react-query";
import type { MarketingPage } from "@/features/marketing/types";
import { latestPagespeedByStrategy } from "@/features/marketing/lib/marketing-page-scope";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import {
  CondensedFieldGrid,
  formatDate,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { extractErrorMessage } from "@/utils/errors";
import { syncPagespeed } from "@/features/marketing/pagespeed/data";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

/**
 * PageSpeed Insights (M-74/M-75, WS-12) — runs a REAL PSI collection for this
 * canonical page's URL (POST /seo/pages/{page_id}/pagespeed/sync, detached
 * NDJSON through the canonical run_collection funnel) and renders the
 * persisted seo.page_performance rows: lab (Lighthouse) scores + CWV, and
 * field (CrUX) data when Google has enough real-user traffic for the page.
 * Replaces the former disabled placeholder.
 */
export function PagespeedCard({ page }: { page: MarketingPage }) {
  const queryClient = useQueryClient();
  // Shared query cache — the PageWorkspace surface scope (pagespeed) reads
  // the exact same rows this card renders.
  const performance = usePagePerformance(page.site_id, page.id);
  const rows = performance.data ?? null;
  const loading = performance.isLoading;
  const loadError = performance.isError
    ? extractErrorMessage(performance.error)
    : null;
  const [syncingStrategy, setSyncingStrategy] = useState<
    "mobile" | "desktop" | null
  >(null);

  const runSync = async (strategy: "mobile" | "desktop") => {
    setSyncingStrategy(strategy);
    try {
      await syncPagespeed(page.id, strategy);
      await queryClient.invalidateQueries({
        queryKey: [...marketingKeys.page(page.site_id, page.id), "pagespeed"],
      });
      toast.success(`PageSpeed Insights synced (${strategy})`);
    } catch (error) {
      toast.error("PageSpeed Insights sync failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setSyncingStrategy(null);
    }
  };

  // Same latest-per-strategy selection the surface scope emits.
  const latestByStrategy = latestPagespeedByStrategy(rows);

  const scoreTone = (value: number | null): "good" | "warning" | "bad" | "default" => {
    if (value === null) return "default";
    if (value >= 0.9) return "good";
    if (value >= 0.5) return "warning";
    return "bad";
  };

  return (
    <SectionCard
      title={L.pagespeed}
      collapsible
      anchor="pagespeed"
      headerExtra={
        <div className="flex items-center gap-1">
          {(["mobile", "desktop"] as const).map((strategy) => (
            <button
              key={strategy}
              type="button"
              onClick={() => void runSync(strategy)}
              disabled={syncingStrategy !== null}
              aria-label={`Run PageSpeed Insights (${strategy})`}
              title={`Run a real PageSpeed Insights collection (${strategy})`}
              className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncingStrategy === strategy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {strategy}
            </button>
          ))}
        </div>
      }
      copy={webCopy({
        kind: "web-page-pagespeed",
        label: L.pagespeed,
        description:
          "Persisted Lighthouse lab scores and CrUX field data for this page (desktop + mobile).",
        surface: `PageSpeed Insights — ${page.url}`,
        data: rows ?? [],
        lines: [
          ["URL", page.url],
          ...[...latestByStrategy.entries()].map(([strategy, row]): [string, string] => [
            `${strategy} performance`,
            row.performance_score === null ? "—" : `${Math.round(row.performance_score * 100)}`,
          ]),
        ],
        attributes: { page_id: page.id },
      })}
    >
      <div className="grid gap-3 p-3">
        {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
        {loading && !rows ? (
          <div className="h-32 animate-pulse rounded-md border border-border bg-muted/40" />
        ) : null}
        {!loading && rows && rows.length === 0 ? (
          <div className="flex min-h-28 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">No evidence yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Run a mobile or desktop PageSpeed Insights collection to persist
                lab (Lighthouse) and field (CrUX) evidence for this page.
              </p>
            </div>
          </div>
        ) : null}
        {["mobile", "desktop"].map((strategy) => {
          const row = latestByStrategy.get(strategy);
          if (!row) return null;
          const metrics = row.lighthouse?.metrics ?? {};
          const lcp = metrics.lcp_ms?.numeric_value;
          const cls = metrics.cls?.numeric_value;
          const inp = metrics.inp_ms?.numeric_value;
          const fieldCategory =
            row.crux?.page?.overall_category ?? row.crux?.origin?.overall_category ?? null;
          return (
            <div key={strategy} className="rounded-lg border border-border p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium capitalize text-foreground">
                  {strategy === "mobile" ? (
                    <Smartphone className="h-3.5 w-3.5" />
                  ) : (
                    <Monitor className="h-3.5 w-3.5" />
                  )}
                  {strategy}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(row.observed_at)}
                </span>
              </div>
              <CondensedFieldGrid
                fields={[
                  {
                    label: "Performance",
                    value:
                      row.performance_score === null
                        ? "—"
                        : Math.round(row.performance_score * 100),
                    tone: scoreTone(row.performance_score),
                  },
                  {
                    label: "Accessibility",
                    value:
                      row.accessibility_score === null
                        ? "—"
                        : Math.round(row.accessibility_score * 100),
                    tone: scoreTone(row.accessibility_score),
                  },
                  {
                    label: "Best practices",
                    value:
                      row.best_practices_score === null
                        ? "—"
                        : Math.round(row.best_practices_score * 100),
                    tone: scoreTone(row.best_practices_score),
                  },
                  {
                    label: "SEO",
                    value: row.seo_score === null ? "—" : Math.round(row.seo_score * 100),
                    tone: scoreTone(row.seo_score),
                  },
                  {
                    label: "LCP (lab)",
                    value:
                      typeof lcp === "number" ? `${(lcp / 1000).toFixed(2)}s` : "—",
                  },
                  {
                    label: "CLS (lab)",
                    value: typeof cls === "number" ? cls.toFixed(3) : "—",
                  },
                  {
                    label: "INP (lab)",
                    value: typeof inp === "number" ? `${Math.round(inp)}ms` : "—",
                  },
                  {
                    label: "Field data (CrUX)",
                    value: fieldCategory ?? "Not available",
                    tone: fieldCategory === "FAST" ? "good" : "default",
                  },
                ]}
              />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
