import { redirect } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";

/** `/socials` opens its first tab (a temporary redirect, never a cached 308). */
export default async function BrandSocialsPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  redirect(`${marketingRoutes.brandSocials(brandId)}/accounts`);
}
