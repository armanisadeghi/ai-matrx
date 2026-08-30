"use client";

/**
 * The canonical deep link to ONE loop run.
 *
 * `platform.shareable_resource_registry` declares `growth_loop_run`'s
 * `url_path_template` as `/marketing/growth-loop/{id}`, so this URL must
 * resolve — it is what a share link, an assist, or a server-side notice hands
 * a user. The loop lives inside the SEO practice on its site (a loop with no
 * site is not a thing), so this route resolves the run to its site and
 * replaces the URL with the canonical brand-first address
 * `/marketing/[brand]/seo/[site]/growth-loop`. A run whose brand cannot be
 * read still gets the flat site shim, which resolves the brand server-side.
 */

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { useSite } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useLoopState } from "@/features/growth-loop/run/hooks";

export default function GrowthLoopRunRedirect({
  params,
}: {
  params: Promise<{ loopRunId: string }>;
}) {
  const { loopRunId } = use(params);
  const router = useRouter();

  const loop = useLoopState(loopRunId);
  const siteId = loop.data?.site_id ?? null;
  // access-errors: ok — redirect resolver only; a failed site read still redirects to the flat site route, where MarketingSiteLayoutClient gates the web_site read
  const site = useSite(siteId ?? "");
  const brandId = site.data?.brand_id ?? null;

  useEffect(() => {
    if (!siteId) return;
    // Wait for the brand only while the site read is still in flight; a site
    // with no brand still has a working flat route.
    if (site.isLoading) return;
    router.replace(
      brandId
        ? marketingRoutes.seoSite(brandId, siteId, "/growth-loop")
        : marketingRoutes.site(null, siteId, "/growth-loop"),
    );
  }, [brandId, router, site.isLoading, siteId]);

  if (loop.isError) {
    return (
      <AccessGate
        token="growth_loop_run"
        id={loopRunId}
        error={loop.error}
        onRetry={() => void loop.refetch()}
        fallbackHref={marketingRoutes.brands()}
        fallbackLabel="All clients"
      />
    );
  }

  return <LoadingSurface label="Opening the growth loop…" />;
}
