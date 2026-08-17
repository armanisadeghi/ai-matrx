import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { VaultReimagineClient } from "./VaultReimagineClient";

export default async function SecretsReimaginePage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/settings/secrets-reimagine");
  }

  return <VaultReimagineClient />;
}
