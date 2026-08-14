"use client";

/** `/marketing/ranks` — scoped, server-paged cross-site rank hub. */

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingRanksHubScope } from "@/features/surfaces/manifests/marketing-ranks-hub.manifest";
import { RANK_HISTORY_DAYS } from "./cross-site-data";
import { crossSiteRankListConfig } from "./cross-site-list-config";
import { getCrossSiteRankRuntime } from "./cross-site-runtime";

export function CrossSiteRanksHub() {
  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-ranks-hub"
      getScope={() => {
        const runtime = getCrossSiteRankRuntime();
        const active = runtime.rows.filter((row) => row.is_active);
        return createMarketingRanksHubScope({
          portfolio_summary: {
            scope: runtime.query.scope,
            total_targets: runtime.total,
            loaded_targets: runtime.rows.length,
            loaded_sites: new Set(
              runtime.rows.map((row) => row.site_id).filter(Boolean),
            ).size,
            improved_on_page: active.filter((row) => (row.movement ?? 0) > 0)
              .length,
            declined_on_page: active.filter((row) => (row.movement ?? 0) < 0)
              .length,
          },
          rank_portfolio: runtime.rows,
          history_window_days: RANK_HISTORY_DAYS,
          portfolio_load_error: runtime.error ?? undefined,
        });
      }}
    >
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Rank Tracking
          </h1>
        }
        center={<MarketingWorkspaceNav />}
      />
      <main
        data-surface-value="rank_portfolio"
        className="h-full overflow-hidden bg-textured"
      >
        <span data-surface-value="portfolio_summary" className="sr-only">
          Scoped rank portfolio
        </span>
        <EntityListPage config={crossSiteRankListConfig} />
      </main>
    </SurfaceRuntimeProvider>
  );
}
