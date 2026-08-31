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
import type { GscTab } from "@/features/marketing/search-console/types";

/**
 * The per-site Search Console mount, shared by the section route and its four
 * TOOL routes (Dig Here, Insights, Watchlist, New Pages).
 *
 * `SearchConsoleWorkspace` is one workspace with two states — no `?site` is
 * the cross-site portfolio landing, `?site=<uuid>` is the per-site dashboard —
 * so binding the site here means stamping `?site=<uuid>` on the URL, the only
 * way that workspace understands. WHICH TOOL comes from the pathname, which
 * the workspace reads itself: no prop that its own URL writer would contradict.
 *
 * `tool` only tells this server page which path to stamp the site onto.
 */
export async function SiteSearchConsolePage({
  params,
  searchParams,
  tool,
  label,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  tool?: Extract<GscTab, "digs" | "insights" | "watchlist" | "new-pages">;
  label?: string;
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
    const base = marketingRoutes.siteSearchConsole(
      marketingSeg(brand),
      marketingSeg(site),
    );
    redirect(`${tool ? `${base}/${tool}` : base}?${next.toString()}`);
  }

  return (
    <Suspense
      fallback={<LoadingSurface label={label ?? "Loading Search Console…"} />}
    >
      <SearchConsoleGate />
    </Suspense>
  );
}
