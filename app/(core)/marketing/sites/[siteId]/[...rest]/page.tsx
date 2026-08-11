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
import { AccessGate } from "@/features/access-gate/components/AccessGate";
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

  // The read failed, or came back empty. Same four possibilities as anywhere
  // else — the gate resolves which, names the site and its owner, and offers a
  // request. It also handles the "you DO have access, that was a blip" case
  // that a hand-written error can never tell you about.
  if (site.isError || (!site.isLoading && !site.data)) {
    return (
      <AccessGate
        token="web_site"
        id={siteId}
        error={site.error}
        onRetry={() => void site.refetch()}
        fallbackHref="/marketing/sites"
        fallbackLabel="All sites"
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
