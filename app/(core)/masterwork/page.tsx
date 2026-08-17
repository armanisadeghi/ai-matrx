// app/(core)/masterwork/page.tsx
//
// Masterwork Studio LIST page — the Expert's home for their Rulebooks.
// Canonical entity-list shell over platform.rulebook.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MasterworkStudioPage } from "@/features/masterwork/browse/components/MasterworkStudioPage";
import { loginHref } from "@/utils/auth/auth-destination";

export default async function MasterworkStudioRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(loginHref("/masterwork"));
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-0 p-0">
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Masterwork Studio
          </h1>
        </div>
      </PageHeader>
      <MasterworkStudioPage />
    </>
  );
}
