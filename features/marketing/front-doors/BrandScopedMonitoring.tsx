"use client";

/**
 * The brand workspace's Monitoring door — the canonical `MonitoringFrontDoor`,
 * scoped to the brand in context and writing its `?site=` back onto the brand
 * route rather than the flat one.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID), never from the
 * route param — the param is an address and is usually a key.
 *
 * With `?tracker=<id>` the same route is that news monitor's run view.
 */

import { useSearchParams } from "next/navigation";

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { NewsMonitorRunView } from "@/features/marketing/news-monitor/NewsMonitorRunView";

import { MonitoringFrontDoor } from "./MonitoringFrontDoor";

export function BrandScopedMonitoring() {
  const brand = useMarketingBrand();
  const trackerId = useSearchParams().get("tracker");
  // `?tracker=` is one news monitor's run view — the address every digest and
  // alert links to (aidream `services/news/run.py::run_links`).
  if (trackerId) return <NewsMonitorRunView trackerId={trackerId} />;
  return (
    <MonitoringFrontDoor
      brandId={brand.id}
      basePath={marketingRoutes.brandMonitoring(brand.seg)}
    />
  );
}
