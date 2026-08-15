import { redirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export default async function MarketingSiteDiscoveryPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  redirect(marketingRoutes.brandDiscovery(brandId));
}
