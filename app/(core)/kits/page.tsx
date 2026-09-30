import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import { fetchKits } from "@/features/kits/service";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { KitGallery } from "@/features/kits/components/KitGallery";

/** /kits — the gallery. Kits are catalog rows; the read is a plain Supabase read. */
export default async function KitsPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/kits"));
  const supabase = await createClient();
  // The platform's kits are the ones the system organization publishes. Kits the
  // person's organizations saved are read in the browser across ALL of them.
  let platform: Awaited<ReturnType<typeof fetchKits>>;
  let platformOrganizationId: string | null = null;
  try {
    platformOrganizationId = await resolveSystemOrgId(supabase);
    platform = await fetchKits(supabase, platformOrganizationId);
  } catch (err) {
    platform = { kits: [], error: err instanceof Error ? err.message : String(err) };
  }
  const { kits, error } = platform;
  return <KitGallery kits={kits} error={error} platformOrganizationId={platformOrganizationId} />;
}
