import { Suspense } from "react";
import { redirect } from "next/navigation";

import { SiteMediaWorkspace } from "@/features/marketing/components/media/SiteMediaWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import {
  isMarketingBrandAssetsView,
  marketingRoutes,
} from "@/features/marketing/lib/routes";

/**
 * The website's media desk — Crawled, Videos, Standards.
 *
 * Library / Research / Sources / Generate moved to the brand's asset desk on
 * 2026-08-15 (all four read brand- or org-scoped data, so this route rendered
 * the same rows for every site under one brand). Their `?view=` values are
 * redirected rather than dropped: old links, bookmarks, and agent-held URLs
 * must still land somewhere correct — the same contract the Discovery move
 * kept when it left `/sites/[siteId]/discovery` behind as a redirect.
 *
 * `?tab=` is read as the same legacy alias `useMarketingSubView` honours.
 */
export default async function MarketingSiteMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ brandId }, query] = await Promise.all([params, searchParams]);
  const raw = query.view ?? query.tab;
  const view = Array.isArray(raw) ? raw[0] : raw;
  if (isMarketingBrandAssetsView(view)) {
    redirect(marketingRoutes.brandAssets(brandId, view));
  }
  return (
    <Suspense fallback={<LoadingSurface label="Loading site media…" />}>
      <SiteMediaWorkspace />
    </Suspense>
  );
}
