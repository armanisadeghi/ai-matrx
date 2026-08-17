import { redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { VaultRouteHeader } from "@/features/secrets/components/VaultRouteHeader";
import { VaultWorkspace } from "@/features/secrets/components/VaultWorkspace";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

/**
 * Refined settings entry for the personal Vault.
 *
 * This route deliberately composes the canonical full Vault workspace rather
 * than creating a second credential UI. Search, ownership scope, creation,
 * dotenv import, reveal/copy, and credential editing therefore retain the
 * same service and security path as `/vault`.
 */
export default async function RefinedSecretsSettingsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/settings/secrets-refine");
  }

  return (
    <>
      <PageHeader>
        <VaultRouteHeader />
      </PageHeader>

      <main className="h-full overflow-hidden bg-textured">
        <div className="h-full min-h-0 pt-[var(--shell-header-h)]">
          <VaultWorkspace principal={{ type: "user" }} presentation="full" />
        </div>
      </main>
    </>
  );
}
