"use client";

// LEGACY URL shim for the bare /marketing/sites/[siteId] path — see
// ./[...rest]/page.tsx for the sub-path variant and the rationale.

import { use, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSite } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

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
  return <LoadingSurface label="Opening site…" />;
}
