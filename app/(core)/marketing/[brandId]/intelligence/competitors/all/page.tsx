// app/(core)/marketing/[brandId]/intelligence/competitors/all/page.tsx
//
// "All" is the bare Competitors route now; this URL only forwards to it.

import { permanentRedirect } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";

export default async function BrandCompetitorsAllPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  permanentRedirect(marketingRoutes.brandCompetitors(brandId));
}
