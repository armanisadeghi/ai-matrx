"use client";

/**
 * `/marketing/cost` — what marketing execution actually costs.
 *
 * This page used to carry TWO views: a "Runtime cost" rollup table read from
 * `web.v_cost_by_site` / `web.v_cost_by_client`, and "Provider spend" read from
 * aidream `GET /seo/spend/summary`. The runtime half was retired on 2026-08-11
 * (FOUND_DEFECTS D149): its whole projection hung off `web.batch_item`, a spine
 * that never had a producer — 16,236 `web.analysis_result` rows carry ZERO
 * `batch_id`, and `runtime.global_execution` has never recorded a single
 * `web_batch_item` link — and the relations were dropped from the live database
 * when execution moved to the canonical `batch.*` subsystem. Provider spend is
 * the live, populated cost surface, so it is now the page.
 *
 * Platform batch execution state is monitored at
 * `/administration/knowledge/kg-cost`, over the canonical `batch.*` tables.
 */

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingScope } from "@/features/surfaces/manifests/marketing.manifest";
import { SeoSpendPanel } from "@/features/marketing/components/operations/SeoSpendPanel";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";

export function WorkspaceCostWorkspace() {
  // Surface scope — the panel owns its own data, so the hub scope reports only
  // which view is open rather than restating rows it does not hold.
  const getHubScope = () =>
    createMarketingScope({ hub_view: "cost", cost_view: "seo_spend" });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing"
      getScope={getHubScope}
    >
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Marketing Cost
          </h1>
        }
        center={<MarketingWorkspaceNav />}
      />
      <main className="flex h-full flex-col gap-2 overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <div className="min-h-0 flex-1">
          <SeoSpendPanel />
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}
