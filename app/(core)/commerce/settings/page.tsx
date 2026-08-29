import { Settings2 } from "lucide-react";
import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ScopedConfigPanel } from "@/features/commerce-config/components/ScopedConfigPanel";

/**
 * /commerce/settings — the org + user tiers of scoped configuration
 * (Code → System → Org → User). Org-admins set the org's overrides; every
 * member sets their own user-scope settings. The platform tier lives at
 * /administration/users/limits (admin-only) — never duplicated here.
 */
export const dynamic = "force-dynamic";

export default async function CommerceSettingsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/commerce/settings");
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">
            Commerce Configuration
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured">
        <div className="mx-auto max-w-4xl px-3 py-4">
          <ScopedConfigPanel />
        </div>
      </div>
    </>
  );
}
