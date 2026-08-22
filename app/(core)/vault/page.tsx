import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
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
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/vault");

  return (
    <>
      <PageHeader>
        <VaultRouteHeader />
      </PageHeader>
      <VaultPage />
    </>
  );
}
