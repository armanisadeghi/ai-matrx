import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SearchConsoleGate } from "@/features/marketing/search-console/components/SearchConsoleGate";
import { marketingSeg } from "@/features/marketing/lib/keys";
import {
  resolveBrandParam,
  resolveSiteParam,
} from "@/features/marketing/lib/keys-server";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * The full Search Console dataset for THIS site.
 *
 * `SearchConsoleWorkspace` is one workspace with two states — no `?site` is
 * the cross-site portfolio landing, `?site=<uuid>` is the per-site dashboard —
 * and it keeps every other view (tab, range, compare, filters) in the query
 * string of whatever path it is mounted on. So this route binds the site the
 * only way that workspace understands, by stamping `?site=<uuid>` on the URL,
 * and leaves the rest of its state alone. No second renderer, no prop that the
 * workspace's own URL writer would immediately contradict.
 */
export default async function MarketingSeoSearchConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ brandId, siteId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const brand = await resolveBrandParam(brandId);
  if (!brand) notFound();
  const site = await resolveSiteParam(brand.id, siteId);
  if (!site) notFound();

  if (query.site !== site.id) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "site" || value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) next.append(key, item);
      } else {
        next.set(key, value);
      }
    }
    next.set("site", site.id);
    redirect(
      `${marketingRoutes.siteSearchConsole(
        marketingSeg(brand),
        marketingSeg(site),
      )}?${next.toString()}`,
    );
  }

  return (
    <Suspense fallback={<LoadingSurface label="Loading Search Console…" />}>
      <SearchConsoleGate />
    </Suspense>
  );
}
