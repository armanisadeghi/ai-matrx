import { permanentRedirect } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * The Intelligence section's front door. Intelligence is three real screens —
 * Competitors, Monitoring, Reputation — and the sidebar links each of them
 * directly, so the section segment has no screen of its own. It opens the
 * first one instead of minting an empty index.
 */
export default async function BrandIntelligencePage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  permanentRedirect(marketingRoutes.brandCompetitors(brandId));
}
