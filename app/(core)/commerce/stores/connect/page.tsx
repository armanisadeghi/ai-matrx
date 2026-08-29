import { Store } from "lucide-react";
import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { StoreConnectShell } from "@/features/commerce-review/components/StoreConnectShell";

/**
 * /commerce/stores/connect — onboarding + the store-connect shell W6's
 * OAuth routes will fill (UX.md page inventory, V1).
 */
export const dynamic = "force-dynamic";

export default async function CommerceStoreConnectPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/commerce/stores/connect");
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">
            Connect a Store
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <StoreConnectShell />
      </div>
    </>
  );
}
