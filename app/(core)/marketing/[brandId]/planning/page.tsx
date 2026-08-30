import { permanentRedirect } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * The Planning section's front door. Planning is Initiatives (live) plus the
 * Calendar (reserved), so the section segment has no screen of its own — it
 * opens the one that does instead of minting an empty index.
 */
export default async function BrandPlanningPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  permanentRedirect(marketingRoutes.brandInitiatives(brandId));
}
