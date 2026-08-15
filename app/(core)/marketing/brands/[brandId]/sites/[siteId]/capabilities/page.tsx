import { redirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export default async function MarketingSiteSeoCapabilitiesPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  redirect(marketingRoutes.capabilities(siteId));
}
