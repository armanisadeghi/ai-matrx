import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import { fetchKits } from "@/features/kits/service";
import { KitGallery } from "@/features/kits/components/KitGallery";

/** /kits — the gallery. Kits are catalog rows; the read is a plain Supabase read. */
export default async function KitsPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/kits"));
  const { kits, error } = await fetchKits(await createClient());
  return <KitGallery kits={kits} error={error} />;
}
