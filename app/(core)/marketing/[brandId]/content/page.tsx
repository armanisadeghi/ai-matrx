import { permanentRedirect } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * The Content section's front door. Content is Plan (live) plus Studio
 * (reserved), so the section itself has no screen of its own — it opens the
 * one that does. `permanentRedirect` keeps `/marketing/<brand>/content` a real,
 * shareable address without minting a second empty page.
 */
export default async function BrandContentPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  permanentRedirect(marketingRoutes.brandContentPlan(brandId));
}
