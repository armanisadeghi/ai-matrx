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
  // The platform's kits are the ones the system organization publishes. Kits an
  // organization saved for itself are read in the browser, for the organization the
  // person SET (that choice lives client-side).
  let platform: Awaited<ReturnType<typeof fetchKits>>;
  try {
    platform = await fetchKits(supabase, await resolveSystemOrgId(supabase));
  } catch (err) {
    platform = { kits: [], error: err instanceof Error ? err.message : String(err) };
  }
  const { kits, error } = platform;
  return <KitGallery kits={kits} error={error} />;
}
