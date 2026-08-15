import { redirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function MarketingSiteAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ brandId, siteId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const raw = query.view ?? query.tab;
  const legacyView = Array.isArray(raw) ? raw[0] : raw;
  const view =
    legacyView === "organizations"
      ? "access-organizations"
      : legacyView === "public"
        ? "access-public"
        : "access-users";
  redirect(marketingRoutes.siteSettings(brandId, siteId, view));
}
