import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import { fetchKit } from "@/features/kits/service";
import { KitInstalled } from "@/features/kits/components/KitInstalled";
import { KitMissing } from "@/features/kits/components/KitMissing";

/** /kits/[key]/installed — the kit as it exists in the organization the person set. */
export default async function KitInstalledPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref(`/kits/${key}/installed`));
  const { kit, error } = await fetchKit(await createClient(), key);
  if (!kit) return <KitMissing kitKey={key} error={error} />;
  return <KitInstalled kit={kit} />;
}
