import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { VaultRouteHeader } from "@/features/secrets/components/VaultRouteHeader";
import { VaultPage } from "@/features/secrets/components/VaultPage";

/**
 * /vault — Vault, the canonical home for everything the platform signs in
 * with: website logins, API keys, tokens, service accounts.
 *
 * The route the sidebar points at. `/settings/secrets` remains as the
 * settings-shaped entry to the same workspace; both render the ONE
 * `VaultWorkspace` (features/secrets/FEATURE.md) — there is no second
 * implementation.
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
