"use client";

// LEGACY URL shim for the bare /marketing/sites/[siteId] path — see
// ./[...rest]/page.tsx for the sub-path variant and the rationale.

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
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const site = useSite(siteId);
  const brandId = site.data?.brand_id ?? null;

  useEffect(() => {
    if (!brandId) return;
    const query = searchParams.toString();
    router.replace(
      `${marketingRoutes.site(brandId, siteId)}${query ? `?${query}` : ""}`,
    );
  }, [brandId, router, searchParams, siteId]);

  if (site.isError) {
    return (
      <QueryError
        error={site.error ?? new Error("Site not found")}
        onRetry={() => void site.refetch()}
      />
    );
  }
  return <LoadingSurface label="Opening site…" />;
}
