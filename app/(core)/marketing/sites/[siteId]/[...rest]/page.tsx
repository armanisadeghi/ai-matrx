"use client";

/**
 * LEGACY URL shim. The canonical site URL is brand-first:
 * /marketing/brands/[brandId]/sites/[siteId]/... — this client route resolves
 * the site's brand under the caller's own session (browser ↔ Supabase, per
 * the feature doctrine) and replaces the URL with the canonical location.
 * Old bookmarks and cross-links built from rows that only know site_id keep
 * working forever.
 */

import { use, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSite } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";

export default function LegacySiteRedirect({
  params,
}: {
  params: Promise<{ siteId: string; rest?: string[] }>;
}) {
  const { siteId, rest } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const site = useSite(siteId);
  const brandId = site.data?.brand_id ?? null;

  useEffect(() => {
    if (!brandId) return;
    const suffix = rest?.length ? `/${rest.join("/")}` : "";
    const query = searchParams.toString();
    router.replace(
      `${marketingRoutes.site(brandId, siteId)}${suffix}${query ? `?${query}` : ""}`,
    );
  }, [brandId, rest, router, searchParams, siteId]);

  if (site.isError) {
    return (
      <QueryError
        error={site.error ?? new Error("Site not found")}
        onRetry={() => void site.refetch()}
      />
    );
  }
  if (site.data && !site.data.brand_id) {
    return (
      <QueryError
        error={
          new Error(
            "This site has no brand link — a data integrity bug. Report it.",
          )
        }
      />
    );
  }
  return <LoadingSurface label="Opening site…" />;
}
