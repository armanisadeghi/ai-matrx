// app/(core)/encore/page.tsx
//
// Encore — the Operator door. Every released Masterwork the user can reach,
// each one Run in a click. (A Masterwork is released from Masterwork Studio.)

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EncoreHomePage } from "@/features/masterwork/encore/EncoreHomePage";
import { loginHref } from "@/utils/auth/auth-destination";

export default async function EncoreRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(loginHref("/encore"));
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-0 p-0">
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Encore
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <EncoreHomePage />
      </div>
    </>
  );
}
