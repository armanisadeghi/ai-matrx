// app/(core)/make/page.tsx — THE MOUNT for /make (lane MAKE-HOME). The page is
// `features/make/MakeHome.tsx`; this server component only reads the platform's own kits (the
// system organization's, the same read /kits makes) and hands them down.

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import { fetchKits } from "@/features/kits/service";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import MakeHome from "@/features/make/MakeHome";
import type { KitEntry } from "@/features/kits/types";

export default async function MakePage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/make"));
  const supabase = await createClient();
  let platformKits: KitEntry[] = [];
  let platformOrganizationId: string | null = null;
  try {
    // org-fallback-deliberate: the platform's own kits are read from the platform's organization by name, not a stand-in for the person's
    platformOrganizationId = await resolveSystemOrgId(supabase);
    const read = await fetchKits(supabase, platformOrganizationId);
    platformKits = read.error ? [] : read.kits;
  } catch (err) {
    console.error("[/make] platform kits read failed:", err);
  }
  return <MakeHome platformKits={platformKits} platformOrganizationId={platformOrganizationId} />;
}
