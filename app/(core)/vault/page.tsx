import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { VaultRouteHeader } from "@/features/secrets/components/VaultRouteHeader";
import { VaultPage } from "@/features/secrets/components/VaultPage";

export const metadata: Metadata = {
  title: "Vault | AI Matrx",
};

/**
 * /vault — Vault, the canonical home for everything the platform signs in
 * with: website logins, API keys, tokens, service accounts.
 *
 * The route every navigation entry points at. `/settings/secrets` is a
 * compatibility redirect for old bookmarks, so there is only ONE rendered
 * Vault surface and no settings-shaped implementation to drift.
 */
export default async function VaultRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?next=/vault");

  return (
    <>
      <VaultRouteHeader />
      <VaultPage />
    </>
  );
}
