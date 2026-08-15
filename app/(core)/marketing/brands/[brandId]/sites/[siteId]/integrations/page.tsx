import { redirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export default async function MarketingSiteIntegrationsPage({
  params,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
}) {
  const { brandId, siteId } = await params;
  redirect(marketingRoutes.siteSettings(brandId, siteId, "integrations"));
}
