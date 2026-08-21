import { redirect } from "next/navigation";

/**
 * Keyword Value workbench — bake-off default route.
 * Four live variants exist at ./a ./b ./c ./d (ui-bakeoff, 2026-08-21);
 * this default forwards to the CURRENT WINNER. Update the target when a
 * winner is ruled; kill the losers later (they are live on purpose — real
 * data, real everything, per Arman's bake-off doctrine).
 */
export default async function ValueWorkbenchDefault({
  params,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
}) {
  const { brandId, siteId } = await params;
  redirect(`/marketing/brands/${brandId}/sites/${siteId}/value/c`);
}
