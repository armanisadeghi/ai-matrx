import { redirect } from "next/navigation";

/**
 * Retired bake-off variant "b" (2026-08-21 → 2026-08-22).
 *
 * Four variants ran live on real data; C won and became the one workbench at
 * `../` (`features/marketing/seo/value-system/workbench/`). A, B and D were
 * deleted rather than left rendering a version of this feature that had stopped
 * being true — git keeps them. This route survives only so a bookmark from the
 * bake-off week still lands on the real workbench.
 */
export default async function RetiredValueVariantBPage({
  params,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
}) {
  const { brandId, siteId } = await params;
  redirect(`/marketing/brands/${brandId}/sites/${siteId}/value`);
}
